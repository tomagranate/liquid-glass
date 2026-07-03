import { createContext } from "react";

/**
 * True inside a refraction copy — the duplicate of the page content that a
 * glass surface (nav bar, draggable lens) renders into its backdrop layer so
 * real DOM content bends through it (refraction-target mode).
 *
 * Inside a copy every glass component renders a *flat* variant: identical
 * markup and dimensions, but no SVG filters, no controllers, no video and no
 * WebGL. The copy only exists to be refracted, so a cheap look-alike is all
 * that's needed — and it avoids nested filters and duplicated media pipelines.
 */
export const GlassCopyContext = createContext(false);
