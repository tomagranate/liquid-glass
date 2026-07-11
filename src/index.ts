/**
 * @tomagranate/liquid-glass
 *
 * A liquid-glass (Apple-style refraction) effect for the web. The effect rests
 * on a single SVG filter primitive, `feDisplacementMap`, applied to painted
 * content. Nothing is sampled from underneath the glass — the content's own
 * pixels are the ones moving. Chromium gets a compositor backdrop tier;
 * Firefox and Safari use budgeted copy/content paths with explicit fallbacks.
 *
 * One call per glass panel — {@link glass} — works
 * with zero configuration over any page, and gets better when the page
 * registers surfaces:
 *
 * - {@link createSurface} registers a live DOM subtree; lenses bend its
 *   pixels in place (content stays selectable and clickable).
 * - {@link createMediaSurface} registers a `<video>`/`<canvas>`/`<img>`;
 *   lenses refract it through a WebGL overlay.
 * - The page background is detected automatically from `document.body`
 *   (override with {@link setBackground}).
 *
 * Import the stylesheet once: `import "@tomagranate/liquid-glass/styles.css"`.
 */

// ── Vanilla API ─────────────────────────────────────────────────────────────
export {
  glass,
  createSurface,
  createMediaSurface,
  setBackground,
} from "./core/api.js";
export { createGlassScope } from "./core/scope.js";
export type {
  GlassBackend,
  GlassFallback,
  GlassMaterial,
  GlassOptions,
  GlassHandle,
  GlassPreset,
  GlassQuality,
  GlassBudgets,
  GlassDiagnostics,
  GlassScope,
  GlassScopeOptions,
  SurfaceOptions,
  SurfaceHandle,
  MediaSurfaceOptions,
} from "./core/types.js";

// ── Low-level building blocks ───────────────────────────────────────────────
export { generateDisplacementMap } from "./core/map.js";
export type { DisplacementMapOptions } from "./core/map.js";
export { buildGlassFilter, moveFilterLens } from "./core/filter.js";
export type { GlassFilterOptions } from "./core/filter.js";
export { WebGLGlass } from "./core/liquid-glass-webgl.js";
export type {
  SubLens,
  LensMaterial,
  LensRect,
  LensSpec,
} from "./core/types.js";
