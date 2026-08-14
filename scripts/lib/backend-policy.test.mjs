import test from "node:test";
import assert from "node:assert/strict";
import { expectedBackend } from "../../tests/perf/backend-policy.js";

const chrome =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const firefox = "Mozilla/5.0 Gecko/20100101 Firefox/141.0";
const safari =
  "Mozilla/5.0 AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

test("keeps dense background copies active in Chrome and Firefox", () => {
  assert.deepEqual(expectedBackend("background-copy-scroll-32", chrome), [
    "background-copy",
  ]);
  assert.deepEqual(expectedBackend("background-copy-scroll-32", firefox), [
    "background-copy",
  ]);
});

test("limits dense background copies to Safari's native fallback", () => {
  assert.deepEqual(expectedBackend("background-copy-scroll-1", safari), [
    "background-copy",
  ]);
  assert.deepEqual(expectedBackend("background-copy-scroll-8", safari), [
    "native",
  ]);
  assert.deepEqual(expectedBackend("background-copy-scroll-32", safari), [
    "native",
  ]);
});

test("accepts the documented media fallback without WebGL2", () => {
  assert.deepEqual(
    expectedBackend("media-live-1", firefox, {
      mediaWebglAvailable: false,
    }),
    ["none"],
  );
});
