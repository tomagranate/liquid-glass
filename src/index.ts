/**
 * @tomagranate/liquid-glass
 *
 * A liquid-glass (Apple-style refraction) effect for the web.
 *
 * - WebGL stage + React components (the default): wrap your app in
 *   {@link GlassStage} and use the components, or {@link useGlassLens} to turn
 *   any element into a lens. Import the stylesheet once:
 *   `import "@tomagranate/liquid-glass/styles.css"`.
 * - Vanilla SVG-filter backend ({@link applyGlass}): framework-independent,
 *   cross-browser, refracts a copy of the backdrop.
 * - Low-level WebGL renderers ({@link GlassFieldGL}, {@link GlassCompositor},
 *   {@link WebGLGlass}) for custom pipelines and texture sources.
 */

// ── React: WebGL stage + components ─────────────────────────────────────────
export { GlassStage, useGlassStage } from "./react/GlassStage.js";
export type { GlassStageApi } from "./react/GlassStage.js";
export { useGlassLens } from "./react/useGlassLens.js";
export { GlassButton } from "./react/GlassButton.js";
export type { GlassButtonProps } from "./react/GlassButton.js";
export { GlassSwitch } from "./react/GlassSwitch.js";
export type { GlassSwitchProps } from "./react/GlassSwitch.js";
export { GlassSlider } from "./react/GlassSlider.js";
export type { GlassSliderProps } from "./react/GlassSlider.js";
export { GlassToggleGroup } from "./react/GlassToggleGroup.js";
export type {
  GlassToggleGroupProps,
  ToggleOption,
} from "./react/GlassToggleGroup.js";
export { Magnifier } from "./react/Magnifier.js";
export type { MagnifierProps } from "./react/Magnifier.js";

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
