/**
 * @tomagranate/liquid-glass
 *
 * A liquid-glass (Apple-style refraction) effect for the web. The effect rests
 * on a single SVG filter primitive, `feDisplacementMap`, applied to painted
 * content. Nothing is sampled from underneath the glass — the content's own
 * pixels are the ones moving, so it works in every browser with a plain
 * `filter: url(#glass)`.
 *
 * - SVG engine ({@link applyGlass} / {@link createGlassController}):
 *   framework-independent, cross-browser. The recommended default.
 * - React bindings: {@link useGlass} drives the SVG engine from a component;
 *   {@link useGlassTexture} drives {@link WebGLGlass} for surfaces SVG filters
 *   can't read (a `<canvas>` QR code, a playing `<video>`). Import the stylesheet
 *   once: `import "@tomagranate/liquid-glass/styles.css"`.
 *
 * Pre-styled components (button, switch, slider, toggle, QR, video player) are
 * not shipped — see `examples/demo/src/glass` for reference implementations you
 * can copy and restyle.
 */

// ── React bindings ──────────────────────────────────────────────────────────
export { useGlass } from "./react/useGlass.js";
export type { UseGlassResult } from "./react/useGlass.js";
export { useGlassTexture } from "./react/useGlassTexture.js";
export type { UseGlassTextureParams } from "./react/useGlassTexture.js";

// ── Core: SVG `feDisplacementMap` engine ────────────────────────────────────
export {
  applyGlass,
  createGlassController,
  generateDisplacementMap,
  buildGlassFilter,
  moveFilterLens,
} from "./core/liquid-glass.js";
export type {
  GlassOptions,
  GlassController,
  GlassLayers,
  AlignTo,
  DisplacementMapOptions,
  GlassFilterOptions,
} from "./core/liquid-glass.js";

// ── Core: WebGL texture backend (canvas / video) ────────────────────────────
export { WebGLGlass } from "./core/liquid-glass-webgl.js";

// ── Shared types ────────────────────────────────────────────────────────────
export type { LensMaterial, LensRect, LensSpec } from "./core/types.js";
