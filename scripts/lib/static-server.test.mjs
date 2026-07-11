import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startStaticServer } from "./static-server.mjs";

test("serves byte ranges required by production video scrubbers", async () => {
  const root = await mkdtemp(join(tmpdir(), "liquid-glass-static-"));
  const bytes = Buffer.from("0123456789");
  await writeFile(join(root, "video.mp4"), bytes);
  const server = await startStaticServer(root);
  try {
    const response = await fetch(`${server.url}/video.mp4`, {
      headers: { Range: "bytes=3-6" },
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(response.headers.get("content-range"), "bytes 3-6/10");
    assert.equal(response.headers.get("content-length"), "4");
    assert.equal(await response.text(), "3456");
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unsatisfiable byte ranges", async () => {
  const root = await mkdtemp(join(tmpdir(), "liquid-glass-static-"));
  await writeFile(join(root, "video.mp4"), "short");
  const server = await startStaticServer(root);
  try {
    const response = await fetch(`${server.url}/video.mp4`, {
      headers: { Range: "bytes=99-100" },
    });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("content-range"), "bytes */5");
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
