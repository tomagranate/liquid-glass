import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRenderPreflight } from "./render-preflight.mjs";

test("accepts a visible page with active animation frames", () => {
  assert.deepEqual(
    evaluateRenderPreflight(
      { visibilityState: "visible", hidden: false },
      { rafCallbacks: 40, elapsed: 750 },
    ),
    { pass: true, reason: "render scheduling is active" },
  );
});

test("rejects a hidden page before benchmark scenarios run", () => {
  assert.deepEqual(
    evaluateRenderPreflight(
      { visibilityState: "hidden", hidden: true },
      { rafCallbacks: 0, elapsed: 750 },
    ),
    { pass: false, reason: "page is hidden" },
  );
});

test("rejects a visible page whose animation frames are starved", () => {
  assert.deepEqual(
    evaluateRenderPreflight(
      { visibilityState: "visible", hidden: false },
      { rafCallbacks: 0, elapsed: 750 },
    ),
    {
      pass: false,
      reason: "only 0 requestAnimationFrame callbacks fired in 750ms",
    },
  );
});
