import { describe, expect, it, vi } from "vitest";
import { generateDisplacementMap } from "./map.js";

describe("generateDisplacementMap", () => {
  it("returns null without a 2D canvas context (e.g. jsdom)", () => {
    // jsdom has no canvas backend; the function should degrade gracefully.
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);
    expect(generateDisplacementMap({ width: 40, height: 40 })).toBeNull();
    spy.mockRestore();
  });

  // jsdom has no canvas rasteriser, so stand in a fake 2D context that captures
  // the ImageData the generator writes, letting us inspect its channels.
  function captureMap(options: Parameters<typeof generateDisplacementMap>[0]): {
    data: Uint8ClampedArray;
    w: number;
  } {
    const captured: { data: Uint8ClampedArray; w: number } = {
      data: new Uint8ClampedArray(0),
      w: 0,
    };
    const fakeCtx = {
      createImageData(w: number, h: number) {
        const data = new Uint8ClampedArray(w * h * 4);
        captured.data = data;
        captured.w = w;
        return { data, width: w, height: h };
      },
      putImageData() {},
    };
    const ctxSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
    const urlSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png,x");
    generateDisplacementMap(options);
    ctxSpy.mockRestore();
    urlSpy.mockRestore();
    return captured;
  }

  const byteAt = (
    m: { data: Uint8ClampedArray; w: number },
    x: number,
    y: number,
    channel: number,
  ) => m.data[(y * m.w + x) * 4 + channel];

  it("shapes alpha by SDF coverage when maskAlpha is on", () => {
    const m = captureMap({
      width: 40,
      height: 40,
      radius: 8,
      dpr: 1,
      inset: 0,
      maskAlpha: true,
    });
    // Well inside the rounded rect → fully covered; a corner is outside it → 0.
    expect(byteAt(m, 20, 20, 3)).toBe(255);
    expect(byteAt(m, 0, 0, 3)).toBe(0);
  });

  it("leaves alpha fully opaque when maskAlpha is off (default path)", () => {
    const m = captureMap({
      width: 40,
      height: 40,
      radius: 8,
      dpr: 1,
      inset: 0,
    });
    expect(byteAt(m, 20, 20, 3)).toBe(255);
    expect(byteAt(m, 0, 0, 3)).toBe(255);
  });

  it("scales dx/dy displacement by amplitude before the 128 offset", () => {
    const base = { width: 40, height: 40, radius: 0, depth: 16, dpr: 1 };
    const full = captureMap({ ...base, amplitude: 1 });
    const half = captureMap({ ...base, amplitude: 0.5 });

    // A rim pixel near the left edge bends leftwards (dx < 0 → byte < 128).
    const fullDx = byteAt(full, 2, 20, 0) - 128;
    const halfDx = byteAt(half, 2, 20, 0) - 128;
    expect(fullDx).toBeLessThan(-20);
    expect(Math.abs(halfDx - fullDx / 2)).toBeLessThanOrEqual(1);

    // Same for dy on the top edge.
    const fullDy = byteAt(full, 20, 2, 1) - 128;
    const halfDy = byteAt(half, 20, 2, 1) - 128;
    expect(fullDy).toBeLessThan(-20);
    expect(Math.abs(halfDy - fullDy / 2)).toBeLessThanOrEqual(1);

    // The neutral centre stays neutral regardless of amplitude
    // (127 vs 128: 0.5 × 255 truncates).
    expect(Math.abs(byteAt(half, 20, 20, 0) - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(byteAt(half, 20, 20, 1) - 128)).toBeLessThanOrEqual(1);
  });
});
