import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateInteractions,
  evaluatePair,
  summarize,
} from "./perf-analysis.mjs";

const thresholds = {
  minFrames: 80,
  maxP95: 34,
  maxP95Ratio: 1.35,
  maxDropRatio: 0.05,
};

test("injected 40ms work hard-fails paired timing", () => {
  const control = summarize(Array(90).fill(16.7), 16.7);
  const injected = summarize(Array(90).fill(56.7), 16.7);
  const result = evaluatePair(injected, control, thresholds);
  assert.equal(result.pass, false);
  assert.match(result.failures.join(" "), /paired p95/);
});

test("paired and absolute logic avoids a slow-host-only false positive", () => {
  const control = summarize(Array(90).fill(40), 16.7);
  const effect = summarize(Array(90).fill(42), 16.7);
  assert.equal(evaluatePair(effect, control, thresholds).pass, true);
});

test("interaction failures remain reportable without aborting later scenarios", () => {
  const result = evaluateInteractions([333, 216, 14, 29, 20], {
    interactionP95: 100,
    interactionWorst: 200,
  });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(" "), /interaction threshold/);
});
