import test from "node:test";
import assert from "node:assert/strict";
import {
  scenarioMotionMode,
  shouldNotifyManualGeometry,
} from "../../tests/perf/motion-policy.js";

test("backdrop scrolling uses native scroll events with zero manual geometry", () => {
  assert.equal(scenarioMotionMode("backdrop-scroll-32"), "scroll");
  assert.equal(shouldNotifyManualGeometry("backdrop-scroll-32"), false);
});

test("content small motion notifies genuinely moved lens geometry", () => {
  assert.equal(scenarioMotionMode("content-small-motion"), "moving-lens");
  assert.equal(shouldNotifyManualGeometry("content-small-motion"), true);
});
