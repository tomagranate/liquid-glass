/** Material parameters shared by the WebGL renderers. */
export interface LensMaterial {
  /** corner radius, CSS px (large value → pill/circle) */
  radius?: number;
  /** refracting rim thickness, CSS px */
  depth?: number;
  /** displacement strength, CSS px */
  scale?: number;
  /** chromatic aberration, 0..1 */
  chroma?: number;
  /** specular highlight strength, 0..1 */
  specular?: number;
  /** CSS-like bevel/rim light strength, 0..1 */
  rimLight?: number;
  /** stacking order for the layered compositor (higher = on top) */
  z?: number;
}

/** A lens rectangle, in CSS px relative to the canvas top-left. */
export interface LensRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A full lens spec: where it is plus how it looks. */
export type LensSpec = LensRect & LensMaterial;
