import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { compareRoi } from "./png-proof.mjs";

function image(color) {
  const png = new PNG({ width: 20, height: 20 });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data.set(color, offset);
  }
  return PNG.sync.write(png).toString("base64");
}

test("blank or removed-looking output fails ROI correctness", () => {
  const blank = image([0, 0, 0, 0]);
  const control = image([50, 80, 120, 255]);
  assert.equal(
    compareRoi(blank, control, { x: 0, y: 0, width: 20, height: 20 }).pass,
    false,
  );
});
