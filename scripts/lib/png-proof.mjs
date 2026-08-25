import { PNG } from "pngjs";

export function compareRoi(effectBase64, controlBase64, roi) {
  const effect = PNG.sync.read(Buffer.from(effectBase64, "base64"));
  const control = PNG.sync.read(Buffer.from(controlBase64, "base64"));
  const x0 = Math.max(0, Math.floor(roi.x));
  const y0 = Math.max(0, Math.floor(roi.y));
  const x1 = Math.min(effect.width, Math.ceil(roi.x + roi.width));
  const y1 = Math.min(effect.height, Math.ceil(roi.y + roi.height));
  let changed = 0;
  let pixels = 0;
  let alpha = 0;
  let luminanceSquared = 0;
  let luminance = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const offset = (y * effect.width + x) * 4;
      const delta =
        Math.abs(effect.data[offset] - control.data[offset]) +
        Math.abs(effect.data[offset + 1] - control.data[offset + 1]) +
        Math.abs(effect.data[offset + 2] - control.data[offset + 2]);
      if (delta > 18) changed++;
      const light =
        (effect.data[offset] +
          effect.data[offset + 1] +
          effect.data[offset + 2]) /
        3;
      luminance += light;
      luminanceSquared += light * light;
      alpha += effect.data[offset + 3];
      pixels++;
    }
  const mean = luminance / Math.max(1, pixels);
  return {
    pixels,
    changedRatio: changed / Math.max(1, pixels),
    meanAlpha: alpha / Math.max(1, pixels),
    variance: luminanceSquared / Math.max(1, pixels) - mean * mean,
    pass:
      pixels > 100 &&
      changed / pixels > 0.003 &&
      alpha / pixels > 240 &&
      luminanceSquared / pixels - mean * mean > 1,
  };
}

export function renderRoiDiff(effectBase64, controlBase64, roi) {
  const effect = PNG.sync.read(Buffer.from(effectBase64, "base64"));
  const control = PNG.sync.read(Buffer.from(controlBase64, "base64"));
  const x0 = Math.max(0, Math.floor(roi.x));
  const y0 = Math.max(0, Math.floor(roi.y));
  const width = Math.max(
    1,
    Math.min(effect.width, Math.ceil(roi.x + roi.width)) - x0,
  );
  const height = Math.max(
    1,
    Math.min(effect.height, Math.ceil(roi.y + roi.height)) - y0,
  );
  const diff = new PNG({ width, height });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const source = ((y + y0) * effect.width + x + x0) * 4;
      const target = (y * width + x) * 4;
      diff.data[target] = Math.min(
        255,
        Math.abs(effect.data[source] - control.data[source]) * 4,
      );
      diff.data[target + 1] = Math.min(
        255,
        Math.abs(effect.data[source + 1] - control.data[source + 1]) * 4,
      );
      diff.data[target + 2] = Math.min(
        255,
        Math.abs(effect.data[source + 2] - control.data[source + 2]) * 4,
      );
      diff.data[target + 3] = 255;
    }
  return PNG.sync.write(diff);
}
