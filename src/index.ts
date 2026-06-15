/**
 * @tomagranate/liquid-glass
 *
 * A liquid-glass (Apple-style refraction) effect for the web.
 *
 * - Vanilla SVG-filter backend ({@link applyGlass}): framework-independent,
 *   cross-browser, refracts a copy of the backdrop. The recommended default
 *   for most sites and apps.
 * - React kit: wrap your app in {@link GlassStage} and turn any element into a
 *   lens with {@link useGlassLens}. Import the stylesheet once:
 *   `import "@tomagranate/liquid-glass/styles.css"`.
 * - Low-level WebGL renderers ({@link GlassFieldGL}, {@link GlassCompositor},
 *   {@link WebGLGlass}) for custom pipelines and texture sources.
 *
 * Pre-styled components (button, switch, slider, toggle, magnifier) are not
 * shipped — see `examples/demo/src/glass` for reference implementations you can
 * copy and restyle.
 */

// ── React kit: WebGL stage + lens hook ──────────────────────────────────────
export { GlassStage, useGlassStage } from "./react/GlassStage.js";
export type { GlassStageApi } from "./react/GlassStage.js";
export { useGlassLens } from "./react/useGlassLens.js";

// ── Core: WebGL renderers ───────────────────────────────────────────────────
export { GlassFieldGL } from "./core/glass-field.js";
export type { GlassFieldOptions } from "./core/glass-field.js";
export { GlassCompositor } from "./core/glass-compositor.js";
export type { DomPlacement } from "./core/glass-compositor.js";
export { WebGLGlass } from "./core/liquid-glass-webgl.js";

// ── Core: vanilla SVG-filter backend ────────────────────────────────────────
export {
  applyGlass,
  createGlassController,
  generateDisplacementMap,
  buildGlassFilter,
} from "./core/liquid-glass.js";
export type {
  GlassOptions,
  GlassController,
  GlassLayers,
  AlignTo,
  DisplacementMapOptions,
  GlassFilterOptions,
} from "./core/liquid-glass.js";

// ── Shared types ────────────────────────────────────────────────────────────
export type { LensMaterial, LensRect, LensSpec } from "./core/types.js";
