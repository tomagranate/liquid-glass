import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import {
  analyzeVisualRoi,
  BACKEND_CASES,
  DEMO_CASES,
  expectedBackendFamily,
  severeBrowserLogs,
  validateDemoSnapshot,
  validateSceneSnapshot,
} from "./demo-tour-analysis.mjs";

function validSnapshot(browser = "chrome") {
  return {
    cases: [...DEMO_CASES],
    duplicateIds: [],
    unnamedControls: [],
    inputsWithoutName: [],
    densityLenses: 32,
    horizontalOverflow: 0,
    reducedMotionRule: true,
    viewportWidth: 390,
    backends: Object.fromEntries(
      BACKEND_CASES.map((demoCase) => [
        demoCase,
        [expectedBackendFamily(browser, demoCase)[0]],
      ]),
    ),
  };
}

test("accepts a complete branded-browser catalogue snapshot", () => {
  assert.deepEqual(validateDemoSnapshot(validSnapshot(), "chrome"), []);
});

test("rejects missing cases, density drift, duplicate IDs, and overflow", () => {
  const snapshot = validSnapshot();
  snapshot.cases.pop();
  snapshot.densityLenses = 31;
  snapshot.duplicateIds = ["catalogue"];
  snapshot.unnamedControls = ["button:nth-of-type(2)"];
  snapshot.inputsWithoutName = ['input[type="range"]'];
  snapshot.horizontalOverflow = 24;
  snapshot.reducedMotionRule = false;
  const failures = validateDemoSnapshot(snapshot, "chrome");
  assert.ok(
    failures.some((failure) => failure.startsWith("missing demo case")),
  );
  assert.ok(failures.includes("density lens count 31; expected 32"));
  assert.ok(failures.includes("duplicate id: catalogue"));
  assert.ok(failures.includes("unnamed control: button:nth-of-type(2)"));
  assert.ok(failures.includes('input missing name: input[type="range"]'));
  assert.ok(
    failures.some((failure) => failure.startsWith("horizontal overflow")),
  );
  assert.ok(failures.includes("reduced-motion CSS invariant is missing"));
});

test("rejects absent, substituted, and unknown browser backends", () => {
  const absent = validSnapshot("firefox");
  absent.backends["bounded-content-surface"] = [];
  assert.ok(
    validateDemoSnapshot(absent, "firefox").some((failure) =>
      failure.includes("backend missing"),
    ),
  );

  const substituted = validSnapshot("firefox");
  substituted.backends["density-32-lenses"] = ["backdrop"];
  assert.ok(
    validateDemoSnapshot(substituted, "firefox").some((failure) =>
      failure.includes("expected family"),
    ),
  );

  const unknown = validSnapshot();
  unknown.backends["density-32-lenses"] = ["playwright-webkit"];
  assert.ok(
    validateDemoSnapshot(unknown, "chrome").some((failure) =>
      failure.includes("unknown backend"),
    ),
  );

  const intendedContent = validSnapshot("firefox");
  intendedContent.backends["draggable-lens"] = ["native"];
  assert.ok(
    validateDemoSnapshot(intendedContent, "firefox").some(
      (failure) =>
        failure.includes("draggable-lens") &&
        failure.includes("expected family content-svg"),
    ),
  );
});

test("accepts the documented media fallback without WebGL2", () => {
  const snapshot = validSnapshot("firefox");
  snapshot.backends["canvas-media"] = ["none", "background-copy"];
  assert.deepEqual(
    validateDemoSnapshot(snapshot, "firefox", DEMO_CASES, {
      mediaWebglAvailable: false,
    }),
    [],
  );
  assert.ok(
    validateDemoSnapshot(snapshot, "firefox").some((failure) =>
      failure.includes("canvas-media"),
    ),
  );
});

test("normalizes only error-level browser log entries", () => {
  assert.deepEqual(
    severeBrowserLogs([
      { level: { name: "INFO" }, message: "ok" },
      { level: { name: "SEVERE" }, message: "broken" },
    ]).map((entry) => entry.message),
    ["broken"],
  );
});

test("visual ROI proof rejects blank output and accepts structured pixels", () => {
  const blank = new PNG({ width: 30, height: 30 });
  const structured = new PNG({ width: 30, height: 30 });
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < 30; x++) {
      const offset = (y * 30 + x) * 4;
      for (const png of [blank, structured]) png.data[offset + 3] = 255;
      blank.data[offset] = blank.data[offset + 1] = blank.data[offset + 2] = 90;
      const value = (x * 17 + y * 11) % 256;
      structured.data[offset] = value;
      structured.data[offset + 1] = 255 - value;
      structured.data[offset + 2] = (value * 3) % 256;
    }
  const roi = { x: 0, y: 0, width: 30, height: 30 };
  assert.equal(
    analyzeVisualRoi(PNG.sync.write(blank).toString("base64"), roi).pass,
    false,
  );
  assert.equal(
    analyzeVisualRoi(PNG.sync.write(structured).toString("base64"), roi).pass,
    true,
  );
});

test("scene contract rejects empty, inactive, misaligned product examples", () => {
  const failures = validateSceneSnapshot({
    dock: {
      apps: 0,
      labelled: 0,
      visibleIcons: 0,
      width: 0,
      height: 0,
      centerDelta: 50,
      activeGlass: false,
      effectCarrier: false,
    },
    notifications: [{ copy: false, activeGlass: false, effectCarrier: false }],
    brokenScenes: ["video-media collapsed"],
    snippets: {
      empty: 1,
      packageImports: 0,
      reactImport: false,
      sourceImports: 1,
    },
    sliders: [{ label: "Playback", horizontalDelta: 20, verticalDelta: 8 }],
    switches: [{ label: "Wi-Fi", verticalDelta: 8, insideTrack: false }],
  });
  assert.ok(failures.some((failure) => failure.includes("dock has 0 apps")));
  assert.ok(failures.some((failure) => failure.includes("notification 1")));
  assert.ok(failures.some((failure) => failure.includes("broken scene")));
  assert.ok(failures.some((failure) => failure.includes("misaligned")));
});
