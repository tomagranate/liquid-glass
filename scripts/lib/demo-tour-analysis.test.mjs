import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKEND_CASES,
  DEMO_CASES,
  expectedBackendFamily,
  severeBrowserLogs,
  validateDemoSnapshot,
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
