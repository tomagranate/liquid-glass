export const DEMO_CASES = Object.freeze([
  "wallpaper-zero-config",
  "live-backdrop-auto-fallback",
  "slider",
  "draggable-lens",
  "switch-slider-toggle",
  "video-media",
  "bounded-content-surface",
  "partial-overlap-composition",
  "reduced-quality",
  "oversized-surface-fallback",
  "density-32-lenses",
  "vanilla-api",
  "nested-scope-isolation",
  "canvas-media",
  "material-update",
]);

export const BACKEND_CASES = Object.freeze(
  DEMO_CASES.filter(
    (name) =>
      !["wallpaper-zero-config", "canvas-media", "material-update"].includes(
        name,
      ),
  ),
);

const KNOWN_BACKENDS = new Set([
  "backdrop",
  "background-copy",
  "content-svg",
  "media-webgl",
  "native",
  "none",
]);

export function expectedBackendFamily(browser, demoCase) {
  if (!BACKEND_CASES.includes(demoCase)) return [];
  if (demoCase === "video-media") {
    return browser === "chrome"
      ? ["backdrop", "media-webgl"]
      : ["media-webgl", "background-copy", "native"];
  }
  if (browser === "chrome") return ["backdrop", "content-svg", "native"];
  if (browser === "safari" && demoCase === "density-32-lenses") {
    return ["native", "background-copy"];
  }
  return ["background-copy", "content-svg", "native"];
}

export function validateDemoSnapshot(snapshot, browser) {
  const failures = [];
  const found = new Set(snapshot.cases || []);
  for (const expected of DEMO_CASES) {
    if (!found.has(expected)) failures.push(`missing demo case: ${expected}`);
  }
  for (const duplicate of snapshot.duplicateIds || []) {
    failures.push(`duplicate id: ${duplicate}`);
  }
  for (const control of snapshot.unnamedControls || []) {
    failures.push(`unnamed control: ${control}`);
  }
  for (const input of snapshot.inputsWithoutName || []) {
    failures.push(`input missing name: ${input}`);
  }
  if (snapshot.densityLenses !== 32) {
    failures.push(`density lens count ${snapshot.densityLenses}; expected 32`);
  }
  if (snapshot.horizontalOverflow > 1) {
    failures.push(
      `horizontal overflow ${snapshot.horizontalOverflow}px at ${snapshot.viewportWidth}px`,
    );
  }
  if (!snapshot.reducedMotionRule) {
    failures.push("reduced-motion CSS invariant is missing");
  }
  for (const demoCase of BACKEND_CASES) {
    const actual = snapshot.backends?.[demoCase] || [];
    const expected = expectedBackendFamily(browser, demoCase);
    if (actual.some((backend) => !KNOWN_BACKENDS.has(backend))) {
      failures.push(`${demoCase}: unknown backend ${actual.join(",")}`);
    } else if (!actual.some((backend) => expected.includes(backend))) {
      failures.push(
        `${demoCase}: backend ${actual.join(",") || "missing"}; expected family ${expected.join(",")}`,
      );
    }
  }
  return failures;
}

export function severeBrowserLogs(entries) {
  return entries.filter((entry) =>
    /SEVERE|ERROR/i.test(String(entry.level?.name || entry.level || "")),
  );
}
