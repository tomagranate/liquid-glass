import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { By, Key, until } from "selenium-webdriver";
import {
  BACKEND_CASES,
  DEMO_CASES,
  severeBrowserLogs,
  validateDemoSnapshot,
} from "./lib/demo-tour-analysis.mjs";
import { startStaticServer } from "./lib/static-server.mjs";
import { assertBrand, createBrandedDriver } from "./lib/webdriver.mjs";
import { assertRenderPreflight } from "./lib/render-preflight.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const browser = args.browser || "chrome";
const root = resolve(import.meta.dirname, "..");
const demoRoot = join(root, "examples/demo/dist");
const artifactRoot = resolve(
  args.artifacts || join(root, "artifacts/demo-tour", browser),
);
await mkdir(artifactRoot, { recursive: true });

const summary = {
  browser,
  cases: [],
  interactions: [],
  failures: [],
};
let environment = {
  browserRequested: browser,
  driver: "W3C WebDriver",
};
let browserLogEntries = [];
let driverLog = "";
let driver;
let service;
let server;
const displayGuard =
  process.platform === "darwin"
    ? spawn("/usr/bin/caffeinate", ["-d", "-i", "-w", String(process.pid)], {
        stdio: "ignore",
      })
    : null;

async function verifyDemoBuild() {
  const html = await readFile(join(demoRoot, "index.html"), "utf8");
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
    .map((match) => match[1])
    .filter((asset) => !/^https?:\/\//.test(asset));
  if (!assets.some((asset) => asset.endsWith(".js"))) {
    throw new Error("Production demo build has no JavaScript entry artifact");
  }
  for (const asset of assets) {
    const source = await readFile(
      join(demoRoot, asset.replace(/^\//, "")),
      "utf8",
    );
    if (/\.\.\/\.\.\/src\/|\/src\/react\/index\.tsx/.test(source)) {
      throw new Error(
        `Production demo artifact ${asset} bypasses package exports with a source import`,
      );
    }
  }
  return assets;
}

async function takeScreenshot(name) {
  const png = await driver.takeScreenshot();
  await writeFile(join(artifactRoot, name), Buffer.from(png, "base64"));
}

async function awaitVisibleRenderPreflight() {
  const deadline = Date.now() + 8_000;
  const failures = [];
  while (Date.now() < deadline) {
    try {
      const result = await assertRenderPreflight(driver, browser);
      environment.renderPreflightAttempts = failures.length + 1;
      return result;
    } catch (error) {
      failures.push(String(error?.message || error));
      if (Date.now() >= deadline) break;
      await driver.sleep(250);
    }
  }
  throw new Error(
    `Render preflight did not produce one visible, rAF-delivering sample within 8s. Last failure: ${failures.at(-1)}`,
  );
}

async function scrollTo(element) {
  await driver.executeScript(
    "arguments[0].scrollIntoView({block:'center', inline:'center', behavior:'instant'})",
    element,
  );
  await driver.wait(
    async () =>
      driver.executeScript(
        `const rect=arguments[0].getBoundingClientRect();
         return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;`,
        element,
      ),
    3_000,
  );
  await driver.sleep(100);
}

async function readBackend(element) {
  return driver.executeScript(
    `
      const root = arguments[0];
      const elements = [
        ...(root.matches("[data-lg-backend]") ? [root] : []),
        ...root.querySelectorAll("[data-lg-backend]"),
      ];
      return [...new Set(elements.flatMap((node) =>
        (node.dataset.lgBackend || "").split(",").filter(Boolean)
      ))];
    `,
    element,
  );
}

async function readPageSnapshot(backends) {
  return driver.executeScript(
    `
      const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
      const counts = ids.reduce((all, id) => {
        all[id] = (all[id] || 0) + 1;
        return all;
      }, {});
      const reducedMotionRule = [...document.styleSheets].some((sheet) => {
        let rules;
        try { rules = [...sheet.cssRules]; } catch { return false; }
        return rules.some((rule) =>
          String(rule.conditionText || "").includes("prefers-reduced-motion: reduce") &&
          String(rule.cssText || "").includes("animation-duration") &&
          String(rule.cssText || "").includes("transition-duration")
        );
      });
      const selectorFor = (node) => {
        if (node.id) return "#" + node.id;
        const label = node.getAttribute("aria-label");
        return label
          ? node.tagName.toLowerCase() + '[aria-label="' + label + '"]'
          : node.outerHTML.slice(0, 120);
      };
      const controls = [...document.querySelectorAll("button,input,select,textarea")];
      const hasName = (node) => {
        const labelledBy = node.getAttribute("aria-labelledby");
        return Boolean(
          node.getAttribute("aria-label")?.trim() ||
          (labelledBy && labelledBy.split(/\\s+/).some((id) => document.getElementById(id)?.textContent.trim())) ||
          [...(node.labels || [])].some((label) => label.textContent.trim()) ||
          (node.tagName === "BUTTON" && node.textContent.trim()) ||
          node.getAttribute("title")?.trim()
        );
      };
      return {
        cases: [...document.querySelectorAll("[data-demo-case]")]
          .map((node) => node.dataset.demoCase),
        duplicateIds: Object.entries(counts)
          .filter(([, count]) => count > 1)
          .map(([id]) => id),
        unnamedControls: controls.filter((node) => !hasName(node)).map(selectorFor),
        inputsWithoutName: controls
          .filter((node) => node.tagName === "INPUT" && !node.getAttribute("name"))
          .map(selectorFor),
        densityLenses: document.querySelectorAll(
          '[data-demo-case="density-32-lenses"] [data-lg-backend]'
        ).length,
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        viewportWidth: innerWidth,
        reducedMotionRule,
        reducedMotionPreference: matchMedia("(prefers-reduced-motion: reduce)").matches,
        backends: arguments[0],
      };
    `,
    backends,
  );
}

async function assertKeyboardInteraction(selector, key, attribute, label) {
  const element = await driver.findElement(By.css(selector));
  await scrollTo(element);
  const before = await element.getAttribute(attribute);
  await driver.executeScript("arguments[0].focus()", element);
  await element.sendKeys(key);
  await driver.wait(
    async () => (await element.getAttribute(attribute)) !== before,
    2_000,
  );
  const focused = await driver.executeScript(
    "return document.activeElement === arguments[0]",
    element,
  );
  if (!focused) throw new Error(`${label}: keyboard target lost focus`);
  summary.interactions.push({
    label,
    before,
    after: await element.getAttribute(attribute),
  });
}

async function assertInteractions() {
  const swatches = await driver.findElements(
    By.css('button[aria-label^="Wallpaper:"]'),
  );
  if (swatches.length < 2) throw new Error("Wallpaper controls are missing");
  await driver.executeScript("arguments[0].focus()", swatches[1]);
  await swatches[1].sendKeys(Key.ENTER);
  await driver.wait(
    async () => (await swatches[1].getAttribute("data-active")) === "true",
    2_000,
  );
  summary.interactions.push({ label: "wallpaper", active: true });

  await assertKeyboardInteraction(
    '[data-demo-case="slider"] [role="slider"]',
    Key.ARROW_RIGHT,
    "aria-valuenow",
    "playback slider",
  );
  await assertKeyboardInteraction(
    '[data-demo-case="switch-slider-toggle"] [role="switch"]',
    Key.SPACE,
    "aria-checked",
    "Wi-Fi switch",
  );

  const lens = await driver.findElement(
    By.css('[data-demo-case="draggable-lens"]'),
  );
  await scrollTo(lens);
  const before = await lens.getRect();
  await driver
    .actions({ async: true })
    .dragAndDrop(lens, { x: 36, y: 24 })
    .perform();
  const after = await lens.getRect();
  if (Math.abs(after.x - before.x) < 10 && Math.abs(after.y - before.y) < 10) {
    throw new Error("Draggable lens did not move through W3C pointer actions");
  }
  summary.interactions.push({ label: "draggable lens", before, after });

  const material = await driver.findElement(
    By.css('[data-demo-case="material-update"] input[type="range"]'),
  );
  await scrollTo(material);
  const materialBefore = await material.getAttribute("value");
  await driver.executeScript("arguments[0].focus()", material);
  await material.sendKeys(Key.ARROW_RIGHT);
  const materialAfter = await material.getAttribute("value");
  if (materialBefore === materialAfter)
    throw new Error("Material range did not update");
  summary.interactions.push({
    label: "material update",
    materialBefore,
    materialAfter,
  });
}

async function assertDiagnostics(backends) {
  const density = await driver.findElement(
    By.css('[data-demo-case="density-32-lenses"]'),
  );
  await scrollTo(density);
  await density.click();
  const toggle = await driver.findElement(By.css(".diagnostics-toggle"));
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  await driver.wait(
    async () =>
      driver.executeScript(`
        const rows = [...document.querySelectorAll(".diagnostics-grid > div")];
        const values = Object.fromEntries(rows.map((row) => [
          row.querySelector("dt")?.textContent.trim(),
          row.querySelector("dd")?.textContent.trim(),
        ]));
        return values.Example === "density-32-lenses";
      `),
    3_000,
  );
  const values = await driver.executeScript(`
    return Object.fromEntries([...document.querySelectorAll(".diagnostics-grid > div")]
      .map((row) => [row.querySelector("dt")?.textContent.trim(), row.querySelector("dd")?.textContent.trim()]));
  `);
  const actual = backends["density-32-lenses"] || [];
  if (!actual.some((backend) => String(values.Backend).includes(backend))) {
    throw new Error(
      `Diagnostics backend ${values.Backend} does not report active density backend ${actual.join(",")}`,
    );
  }
  const expectedBrowser = {
    chrome: "Chromium",
    firefox: "Firefox",
    safari: "Safari",
  }[browser];
  if (values.Browser !== expectedBrowser) {
    throw new Error(
      `Diagnostics browser ${values.Browser}; expected ${expectedBrowser}`,
    );
  }
  summary.diagnostics = values;
}

async function readBrowserLogs() {
  try {
    return await driver.manage().logs().get("browser");
  } catch (error) {
    driverLog += `Browser log endpoint unavailable: ${error.message}\n`;
    return [];
  }
}

try {
  environment.demoAssets = await verifyDemoBuild();
  server = await startStaticServer(demoRoot);
  ({ driver, service } = await createBrandedDriver(browser));
  environment = {
    ...environment,
    ...(await assertBrand(driver, browser)),
    os: `${process.platform} ${process.arch}`,
  };
  await driver
    .manage()
    .window()
    .setRect({ width: 1280, height: 900, x: 0, y: 0 });
  await driver.get(server.url);
  await driver.wait(until.elementsLocated(By.css("[data-demo-case]")), 15_000);
  await driver.wait(
    async () =>
      (await driver.findElements(By.css("[data-demo-case]"))).length ===
      DEMO_CASES.length,
    15_000,
  );
  if (browser === "safari") {
    const activation = spawnSync("/usr/bin/osascript", [
      "-e",
      'tell application "Safari" to activate',
    ]);
    if (activation.status !== 0) {
      throw new Error(
        `Could not foreground the real Safari automation window: ${activation.stderr}`,
      );
    }
    environment.foregroundRequested = true;
    await driver.sleep(250);
  }
  environment.renderPreflight = await awaitVisibleRenderPreflight();
  const backends = {};
  for (const demoCase of DEMO_CASES) {
    const element = await driver.findElement(
      By.css(`[data-demo-case="${demoCase}"]`),
    );
    await scrollTo(element);
    if (BACKEND_CASES.includes(demoCase)) {
      await driver.wait(
        async () =>
          (await readBackend(element)).some((backend) => backend !== "none"),
        3_000,
      );
    }
    backends[demoCase] = await readBackend(element);
    summary.cases.push({ demoCase, backends: backends[demoCase] });
    await takeScreenshot(
      `${String(summary.cases.length).padStart(2, "0")}-${demoCase}.png`,
    );
  }

  const desktopSnapshot = await readPageSnapshot(backends);
  summary.desktop = desktopSnapshot;
  summary.failures.push(...validateDemoSnapshot(desktopSnapshot, browser));
  await assertInteractions();
  await assertDiagnostics(backends);
  const desktopPageErrors = await driver.executeScript(
    "return window.__liquidGlassDemoErrors || []",
  );

  await driver
    .manage()
    .window()
    .setRect({ width: 390, height: 844, x: 0, y: 0 });
  await driver.get(server.url);
  await driver.wait(
    async () =>
      (await driver.findElements(By.css("[data-demo-case]"))).length ===
      DEMO_CASES.length,
    15_000,
  );
  const mobileSnapshot = await readPageSnapshot(backends);
  summary.mobile = mobileSnapshot;
  if (mobileSnapshot.horizontalOverflow > 1) {
    summary.failures.push(
      `mobile horizontal overflow ${mobileSnapshot.horizontalOverflow}px`,
    );
  }
  await takeScreenshot("mobile-catalogue.png");

  const mobilePageErrors = await driver.executeScript(
    "return window.__liquidGlassDemoErrors || []",
  );
  const pageErrors = [...desktopPageErrors, ...mobilePageErrors];
  summary.pageErrors = pageErrors;
  if (pageErrors.length)
    summary.failures.push(`page errors: ${pageErrors.join(" | ")}`);
  browserLogEntries = await readBrowserLogs();
  const severe = severeBrowserLogs(browserLogEntries).filter(
    (entry) => !String(entry.message).includes("favicon.ico"),
  );
  if (severe.length) {
    summary.failures.push(
      `browser console errors: ${severe.map((entry) => entry.message).join(" | ")}`,
    );
  }
} catch (error) {
  summary.failures.push(String(error?.stack || error));
  if (driver) browserLogEntries = await readBrowserLogs();
} finally {
  if (service?.logs) driverLog += service.logs();
  await writeFile(
    join(artifactRoot, "environment.json"),
    JSON.stringify(environment, null, 2),
  );
  await writeFile(
    join(artifactRoot, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  await writeFile(
    join(artifactRoot, "console-browser.json"),
    JSON.stringify(browserLogEntries, null, 2),
  );
  await writeFile(join(artifactRoot, "console-driver.log"), driverLog);
  await driver?.quit().catch(() => {});
  service?.child?.kill();
  displayGuard?.kill();
  await server?.close();
}

if (summary.failures.length) {
  console.error(summary.failures.join("\n"));
  process.exit(1);
}
console.log(`Demo tour passed: ${browser} (${DEMO_CASES.length} cases)`);
