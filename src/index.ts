/**
 * @tomagranate/liquid-glass
 *
 * A liquid-glass (Apple-style refraction) effect for the web. The effect rests
 * on a single SVG filter primitive, `feDisplacementMap`, applied to painted
 * content. Nothing is sampled from underneath the glass — the content's own
 * pixels are the ones moving. Chromium gets a compositor backdrop tier;
 * Firefox and Safari use budgeted copy/content paths with explicit fallbacks.
 *
 * The public API names the source behind each glass panel:
 *
 * - {@link glassOverPage} targets arbitrary live page content.
 * - {@link glassOverRegion} targets a source from {@link createGlassRegion}.
 * - {@link glassOverMedia} targets a source from {@link createGlassMedia}.
 * - {@link glassOverWallpaper} targets known CSS artwork.
 *
 * The automatic {@link glass} API remains for compatibility.
 *
 * Import the stylesheet once: `import "@tomagranate/liquid-glass/styles.css"`.
 */

// ── Vanilla API ─────────────────────────────────────────────────────────────
export {
  glass,
  glassOverPage,
  glassOverRegion,
  glassOverMedia,
  glassOverWallpaper,
  createGlassRegion,
  createGlassMedia,
  createSurface,
  createMediaSurface,
  setBackground,
} from "./core/api.js";
export { createGlassScope } from "./core/scope.js";
export type {
  GlassBackend,
  GlassAppearanceOptions,
  GlassFallback,
  GlassMaterial,
  GlassOptions,
  GlassHandle,
  GlassPreset,
  GlassQuality,
  GlassUseCase,
  GlassOverRegionOptions,
  GlassOverMediaOptions,
  GlassBudgets,
  GlassDiagnostics,
  GlassScope,
  GlassScopeOptions,
  GlassSourceHandle,
  SurfaceOptions,
  SurfaceHandle,
  GlassRegionHandle,
  GlassMediaHandle,
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
