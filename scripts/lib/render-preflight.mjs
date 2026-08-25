const MIN_RAF_CALLBACKS = 3;

export function evaluateRenderPreflight(environment, scheduling) {
  if (environment.visibilityState !== "visible" || environment.hidden) {
    return {
      pass: false,
      reason: `page is ${environment.visibilityState || "unknown"}`,
    };
  }
  if ((scheduling.rafCallbacks ?? 0) < MIN_RAF_CALLBACKS) {
    return {
      pass: false,
      reason: `only ${scheduling.rafCallbacks ?? 0} requestAnimationFrame callbacks fired in ${scheduling.elapsed ?? 0}ms`,
    };
  }
  return { pass: true, reason: "render scheduling is active" };
}

export async function assertRenderPreflight(driver, browser) {
  const environment = await driver.executeScript(
    "return {visibilityState:document.visibilityState,hidden:document.hidden,hasFocus:document.hasFocus()};",
  );
  const scheduling = await driver.executeAsyncScript(`
    const done = arguments[arguments.length - 1];
    const started = performance.now();
    let rafCallbacks = 0;
    let active = true;
    const tick = () => {
      rafCallbacks++;
      if (active) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(() => {
      active = false;
      done({ rafCallbacks, elapsed: performance.now() - started });
    }, 750);
  `);
  const evaluation = evaluateRenderPreflight(environment, scheduling);
  if (!evaluation.pass) {
    const safariHelp =
      browser === "safari"
        ? " Unlock the macOS console and keep the real Safari automation window visible; caffeinate can prevent display sleep during a run but cannot unlock an already locked console."
        : " Keep the real browser window visible and the display awake.";
    throw new Error(
      `Render preflight failed: ${evaluation.reason}.${safariHelp} Environment=${JSON.stringify(environment)} scheduling=${JSON.stringify(scheduling)}`,
    );
  }
  return { environment, scheduling };
}
