import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { By, Key, until } from "selenium-webdriver";
import {
  analyzeVisualRoi,
  BACKEND_CASES,
  DEMO_CASES,
  FIXTURE_CASES,
  MAIN_CASES,
  severeBrowserLogs,
  validateDemoSnapshot,
  validateSceneSnapshot,
} from "./lib/demo-tour-analysis.mjs";
import { compareRoi } from "./lib/png-proof.mjs";
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
  return png;
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

async function visibleRoi(element) {
  return driver.executeScript(
    `const r=arguments[0].getBoundingClientRect(); const d=devicePixelRatio;
     const left=Math.max(0,r.left), top=Math.max(0,r.top);
     const right=Math.min(innerWidth,r.right), bottom=Math.min(innerHeight,r.bottom);
     return {x:left*d,y:top*d,width:Math.max(0,right-left)*d,height:Math.max(0,bottom-top)*d};`,
    element,
  );
}

async function readSceneSnapshot() {
  const dockCase = await driver.findElement(
    By.css('[data-demo-case="live-backdrop-auto-fallback"]'),
  );
  await scrollTo(dockCase);
  const dock = await driver.executeScript(`
    const root=document.querySelector('[data-demo-case="live-backdrop-auto-fallback"]');
    const dock=root.querySelector('.glassx-dock');
    const stage=root.querySelector('.stage') || root.closest('.stage');
    const apps=[...dock.querySelectorAll('.glassx-dock-app')];
    const rect=dock.getBoundingClientRect(), stageRect=stage.getBoundingClientRect();
    const slab=dock.querySelector('.glassx-dock-slab');
    const backend=(slab?.dataset.lgBackend || '').split(',');
    const bg=slab?.querySelector('.lg-bg');
    const bgStyle=bg ? getComputedStyle(bg) : null;
    return {
      apps: apps.length,
      labelled: apps.filter((app) => app.getAttribute('aria-label')?.trim()).length,
      visibleIcons: apps.filter((app) => {
        const icon=app.querySelector('.glassx-dock-icon');
        const r=icon?.getBoundingClientRect();
        return r && r.width >= 24 && r.height >= 24 && getComputedStyle(icon).visibility !== 'hidden';
      }).length,
      width: rect.width,
      height: rect.height,
      centerDelta: Math.abs((rect.left + rect.width / 2) - (stageRect.left + stageRect.width / 2)),
      activeGlass: backend.some((value) => value && value !== 'none'),
      effectCarrier: Boolean(bgStyle && bgStyle.display !== 'none' && (
        bgStyle.backdropFilter !== 'none' || bgStyle.webkitBackdropFilter !== 'none' ||
        bgStyle.filter !== 'none' || bgStyle.backgroundImage !== 'none'
      )),
    };
  `);

  const lockCase = await driver.findElement(
    By.css('[data-demo-case="slider"]'),
  );
  await scrollTo(lockCase);
  await driver.wait(
    async () =>
      driver.executeScript(`return [...document.querySelectorAll('.lockscreen .lock-card')]
        .every((card) => (card.dataset.lgBackend || '').split(',').some((value) => value !== 'none'));`),
    3_000,
  );
  const notifications = await driver.executeScript(`
    return [...document.querySelectorAll('.lockscreen .notif')].map((content) => {
      const card=content.closest('.lock-card');
      const backend=(card?.dataset.lgBackend || '').split(',');
      const bg=card?.querySelector('.lg-bg');
      const style=bg ? getComputedStyle(bg) : null;
      return {
        copy: Boolean(content.querySelector('.notif-title')?.textContent.trim() && content.querySelector('.notif-body')?.textContent.trim()),
        activeGlass: backend.some((value) => value && value !== 'none'),
        effectCarrier: Boolean(style && style.display !== 'none' && (
          style.backdropFilter !== 'none' || style.webkitBackdropFilter !== 'none' ||
          style.filter !== 'none' || style.backgroundImage !== 'none'
        )),
      };
    });
  `);

  const controls = await driver.findElement(
    By.css('[data-demo-case="switch-slider-toggle"]'),
  );
  await scrollTo(controls);
  const geometry = await driver.executeScript(`
    const sliders=[...document.querySelectorAll('[data-demo-case="slider"] [role="slider"], [data-demo-case="switch-slider-toggle"] [role="slider"]')];
    const sliderGeometry=sliders.map((slider) => {
      const track=slider.querySelector('.glassx-slider-track');
      const thumb=slider.querySelector('.glassx-slider-thumb');
      const tr=track.getBoundingClientRect(), hr=thumb.getBoundingClientRect();
      const min=Number(slider.getAttribute('aria-valuemin')), max=Number(slider.getAttribute('aria-valuemax'));
      const value=Number(slider.getAttribute('aria-valuenow'));
      const pct=(value-min)/(max-min);
      return {
        label: slider.getAttribute('aria-label') || 'slider',
        horizontalDelta: Math.abs((hr.left + hr.width / 2) - (tr.left + tr.width * pct)),
        verticalDelta: Math.abs((hr.top + hr.height / 2) - (tr.top + tr.height / 2)),
      };
    });
    const switches=[...document.querySelectorAll('[data-demo-case="switch-slider-toggle"] [role="switch"]')].map((toggle) => {
      const track=toggle.querySelector('.glassx-switch-track');
      const thumb=toggle.querySelector('.glassx-switch-thumb');
      const tr=track.getBoundingClientRect(), hr=thumb.getBoundingClientRect();
      return {
        label: toggle.closest('.cc-row')?.querySelector('.cc-label')?.textContent.trim() || 'switch',
        verticalDelta: Math.abs((hr.top + hr.height / 2) - (tr.top + tr.height / 2)),
        insideTrack: hr.left >= tr.left - 1 && hr.right <= tr.right + 1,
      };
    });
    return {sliders: sliderGeometry, switches};
  `);

  const staticState = await driver.executeScript(`
    const brokenScenes=[...document.querySelectorAll('.scene')].flatMap((scene, index) => {
      const rect=scene.getBoundingClientRect();
      const stage=scene.querySelector('.stage');
      const reasons=[];
      if (rect.width < 240 || rect.height < 100) reasons.push('collapsed');
      if (stage && !stage.children.length) reasons.push('empty stage');
      return reasons.map((reason) => (scene.dataset.demoCase || scene.id || 'scene-' + index) + ' ' + reason);
    });
    for (const image of document.images) {
      if (image.complete && image.naturalWidth === 0) brokenScenes.push('broken image ' + (image.currentSrc || image.src));
    }
    for (const canvas of document.querySelectorAll('canvas')) {
      const rect=canvas.getBoundingClientRect();
      if (!canvas.width || !canvas.height || !rect.width || !rect.height) brokenScenes.push('collapsed canvas');
    }
    const snippets=[...document.querySelectorAll('.cb-code')].map((node) => node.textContent.trim());
    const imports=snippets.filter((code) => code.includes('@tomagranate/liquid-glass'));
    return {
      brokenScenes,
      snippets: {
        empty: snippets.filter((code) => code.length < 30).length,
        packageImports: imports.length,
        reactImport: imports.some((code) => code.includes('@tomagranate/liquid-glass/react')),
        sourceImports: snippets.filter((code) => code.includes('src/')).length,
      },
    };
  `);
  return {
    dock,
    notifications,
    brokenScenes: staticState.brokenScenes,
    snippets: staticState.snippets,
    sliders: geometry.sliders,
    switches: geometry.switches,
  };
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
  const after = await element.getAttribute(attribute);
  if (attribute === "aria-valuenow" && !(Number(after) > Number(before))) {
    throw new Error(`${label}: value did not increase (${before} → ${after})`);
  }
  summary.interactions.push({
    label,
    before,
    after,
  });
}

