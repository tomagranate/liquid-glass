/**
 * map.ts
 * ------
 * The displacement map: a small PNG drawn on a `<canvas>`. R/G encode how far
 * each pixel bends in x/y (128 = no shift); B carries an optional specular
 * value. A second synchronous generator renders that same specular field as
 * a white alpha bitmap for the Chromium backdrop filter chain. The lens is a
 * rounded-rectangle signed-distance field: bending is concentrated in a rim
 * of thickness `depth` and fades to zero toward the centre — a clear middle
 * with a refractive bevel, like real curved glass.
 */

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
const smoothstep = (t: number): number =>
  t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

/** Signed distance to an axis-aligned rounded rectangle, centred at origin. */
function sdfRoundRect(
  px: number,
  py: number,
  hw: number,
  hh: number,
  r: number,
): number {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  return (
    Math.min(Math.max(qx, qy), 0) +
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
    r
  );
}

export interface DisplacementMapOptions {
  /** lens width, CSS px */
  width: number;
  /** lens height, CSS px */
  height: number;
  /** corner radius, CSS px */
  radius?: number;
  /** refracting rim thickness, CSS px */
  depth?: number;
  /** super-sampling factor for a crisp map */
  dpr?: number;
  /** specular strength baked into the blue channel, 0..1 */
  specular?: number;
  /** light direction, degrees */
  specularAngle?: number;
  /**
   * Neutral (no-bend) margin, CSS px, left around the lens shape. The rounded
   * rect is inset by this much so the map fades to flat grey before the edge —
   * needed when the map is placed as a movable sub-lens inside a larger filter,
   * so the bend transitions seamlessly into the surrounding (flat) surface.
   */
  inset?: number;
  /**
   * Shape the alpha channel by SDF coverage: 255 inside the rounded rect, 0
   * outside, with a ~1px smoothstep edge (which also antialiases the lens
   * silhouette). Opt-in and lens-only: this map must sit over a neutral flood
   * (the lens sub-filter), never be used alone as a full-element map — alpha-0
   * corner pixels would un-premultiply to garbage displacement.
   */
  maskAlpha?: boolean;
  /**
   * Signed displacement amplitude multiplier applied to dx/dy before the 128
   * offset (clamped). A negative value reverses the sampling direction. Lets
   * several lenses of different strengths share one filter
   * chain: the chain runs at the strongest lens's scale and each weaker lens
   * bakes `ownScale / chainScale` into its map. Default 1.
   */
  amplitude?: number;
}

/** Render the displacement map and return a PNG data URL (or null if no 2D ctx). */
export function generateDisplacementMap(
  o: DisplacementMapOptions,
): string | null {
  const {
    width,
    height,
    radius = 0,
    depth = 12,
    dpr = 2,
    specular = 0,
    specularAngle = 135,
    inset = 0,
    maskAlpha = false,
    amplitude = 1,
  } = o;

  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const img = ctx.createImageData(w, h);
  const data = img.data;

  // Half-extents of the lens shape, shrunk by `inset` so a flat-grey margin
  // surrounds it (see `inset` docs).
  const ins = Math.max(0, inset * dpr);
  const cx = w / 2;
  const cy = h / 2;
  const hw = cx - ins;
  const hh = cy - ins;
  const r = Math.min(Math.max(0, radius * dpr), Math.min(hw, hh));
  const rim = Math.max(1, depth * dpr);
  // Edge width for the opt-in coverage alpha, ~1 CSS px in device pixels.
  const aa = Math.max(1, dpr);
  // Coverage alpha from a signed distance: 255 well inside, 0 well outside,
  // a smoothstep across `aa` device px centred on the boundary.
  const coverageAlpha = (sdf: number): number =>
    clampByte((1 - smoothstep(sdf / aa + 0.5)) * 255);

  const la = (specularAngle * Math.PI) / 180;
  const lx = Math.cos(la);
  const ly = Math.sin(la);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;

      const sdf = sdfRoundRect(px, py, hw, hh, r);

      if (sdf >= 0) {
        data[idx] = 128;
        data[idx + 1] = 128;
        data[idx + 2] = 128;
        data[idx + 3] = maskAlpha ? coverageAlpha(sdf) : 255;
        continue;
      }

      let gx =
        sdfRoundRect(px + 1, py, hw, hh, r) -
        sdfRoundRect(px - 1, py, hw, hh, r);
      let gy =
        sdfRoundRect(px, py + 1, hw, hh, r) -
        sdfRoundRect(px, py - 1, hw, hh, r);
      const glen = Math.hypot(gx, gy) || 1;
      gx /= glen;
      gy /= glen;

      const mag = 1 - smoothstep(-sdf / rim);
      const dx = gx * mag * amplitude;
      const dy = gy * mag * amplitude;

      data[idx] = clampByte((0.5 + 0.5 * dx) * 255);
      data[idx + 1] = clampByte((0.5 + 0.5 * dy) * 255);

      let b = 128;
      if (specular > 0) {
        const facing = Math.max(0, gx * lx + gy * ly);
        const s = specular * mag * facing ** 2;
        b = clampByte(128 + 127 * Math.min(1, s));
      }
      data[idx + 2] = b;
      data[idx + 3] = maskAlpha ? coverageAlpha(sdf) : 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export interface SpecularHighlightMapOptions {
  /** lens width, CSS px */
  width: number;
  /** lens height, CSS px */
  height: number;
  /** corner radius, CSS px */
  radius?: number;
  /** refracting rim thickness, CSS px */
  depth?: number;
  /** super-sampling factor for a crisp map */
  dpr?: number;
  /** specular strength, 0..1 */
  specular: number;
  /** light direction, degrees */
  specularAngle?: number;
}

/**
 * Render the displacement map's specular field directly as a white alpha
 * bitmap. It is composited inside the Chromium backdrop SVG filter; keeping
 * it in-chain avoids a blending sibling, which would make the panel a
 * backdrop root and leave the filter sampling an empty (black) interior.
 */
export function generateSpecularHighlight(
  o: SpecularHighlightMapOptions,
): string | null {
  const {
    width,
    height,
    radius = 0,
    depth = 12,
    dpr = 2,
    specular,
    specularAngle = 135,
  } = o;
  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const img = ctx.createImageData(w, h);
  const data = img.data;
  const cx = w / 2;
  const cy = h / 2;
  const hw = cx;
  const hh = cy;
  const r = Math.min(Math.max(0, radius * dpr), Math.min(hw, hh));
  const rim = Math.max(1, depth * dpr);
  const la = (specularAngle * Math.PI) / 180;
  const lx = Math.cos(la);
  const ly = Math.sin(la);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;
      const sdf = sdfRoundRect(px, py, hw, hh, r);

      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      if (sdf >= 0) {
        data[idx + 3] = 0;
        continue;
      }

      let gx =
        sdfRoundRect(px + 1, py, hw, hh, r) -
        sdfRoundRect(px - 1, py, hw, hh, r);
      let gy =
        sdfRoundRect(px, py + 1, hw, hh, r) -
        sdfRoundRect(px, py - 1, hw, hh, r);
      const glen = Math.hypot(gx, gy) || 1;
      gx /= glen;
      gy /= glen;

      const mag = 1 - smoothstep(-sdf / rim);
      const facing = Math.max(0, gx * lx + gy * ly);
      const s = specular * mag * facing ** 2;
      // The second specular factor intentionally matches the former
      // displacement-blue-channel + baked-overlay pipeline byte-for-byte.
      data[idx + 3] = clampByte(127 * Math.min(1, s) * specular);
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}
