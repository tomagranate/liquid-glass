import { spawn } from "node:child_process";
import { Builder, Browser } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import firefox from "selenium-webdriver/firefox.js";
import { setTimeout as delay } from "node:timers/promises";

async function startSafariDriver(port = 5555) {
  const child = spawn("/usr/bin/safaridriver", ["-p", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/status`);
      if (response.ok) return { child, logs: () => logs };
    } catch {}
    await delay(100);
  }
  child.kill();
  throw new Error(`SafariDriver failed to listen on ${port}. ${logs}`);
}

export async function createBrandedDriver(browser) {
  if (browser === "safari") {
    if (process.platform !== "darwin")
      throw new Error(
        "Real Safari requires macOS and /usr/bin/safaridriver; no WebKit substitute is permitted.",
      );
    const service = await startSafariDriver();
    try {
      const driver = await new Builder()
        .usingServer("http://127.0.0.1:5555")
        .forBrowser(Browser.SAFARI)
        .build();
      return { driver, service, expectedName: "safari" };
    } catch (error) {
      service.child.kill();
      const detail = String(error?.message || error);
      if (detail.includes("Allow remote automation")) {
        throw new Error(
          "Safari W3C session blocked: enable Safari Settings → Developer → Allow remote automation (or use a preconfigured self-hosted Mac). Playwright WebKit is not a substitute. Driver said: " +
            detail,
        );
      }
      throw error;
    }
  }
  const builder = new Builder();
  if (browser === "chrome") {
    const options = new chrome.Options().setChromeBinaryPath(
      process.env.LIQUID_GLASS_CHROME_BINARY ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    );
    builder.forBrowser(Browser.CHROME).setChromeOptions(options);
    if (process.env.LIQUID_GLASS_CHROMEDRIVER)
      builder.setChromeService(
        new chrome.ServiceBuilder(process.env.LIQUID_GLASS_CHROMEDRIVER),
      );
    return {
      driver: await builder.build(),
      service: null,
      expectedName: "chrome",
    };
  }
  if (browser === "firefox") {
    const options = new firefox.Options().setBinary(
      process.env.LIQUID_GLASS_FIREFOX_BINARY ||
        "/Applications/Firefox.app/Contents/MacOS/firefox",
    );
    builder.forBrowser(Browser.FIREFOX).setFirefoxOptions(options);
    if (process.env.LIQUID_GLASS_GECKODRIVER)
      builder.setFirefoxService(
        new firefox.ServiceBuilder(process.env.LIQUID_GLASS_GECKODRIVER),
      );
    return {
      driver: await builder.build(),
      service: null,
      expectedName: "firefox",
    };
  }
  throw new Error(`Unsupported branded browser: ${browser}`);
}

export async function assertBrand(driver, expected) {
  const caps = await driver.getCapabilities();
  const name = String(caps.getBrowserName()).toLowerCase();
  if (!name.includes(expected))
    throw new Error(
      `Driver identity mismatch: requested ${expected}, received ${name}. Substitution is forbidden.`,
    );
  return {
    browserName: name,
    browserVersion: caps.getBrowserVersion(),
    platformName: caps.getPlatform(),
  };
}