async function assertInteractions() {
  const installState = await driver.executeScript(`
    const hero=document.querySelector('.hero');
    const examples=document.querySelector('#examples');
    const playground=document.querySelector('#playground');
    return {
      order:[hero,examples,playground].map((node) => node?.offsetTop ?? -1),
    };
  `);
  if (
    installState.order.some((value) => value < 0) ||
    installState.order.some(
      (value, index, values) => index > 0 && value <= values[index - 1],
    )
  ) {
    throw new Error(
      `Demo information architecture is out of order: ${installState.order}`,
    );
  }

  const packageTabs = await driver.findElements(
    By.css('.install-tabs [role="tab"]'),
  );
  if (packageTabs.length !== 3)
    throw new Error("Install selector must expose npm, pnpm, and bun");
  const packageLabels = await Promise.all(
    packageTabs.map((tab) => tab.getText()),
  );
  if (packageLabels.join(",") !== "npm,pnpm,bun") {
    throw new Error(`Unexpected install choices: ${packageLabels.join(",")}`);
  }
  await packageTabs[1].click();
  let installCommand = await driver
    .findElement(By.css("#install-command"))
    .getText();
  if (installCommand !== "pnpm add @tomagranate/liquid-glass") {
    throw new Error(`pnpm install command is wrong: ${installCommand}`);
  }
  await packageTabs[1].sendKeys(Key.ARROW_RIGHT);
  await driver.wait(
    async () => (await packageTabs[2].getAttribute("aria-selected")) === "true",
    2_000,
  );
  const bunFocused = await driver.executeScript(
    "return document.activeElement === arguments[0]",
    packageTabs[2],
  );
  if (!bunFocused)
    throw new Error("Install tab arrow navigation did not move focus");
  installCommand = await driver
    .findElement(By.css("#install-command"))
    .getText();
  if (installCommand !== "bun add @tomagranate/liquid-glass") {
    throw new Error(`bun install command is wrong: ${installCommand}`);
  }
  const installCopy = await driver.findElement(By.css(".install"));
  await scrollTo(installCopy);
  await installCopy.click();
  await driver.wait(
    async () =>
      (await driver
        .findElement(By.css('.install-card [aria-live="polite"]'))
        .getAttribute("textContent")) === "Install command copied",
    2_000,
  );
  summary.interactions.push({
    label: "install selector",
    choices: packageLabels,
    command: installCommand,
  });

  const dock = await driver.findElement(By.css(".glassx-dock"));
  await scrollTo(dock);
  await driver
    .actions({ async: true })
    .move({ x: 2, y: 2, origin: "viewport" })
    .perform();
  await driver.sleep(120);
  const dockRoi = await visibleRoi(dock);
  const dockBefore = await takeScreenshot("dock-before-wallpaper.png");
  const firstApp = await dock.findElement(By.css(".glassx-dock-app"));
  const transformBefore = await firstApp.getCssValue("transform");
  await driver.actions({ async: true }).move({ origin: firstApp }).perform();
  await driver.sleep(250);
  const transformAfter = await firstApp.getCssValue("transform");
  if (transformAfter === transformBefore || transformAfter === "none") {
    throw new Error("Dock app hover interaction produced no visible motion");
  }
  const hoverGeometry = await driver.executeScript(
    `const dock=arguments[0].getBoundingClientRect();
     const app=arguments[1].getBoundingClientRect();
     const x=app.left + app.width / 2;
     const y=Math.max(app.top + 1, Math.min(dock.top - 1, app.bottom - 1));
     const hit=document.elementFromPoint(x,y);
     return {
       protrusion: dock.top - app.top,
       hitApp: Boolean(hit && (hit === arguments[1] || arguments[1].contains(hit))),
       dockOverflow: getComputedStyle(arguments[0]).overflow,
       dock: {top:dock.top,left:dock.left,width:dock.width,height:dock.height},
       app: {top:app.top,left:app.left,width:app.width,height:app.height},
     };`,
    dock,
    firstApp,
  );
  if (
    hoverGeometry.protrusion < 6 ||
    !hoverGeometry.hitApp ||
    hoverGeometry.dockOverflow !== "visible"
  ) {
    throw new Error(
      `Dock hover is clipped or blocked: ${JSON.stringify(hoverGeometry)}`,
    );
  }
  const hoverAfter = await takeScreenshot("dock-hover.png");
  const dpr = await driver.executeScript("return devicePixelRatio");
  const hoverRoi = {
    x: dockRoi.x,
    y: Math.max(0, dockRoi.y - 30 * dpr),
    width: dockRoi.width,
    height: dockRoi.height + 30 * dpr,
  };
  const hoverProof = compareRoi(dockBefore, hoverAfter, hoverRoi);
  await writeFile(
    join(artifactRoot, "dock-hover-roi.json"),
    JSON.stringify(hoverProof, null, 2),
  );
  if (!hoverProof.pass)
    throw new Error(
      `Dock hover produced no visible pixel change: ${JSON.stringify(hoverProof)}`,
    );
  summary.interactions.push({
    label: "dock hover",
    before: transformBefore,
    after: transformAfter,
    geometry: hoverGeometry,
    visual: hoverProof,
  });

  const swatches = await driver.findElements(
    By.css('button[aria-label^="Wallpaper:"]'),
  );
  if (swatches.length < 2) throw new Error("Wallpaper controls are missing");
  const nextSwatch =
    (
      await Promise.all(
        swatches.map(async (swatch) => ({
          swatch,
          active: (await swatch.getAttribute("data-active")) === "true",
        })),
      )
    ).find((item) => !item.active)?.swatch || swatches[0];
  await driver.executeScript("arguments[0].focus()", nextSwatch);
  await nextSwatch.sendKeys(Key.ENTER);
  await driver.wait(
    async () => (await nextSwatch.getAttribute("data-active")) === "true",
    2_000,
  );
  summary.interactions.push({ label: "wallpaper", active: true });
  await scrollTo(dock);
  const dockAfter = await takeScreenshot("dock-after-wallpaper.png");
  const wallpaperProof = compareRoi(dockBefore, dockAfter, dockRoi);
  await writeFile(
    join(artifactRoot, "dock-wallpaper-roi.json"),
    JSON.stringify(wallpaperProof, null, 2),
  );
  if (!wallpaperProof.pass) {
    throw new Error(
      `Dock glass did not visibly respond to wallpaper change: ${JSON.stringify(wallpaperProof)}`,
    );
  }
  summary.wallpaperVisualProof = wallpaperProof;

  await assertKeyboardInteraction(
    '[data-demo-case="slider"] [role="slider"]',
    Key.ARROW_RIGHT,
    "aria-valuenow",
    "playback slider",
  );
  await assertKeyboardInteraction(
    '[data-demo-case="switch-slider-toggle"] [role="slider"][aria-label="Brightness"]',
    Key.ARROW_RIGHT,
    "aria-valuenow",
    "brightness slider",
  );
  await assertKeyboardInteraction(
    '[data-demo-case="switch-slider-toggle"] [role="switch"]',
    Key.SPACE,
    "aria-checked",
    "Wi-Fi switch",
  );

  const playback = await driver.findElement(
    By.css(
      '[data-demo-case="slider"] button[aria-label="Pause"], [data-demo-case="slider"] button[aria-label="Play"]',
    ),
  );
  await scrollTo(playback);
  const playbackBefore = await playback.getAttribute("aria-label");
  await playback.click();
  await driver.wait(
    async () => (await playback.getAttribute("aria-label")) !== playbackBefore,
    2_000,
  );
  summary.interactions.push({
    label: "music playback",
    before: playbackBefore,
    after: await playback.getAttribute("aria-label"),
  });

  const video = await driver.findElement(
    By.css('[data-demo-case="video-media"] video'),
  );
  const bigPlay = await driver.findElement(
    By.css('[data-demo-case="video-media"] .glassx-video-bigplay'),
  );
  await scrollTo(video);
  const initialVideo = await driver.executeScript(
    `const video=arguments[0], control=arguments[1];
     const vr=video.getBoundingClientRect(), cr=control.getBoundingClientRect();
     const style=getComputedStyle(control);
     const sheen=getComputedStyle(control.querySelector('.lg-sheen'));
     const color=style.backgroundColor.split(/[(), ]+/).map(Number).filter(Number.isFinite);
     return {
       paused: video.paused,
       muted: video.muted,
       poster: video.getAttribute('poster'),
       readyState: video.readyState,
       controlLabel: control.getAttribute('aria-label'),
       controlHidden: control.dataset.hidden,
       controlBackground: style.backgroundColor,
       controlBackgroundAlpha: color.length > 3 ? color[3] : 1,
       controlBackend: control.dataset.lgBackend,
       controlWaiting: control.hasAttribute('data-waiting'),
       controlBackdropFilter: style.backdropFilter || style.webkitBackdropFilter,
       controlBoxShadow: style.boxShadow,
       sheenBackground: sheen.backgroundImage,
       sheenBoxShadow: sheen.boxShadow,
       controlOpacity: Number(style.opacity),
       centerDeltaX: Math.abs((vr.left + vr.width / 2) - (cr.left + cr.width / 2)),
       centerDeltaY: Math.abs((vr.top + vr.height / 2) - (cr.top + cr.height / 2)),
     };`,
    video,
    bigPlay,
  );
  if (
    !initialVideo.paused ||
    initialVideo.controlLabel !== "Play" ||
    !initialVideo.poster ||
    initialVideo.controlBackgroundAlpha < 0.2 ||
    initialVideo.controlBackgroundAlpha > 0.65 ||
    initialVideo.controlBackend !== "none" ||
    !initialVideo.controlWaiting ||
    (initialVideo.controlBackdropFilter &&
      initialVideo.controlBackdropFilter !== "none") ||
    !initialVideo.controlBoxShadow ||
    initialVideo.controlBoxShadow === "none" ||
    !initialVideo.sheenBackground ||
    initialVideo.sheenBackground === "none" ||
    !initialVideo.sheenBoxShadow ||
    initialVideo.sheenBoxShadow === "none" ||
    initialVideo.controlOpacity < 0.95 ||
    initialVideo.centerDeltaX > 2 ||
    initialVideo.centerDeltaY > 2
  ) {
    throw new Error(
      `Invalid initial video state: ${JSON.stringify(initialVideo)}`,
    );
  }
  const initialControlRoi = await visibleRoi(bigPlay);
  const initialControlShot = await takeScreenshot("video-initial-control.png");
  const initialControlVisual = analyzeVisualRoi(
    initialControlShot,
    initialControlRoi,
  );
  if (
    !initialControlVisual.pass ||
    initialControlVisual.meanLuminance < 35 ||
    initialControlVisual.luminanceRange < 80 ||
    initialControlVisual.variance < 100 ||
    initialControlVisual.edgeMean < 0.8
  ) {
    throw new Error(
      `Initial video control is blank or black: ${JSON.stringify(initialControlVisual)}`,
    );
  }
  await bigPlay.click();
  await driver.wait(
    async () =>
      driver.executeScript(
        "return !arguments[0].paused && !document.querySelector('[data-demo-case=\"video-media\"] .glassx-video-bigplay')",
        video,
      ),
    4_000,
    "video did not enter playing state",
  );
  const readPlayingMediaState = () =>
    driver.executeScript(`
      const root = document.querySelector('[data-demo-case="video-media"]');
      const overlay = root?.querySelector('.lgm-overlay');
      const context = overlay?.getContext('webgl2') || null;
      return {
        backends: [...(root?.querySelectorAll(
          '.glassx-video-scrub, .glassx-video-ctl'
        ) || [])].map((control) => control.dataset.lgBackend || 'missing'),
        overlayPresent: Boolean(overlay),
        webgl2Available: Boolean(context),
        contextLost: context?.isContextLost() ?? false,
      };
    `);
  await driver.wait(
    async () => {
      const state = await readPlayingMediaState();
      const mediaAvailable =
        state.overlayPresent && state.webgl2Available && !state.contextLost;
      return (
        state.backends.length > 0 &&
        state.backends.every((value) =>
          mediaAvailable
            ? value.split(",").includes("media-webgl")
            : value === "none",
        )
      );
    },
    4_000,
    "playing video controls did not match the media WebGL capability",
  );
  const playingMediaState = await readPlayingMediaState();
  const playingControlBackends = playingMediaState.backends;
  await video.click();
  await driver.wait(
    async () =>
      driver.executeScript(
        "return arguments[0].paused && !document.querySelector('[data-demo-case=\"video-media\"] .glassx-video-bigplay')",
        video,
      ),
    4_000,
    "video did not return to paused state",
  );
  const pausedPaint = await driver.executeAsyncScript(`
    const done=arguments[arguments.length-1];
    const stamps=[];
    const tick=(time) => {
      stamps.push(time);
      if (stamps.length < 3) requestAnimationFrame(tick);
      else setTimeout(() => done({
        stamps,
        controlPresent:Boolean(document.querySelector('[data-demo-case="video-media"] .glassx-video-bigplay')),
        paused:document.querySelector('[data-demo-case="video-media"] video')?.paused,
      }), 0);
    };
    requestAnimationFrame(tick);
  `);
  if (pausedPaint.controlPresent || !pausedPaint.paused)
    throw new Error(
      `Video did not reach a stable control-free paused paint: ${JSON.stringify(pausedPaint)}`,
    );
  const pausedShot = await takeScreenshot("video-paused-control-free.png");
  const initialControlProof = compareRoi(
    initialControlShot,
    pausedShot,
    initialControlRoi,
  );
  const pausedSourceVisual = analyzeVisualRoi(
    pausedShot,
    await visibleRoi(video),
  );
  if (
    !initialControlProof.pass ||
    initialControlProof.changedRatio < 0.2 ||
    !pausedSourceVisual.pass ||
    pausedSourceVisual.meanLuminance < 12
  )
    throw new Error(
      `Initial video glass control did not visibly disappear from a healthy paused frame: removal=${JSON.stringify(initialControlProof)} source=${JSON.stringify(pausedSourceVisual)}`,
    );
  summary.interactions.push({
    label: "video play states",
    media: playingMediaState,
    initial: initialVideo,
    transitions: ["paused", "playing", "paused"],
    playingControlBackends,
    initialControlVisual,
    initialControlProof,
    pausedPaint,
    pausedSourceVisual,
  });

  const seek = await driver.findElement(
    By.css('[data-demo-case="video-media"] [role="slider"][aria-label="Seek"]'),
  );
  await scrollTo(seek);
  await driver.wait(
    async () =>
      driver.executeScript(`
        const video=document.querySelector('[data-demo-case="video-media"] video');
        return Boolean(video && Number.isFinite(video.duration) && video.duration > 0);
      `),
    8_000,
    "video metadata did not load",
  );
  await driver.executeScript("arguments[0].focus()", seek);
  if (
    !(await driver.executeScript(
      "return document.activeElement === arguments[0]",
      seek,
    ))
  )
    throw new Error("video scrubber could not receive keyboard focus");
  await driver.actions({ async: true }).sendKeys(Key.HOME).perform();
  await driver.wait(
    async () => Number(await seek.getAttribute("aria-valuenow")) <= 1,
    2_000,
    "video scrubber Home did not reset",
  );
  const seekLow = Number(await seek.getAttribute("aria-valuenow"));
  await driver.actions({ async: true }).sendKeys(Key.ARROW_RIGHT).perform();
  await driver.wait(
    async () => Number(await seek.getAttribute("aria-valuenow")) > seekLow,
    2_000,
    "video scrubber ArrowRight did not increase",
  );
  summary.interactions.push({
    label: "video scrubber",
    before: seekLow,
    after: Number(await seek.getAttribute("aria-valuenow")),
  });

  const mute = await driver.findElement(
    By.css(
      '[data-demo-case="video-media"] button[aria-label="Mute"], [data-demo-case="video-media"] button[aria-label="Unmute"]',
    ),
  );
  const muteBefore = await mute.getAttribute("aria-label");
  await mute.click();
  await driver.wait(
    async () => (await mute.getAttribute("aria-label")) !== muteBefore,
    2_000,
  );
  const muteMiddle = await mute.getAttribute("aria-label");
  const videoMutedMiddle = await driver.executeScript(
    "return arguments[0].muted",
    video,
  );
  await mute.click();
  await driver.wait(
    async () => (await mute.getAttribute("aria-label")) === muteBefore,
    2_000,
  );
  const videoMutedAfter = await driver.executeScript(
    "return arguments[0].muted",
    video,
  );
  if (videoMutedMiddle || !videoMutedAfter)
    throw new Error("Video mute control did not expose both muted states");
  summary.interactions.push({
    label: "video mute states",
    before: muteBefore,
    middle: muteMiddle,
    after: await mute.getAttribute("aria-label"),
  });

  const allExamples = await driver.findElements(By.css(".cb"));
  if (allExamples.length < 2)
    throw new Error(
      `Expected at least two public code examples; total=${allExamples.length}`,
    );
  let sawReactVanillaBlock = false;
  const toggledExamples = [];
  for (const [index, block] of allExamples.entries()) {
    await scrollTo(block);
    const disclosure = await block.findElement(By.css(".cb-disclosure"));
    if ((await disclosure.getAttribute("aria-expanded")) !== "false") {
      throw new Error(`Code example ${index + 1} is not collapsed by default`);
    }
    if ((await block.findElements(By.css(".cb-tab"))).length) {
      throw new Error(
        `Code example ${index + 1} exposes focusable controls while collapsed`,
      );
    }
    await disclosure.click();
    await driver.wait(
      async () => (await disclosure.getAttribute("aria-expanded")) === "true",
      2_000,
    );
    const tabs = await block.findElements(By.css(".cb-tab"));
    const labelledTabs = await Promise.all(
      tabs.map(async (tab) => ({ tab, label: (await tab.getText()).trim() })),
    );
    if (labelledTabs.length < 2)
      throw new Error(`Code example ${index + 1} has fewer than two tabs`);
    const code = await block.findElement(By.css(".cb-code"));
    const reactTab = labelledTabs.find((item) => item.label === "React")?.tab;
    const vanillaTab = labelledTabs.find(
      (item) => item.label === "Vanilla",
    )?.tab;

    if (reactTab && vanillaTab) {
      // React/Vanilla block: verify both public-root snippet variants.
      sawReactVanillaBlock = true;
      await driver.executeScript("arguments[0].focus()", vanillaTab);
      await vanillaTab.sendKeys(Key.ENTER);
      await driver.wait(
        async () => (await vanillaTab.getAttribute("aria-selected")) === "true",
        2_000,
      );
      const vanillaText = await code.getText();
      if (
        !vanillaText.includes('@tomagranate/liquid-glass"') ||
        vanillaText.includes("@tomagranate/liquid-glass/react") ||
        vanillaText.includes("src/")
      )
        throw new Error(
          `Vanilla example ${index + 1} is not a useful public-root snippet`,
        );
      const copy = await block.findElement(By.css(".cb-copy"));
      await copy.click();
      await driver.wait(
        async () => (await copy.getText()).includes("Copied"),
        2_000,
        `Code example ${index + 1} copy interaction failed`,
      );
      await reactTab.click();
      await driver.wait(
        async () => (await reactTab.getAttribute("aria-selected")) === "true",
        2_000,
      );
      const reactText = await code.getText();
      if (
        !reactText.includes("@tomagranate/liquid-glass/react") ||
        reactText.includes("src/")
      )
        throw new Error(
          `React example ${index + 1} is not a useful public React snippet`,
        );
      toggledExamples.push({
        index: index + 1,
        variants: ["Vanilla", "React"],
      });
      continue;
    }

    // Section block (e.g. Wallpaper/Content/Media): every tab is a public
    // React snippet; switching tabs must swap the snippet and copy must work.
    for (const { tab, label } of labelledTabs) {
      await tab.click();
      await driver.wait(
        async () => (await tab.getAttribute("aria-selected")) === "true",
        2_000,
      );
      const text = await code.getText();
      if (!text.includes("@tomagranate/liquid-glass") || text.includes("src/"))
        throw new Error(
          `Section example ${index + 1} tab "${label}" is not a useful public snippet`,
        );
    }
    const copy = await block.findElement(By.css(".cb-copy"));
    await copy.click();
    await driver.wait(
      async () => (await copy.getText()).includes("Copied"),
      2_000,
      `Section example ${index + 1} copy interaction failed`,
    );
    toggledExamples.push({
      index: index + 1,
      variants: await Promise.all(labelledTabs.map((item) => item.label)),
    });
  }
  if (!sawReactVanillaBlock)
    throw new Error("No React/Vanilla public code example was found");
  summary.interactions.push({
    label: "public code tabs",
    examples: toggledExamples,
  });

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

async function walkCases(cases, backends) {
  for (const demoCase of cases) {
    const element = await driver.findElement(
      By.css(`[data-demo-case="${demoCase}"]`),
    );
    await scrollTo(element);
    if (BACKEND_CASES.includes(demoCase) && demoCase !== "video-media") {
      await driver.wait(
        async () =>
          (await readBackend(element)).some((backend) => backend !== "none"),
        3_000,
      );
    }
    backends[demoCase] = await readBackend(element);
    const screenshot = await takeScreenshot(
      `${String(summary.cases.length + 1).padStart(2, "0")}-${demoCase}.png`,
    );
    const visual = analyzeVisualRoi(screenshot, await visibleRoi(element));
    let sourceVisual = null;
    if (["video-media", "canvas-media"].includes(demoCase)) {
      const selector =
        demoCase === "canvas-media" ? ".canvas-media-source" : "video";
      const source = await element.findElement(By.css(selector));
      sourceVisual = analyzeVisualRoi(screenshot, await visibleRoi(source));
      if (!sourceVisual.pass) {
        summary.failures.push(
          `${demoCase}: registered media source is blank or visually collapsed ${JSON.stringify(sourceVisual)}`,
        );
      }
    }
    summary.cases.push({
      demoCase,
      backends: backends[demoCase],
      visual,
      sourceVisual,
    });
    if (!visual.pass) {
      summary.failures.push(
        `${demoCase}: visible ROI is blank or visually collapsed ${JSON.stringify(visual)}`,
      );
    }
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
  const fixturesUrl = `${server.url}${server.url.includes("?") ? "&" : "?"}fixtures`;
  await driver.get(server.url);
  await driver.wait(until.elementsLocated(By.css("[data-demo-case]")), 15_000);
  await driver.wait(
    async () =>
      (await driver.findElements(By.css("[data-demo-case]"))).length ===
      MAIN_CASES.length,
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

  // Marketing page ("/") — the MAIN_CASES plus scene contract and interactions.
  await walkCases(MAIN_CASES, backends);
  const desktopSnapshot = await readPageSnapshot(backends);
  summary.desktop = desktopSnapshot;
  summary.failures.push(
    ...validateDemoSnapshot(desktopSnapshot, browser, MAIN_CASES),
  );
  const sceneSnapshot = await readSceneSnapshot();
  summary.sceneContract = sceneSnapshot;
  summary.failures.push(...validateSceneSnapshot(sceneSnapshot));
  await assertInteractions();
  const desktopPageErrors = await driver.executeScript(
    "return window.__liquidGlassDemoErrors || []",
  );

  // Fixtures page ("/?fixtures") — the cut technical cases and diagnostics.
  await driver.get(fixturesUrl);
  await driver.wait(
    async () =>
      (await driver.findElements(By.css("[data-demo-case]"))).length ===
      FIXTURE_CASES.length,
    15_000,
  );
  await awaitVisibleRenderPreflight();
  await walkCases(FIXTURE_CASES, backends);
  const fixturesSnapshot = await readPageSnapshot(backends);
  summary.fixtures = fixturesSnapshot;
  summary.failures.push(
    ...validateDemoSnapshot(fixturesSnapshot, browser, FIXTURE_CASES),
  );
  await assertDiagnostics(backends);
  const fixturesPageErrors = await driver.executeScript(
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
      MAIN_CASES.length,
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
  const pageErrors = [
    ...desktopPageErrors,
    ...fixturesPageErrors,
    ...mobilePageErrors,
  ];
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
