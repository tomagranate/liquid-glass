/** Material parameters for the {@link WebGLGlass} texture backend. */
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

/** Visual material of a glass panel (filter + CSS chrome). */
export interface GlassMaterial {
  /** corner radius, px or "NN%" (default 16) */
  radius?: number | string;
  /** refracting rim thickness, px (default 14) */
  depth?: number;
  /** displacement strength, px (default 90) */
  scale?: number;
  /** frost, px (default 0.6) */
  blur?: number;
  /** chromatic aberration 0..1 (default 0.4) */
  chroma?: number;
  /** filter specular 0..1 (default 0) */
  specular?: number;
  /** light direction, degrees (default 135) */
  specularAngle?: number;
  /** displacement-map supersampling (default 2) */
  dpr?: number;
  /** CSS tint background (default "rgba(255,255,255,0.06)") */
  tint?: string;
  /** CSS bevel strength 0..1.5 (default 0.6) */
  rimLight?: number;
  /** CSS drop shadow */
  shadow?: string;
}

/** Renderer diagnostics reported by a glass lens. */
export type GlassBackend =
  | "backdrop"
  | "background-copy"
  | "content-svg"
  | "media-webgl"
  | "native"
  | "none";

/** Performance/fidelity policy. Budget enforcement is applied by the runtime. */
export type GlassQuality = "performance" | "balanced" | "fidelity";

/** Visual fallback used when the preferred renderer cannot run safely. */
export type GlassFallback = "blur" | "tint" | "none";

/** Curated material starting points. Explicit material options always win. */
export type GlassPreset = "thin" | "regular" | "prominent";

/** Options for {@link glass}. */
export interface GlassOptions extends GlassMaterial {
  /** Curated material starting point. Default `"regular"`. */
  preset?: GlassPreset;
  /** Runtime performance/fidelity policy. Default `"balanced"`. */
  quality?: GlassQuality;
  /** Degradation appearance. Default `"blur"`. */
  fallback?: GlassFallback;
  /** Called only when the stable ordered renderer set changes. */
  onBackendChange?: (backends: readonly GlassBackend[]) => void;
  /** Surfaces this lens may refract. Default "auto" = every registered surface. */
  surfaces?: "auto" | SurfaceHandle[];
  /** "live" = geometry re-read every frame (for JS-animated lenses). Default "auto". */
  track?: "auto" | "live";
  /**
   * The background copy behind uncovered lens area. Default "auto": paint it
   * unless a content/media surface fully covers the lens. `false` = never,
   * a CSS string = use that instead of the page background.
   */
  background?: "auto" | false | string;
}

/** Live handle returned by {@link glass}. */
export interface GlassHandle {
  /** Stable ordered renderers currently contributing to this lens. */
  readonly backends: readonly GlassBackend[];
  /** Material and option patches; cheap for CSS-only props. */
  update(patch: GlassOptions): void;
  /** Notify after programmatic moves outside scroll/resize. */
  geometryChanged(): void;
  /** Force full re-sync (maps, filters, routing). */
  refresh(): void;
  /** Restore the element completely. */
  destroy(): void;
}

/** Options for {@link createSurface}. */
export interface SurfaceOptions {
  /**
   * Paint the page background behind this surface's content (inside the
   * surface, in a `.lgs-bg` layer) so lenses bend wallpaper + content
   * together and `background-attachment: fixed`-style backdrops survive
   * filtering. true = auto-detected page background; string = explicit CSS.
   */
  background?: boolean | string;
}

/** Live handle returned by {@link createSurface} / {@link createMediaSurface}. */
export interface SurfaceHandle {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

/** Options for {@link createMediaSurface}. */
export interface MediaSurfaceOptions {
  /** Re-upload the source every frame while a lens overlaps (playing video). */
  live?: boolean;
}

/**
 * @internal Fully-resolved per-lens filter material (radius already in px for
 * the lens box). Not part of the public API.
 */
export interface ResolvedLensMaterial {
  radius: number;
  depth: number;
  scale: number;
  blur: number;
  chroma: number;
  specular: number;
  specularAngle: number;
  dpr: number;
  quality: GlassQuality;
  fallback: GlassFallback;
}

/** Provisional device-pixel area budgets; override after product calibration. */
export interface GlassBudgets {
  chromium?: number;
  firefox?: number;
  webkit?: number;
}

/** Defaults inherited by every lens created through a scope. */
export interface GlassScopeOptions extends GlassOptions {
  budgets?: GlassBudgets;
}

/** Stable counters intended for diagnostics and automated invariants. */
export interface GlassDiagnostics {
  readonly lenses: number;
  readonly contentSurfaces: number;
  readonly mediaSurfaces: number;
  readonly filterRebuilds: number;
  readonly mapRegenerations: number;
  readonly geometryRafCallbacks: number;
  readonly mediaRafCallbacks: number;
  readonly mediaUploads: number;
  readonly backdropWorkload: {
    readonly lenses: number;
    readonly devicePixelPassArea: number;
    readonly tier: "full" | "lean";
    readonly reason: string;
  };
  /** Aggregate painted-copy cost and the engine safety tier it selected. */
  readonly backgroundCopyWorkload: {
    readonly lenses: number;
    readonly devicePixelPassArea: number;
    readonly tier: "full" | "lean" | "native" | "partial";
    /** Lenses currently admitted to the refractive copy tier. */
    readonly admitted: number;
    readonly reason: string;
  };
  readonly policy: readonly {
    backend: GlassBackend;
    reason: string;
    dpr: number;
    chroma: number;
    specular: number;
    filterWidth: number;
    filterHeight: number;
    deviceArea: number;
  }[];
}

/** Isolated routing/background/runtime owner. */
export interface GlassScope {
  glass(element: HTMLElement, options?: GlassOptions): GlassHandle;
  createSurface(element: HTMLElement, options?: SurfaceOptions): SurfaceHandle;
  createMediaSurface(
    media: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    options?: MediaSurfaceOptions,
  ): SurfaceHandle;
  setBackground(background: string | null): void;
  getDiagnostics(): GlassDiagnostics;
  destroy(): void;
}

/** One movable lens inside a shared content-surface filter. */
export interface SubLens {
  /** stable per lens registration */
  id: string;
  /** lens box, CSS px in the filtered element's coordinate space */
  x: number;
  y: number;
  width: number;
  height: number;
  /** per-lens displacement map (own radius/depth/specular/amplitude) */
  mapUrl: string;
}
