import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyPerfBuild } from "./perf-build.mjs";

test("missing production fixture fails immediately with the build command", async () => {
  const root = await mkdtemp(join(tmpdir(), "liquid-glass-perf-"));
  await assert.rejects(verifyPerfBuild(root), (error) => {
    assert.match(error.message, /missing dist\/perf\/index\.html/);
    assert.match(error.message, /npm run build && npm run build:perf/);
    return true;
  });
});

test("an index referencing a missing production asset fails preflight", async () => {
  const root = await mkdtemp(join(tmpdir(), "liquid-glass-perf-"));
  await mkdir(join(root, "dist/perf"), { recursive: true });
  await writeFile(
    join(root, "dist/perf/index.html"),
    '<script type="module" src="/assets/missing.js"></script>',
  );
  await assert.rejects(
    verifyPerfBuild(root),
    /missing asset \/assets\/missing\.js/,
  );
});
