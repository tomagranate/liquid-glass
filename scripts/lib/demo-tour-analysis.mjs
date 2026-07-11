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
    (name) => !["wallpaper-zero-config", "material-update"].includes(name),
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
  if (["video-media", "canvas-media"].includes(demoCase))
    return ["media-webgl"];
  if (
    [
      "bounded-content-surface",
      "partial-overlap-composition",
      "draggable-lens",
    ].includes(demoCase)
  )
    return ["content-svg"];
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

export function analyzeVisualRoi(base64, roi) {
  const png = PNG.sync.read(Buffer.from(base64, "base64"));
  const x0 = Math.max(0, Math.floor(roi.x));
  const y0 = Math.max(0, Math.floor(roi.y));
  const x1 = Math.min(png.width, Math.ceil(roi.x + roi.width));
  const y1 = Math.min(png.height, Math.ceil(roi.y + roi.height));
  let pixels = 0;
  let luminance = 0;
  let luminanceSquared = 0;
  let edgeDelta = 0;
  let edges = 0;
  let min = 255;
  let max = 0;
  const lightAt = (x, y) => {
    const offset = (y * png.width + x) * 4;
    return (
      png.data[offset] * 0.2126 +
      png.data[offset + 1] * 0.7152 +
      png.data[offset + 2] * 0.0722
    );
  };
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const light = lightAt(x, y);
      luminance += light;
      luminanceSquared += light * light;
      min = Math.min(min, light);
      max = Math.max(max, light);
      if (x > x0) {
        edgeDelta += Math.abs(light - lightAt(x - 1, y));
        edges++;
      }
      if (y > y0) {
        edgeDelta += Math.abs(light - lightAt(x, y - 1));
        edges++;
      }
      pixels++;
    }
  }
  const mean = luminance / Math.max(1, pixels);
  const variance = luminanceSquared / Math.max(1, pixels) - mean * mean;
  const edgeMean = edgeDelta / Math.max(1, edges);
  return {
    pixels,
    luminanceRange: max - min,
    variance,
    edgeMean,
    pass:
      pixels >= 500 && max - min >= 24 && variance >= 16 && edgeMean >= 0.35,
  };
}

export function validateSceneSnapshot(snapshot) {
  const failures = [];
  if (snapshot.dock.apps < 6)
    failures.push(`dock has ${snapshot.dock.apps} apps`);
  if (snapshot.dock.labelled !== snapshot.dock.apps)
    failures.push("dock contains unlabelled apps");
  if (snapshot.dock.visibleIcons !== snapshot.dock.apps)
    failures.push("dock contains empty or invisible icons");
  if (snapshot.dock.width < 240 || snapshot.dock.height < 48)
    failures.push("dock has collapsed geometry");
  if (snapshot.dock.centerDelta > 8)
    failures.push(
      `dock is ${snapshot.dock.centerDelta.toFixed(1)}px off-center`,
    );
  if (!snapshot.dock.activeGlass)
    failures.push("dock glass backend is inactive");
  if (!snapshot.dock.effectCarrier)
    failures.push("dock has no rendered effect carrier");

  if (snapshot.notifications.length < 3)
    failures.push(
      `only ${snapshot.notifications.length} notifications rendered`,
    );
  snapshot.notifications.forEach((notification, index) => {
    if (!notification.copy) failures.push(`notification ${index + 1} is empty`);
    if (!notification.activeGlass)
      failures.push(`notification ${index + 1} glass backend is inactive`);
    if (!notification.effectCarrier)
      failures.push(`notification ${index + 1} has no rendered effect carrier`);
  });

  for (const broken of snapshot.brokenScenes)
    failures.push(`broken scene: ${broken}`);
  if (snapshot.snippets.empty)
    failures.push(`${snapshot.snippets.empty} public code snippets are empty`);
  if (snapshot.snippets.packageImports < 2)
    failures.push("public code snippets do not demonstrate package imports");
  if (!snapshot.snippets.reactImport)
    failures.push("public snippets omit @tomagranate/liquid-glass/react");
  if (snapshot.snippets.sourceImports)
    failures.push("public snippets expose internal source imports");

  for (const slider of snapshot.sliders) {
    if (slider.horizontalDelta > 7 || slider.verticalDelta > 5) {
      failures.push(
        `${slider.label} thumb is misaligned (${slider.horizontalDelta.toFixed(1)}px x, ${slider.verticalDelta.toFixed(1)}px y)`,
      );
    }
  }
  for (const toggle of snapshot.switches) {
    if (toggle.verticalDelta > 5 || !toggle.insideTrack)
      failures.push(`${toggle.label} thumb is not centered in its track`);
  }
  return failures;
}
import { PNG } from "pngjs";
