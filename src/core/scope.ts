import { setBackground as setDefaultBackground } from "./background.js";
import { glass as createLens } from "./glass.js";
import { MediaSurface } from "./media.js";
import { diagnosticsSnapshot, type ScopeRuntime } from "./runtime.js";
import { ContentSurface } from "./surfaces.js";
import type {
  GlassAppearanceOptions,
  GlassHandle,
  GlassMediaHandle,
  GlassOverMediaOptions,
  GlassOverRegionOptions,
  GlassRegionHandle,
  GlassScope,
  GlassScopeOptions,
  GlassSourceHandle,
  MediaSurfaceOptions,
  SurfaceOptions,
} from "./types.js";

function runtimeOf(options: GlassScopeOptions = {}): ScopeRuntime {
  const { budgets, ...defaults } = options;
  return {
    content: new Set(),
    media: new Set(),
    lenses: new Set(),
    backdropWorkloads: new Map(),
    backdropDevicePixelPassArea: 0,
    backdropQualityCounts: { performance: 0, balanced: 0, fidelity: 0 },
    backdropRefreshQueued: false,
    backgroundCopyWorkloads: new Map(),
    backgroundCopyDevicePixelPassArea: 0,
    backgroundCopyRefreshQueued: false,
    defaults,
    budgets,
    diagnostics: {
      lenses: 0,
      contentSurfaces: 0,
      mediaSurfaces: 0,
      filterRebuilds: 0,
      mapRegenerations: 0,
      geometryRafCallbacks: 0,
      mediaRafCallbacks: 0,
      mediaUploads: 0,
      backdropWorkload: {
        lenses: 0,
        devicePixelPassArea: 0,
        tier: "full",
        reason: "within-aggregate-backdrop-budget",
      },
      backgroundCopyWorkload: {
        lenses: 0,
        devicePixelPassArea: 0,
        tier: "full",
        reason: "within-aggregate-background-copy-budget",
      },
      policy: [],
    },
    background: null,
    destroyed: false,
  };
}

export function createGlassScope(options: GlassScopeOptions = {}): GlassScope {
  const runtime = runtimeOf(options);
  const assertLive = (): void => {
    if (runtime.destroyed) throw new Error("liquid-glass: scope is destroyed");
  };
  const createScopedLens = (
    element: HTMLElement,
    lensOptions: GlassAppearanceOptions,
    request: "page" | "region" | "media" | "wallpaper",
    routing: Pick<import("./types.js").GlassOptions, "surfaces" | "background">,
  ): GlassSourceHandle => {
    assertLive();
    return createLens(
      element,
      { ...runtime.defaults, ...lensOptions, ...routing },
      runtime,
      request,
    ) as GlassSourceHandle;
  };
  const createRegion = (
    element: HTMLElement,
    surfaceOptions: SurfaceOptions = {},
  ): GlassRegionHandle => {
    assertLive();
    return new ContentSurface(element, surfaceOptions, runtime);
  };
  const createMedia = (
    media: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    mediaOptions: MediaSurfaceOptions = {},
  ): GlassMediaHandle => {
    assertLive();
    return new MediaSurface(media, mediaOptions, runtime);
  };
  return {
    glass(element, lensOptions = {}): GlassHandle {
      assertLive();
      return createLens(
        element,
        { ...runtime.defaults, ...lensOptions },
        runtime,
      );
    },
    glassOverPage(element, lensOptions = {}) {
      return createScopedLens(element, lensOptions, "page", {
        surfaces: [],
        background: "auto",
      });
    },
    glassOverRegion(
      element,
      options: GlassOverRegionOptions = {},
    ): GlassHandle {
      const { region, ...lensOptions } = options;
      const surfaces = region
        ? Array.isArray(region)
          ? [...region]
          : [region]
        : "auto";
      return createScopedLens(element, lensOptions, "region", {
        surfaces,
        background: false,
      });
    },
    glassOverMedia(element, options: GlassOverMediaOptions = {}): GlassHandle {
      const { media, ...lensOptions } = options;
      const surfaces = media
        ? Array.isArray(media)
          ? [...media]
          : [media]
        : "auto";
      return createScopedLens(element, lensOptions, "media", {
        surfaces,
        background: false,
      });
    },
    glassOverWallpaper(element, wallpaper, lensOptions = {}) {
      return createScopedLens(element, lensOptions, "wallpaper", {
        surfaces: [],
        background: wallpaper,
      });
    },
    createGlassRegion(element, surfaceOptions = {}) {
      return createRegion(element, surfaceOptions);
    },
    createGlassMedia(media, mediaOptions = {}) {
      return createMedia(media, mediaOptions);
    },
    createSurface(element, surfaceOptions = {}) {
      return createRegion(element, surfaceOptions);
    },
    createMediaSurface(media, mediaOptions = {}) {
      return createMedia(media, mediaOptions);
    },
    setBackground(background): void {
      assertLive();
      runtime.background = background;
      for (const lens of runtime.lenses) lens.refresh();
      for (const surface of [...runtime.content, ...runtime.media]) {
        surface.refresh();
      }
    },
    getDiagnostics() {
      return diagnosticsSnapshot(runtime.diagnostics);
    },
    destroy(): void {
      if (runtime.destroyed) return;
      for (const lens of Array.from(runtime.lenses)) lens.destroy();
      for (const surface of Array.from(runtime.content)) surface.destroy();
      for (const surface of Array.from(runtime.media)) surface.destroy();
      runtime.destroyed = true;
    },
  };
}

/** Default singleton retained by the top-level convenience API. */
export const defaultGlassScope = createGlassScope();

/** Keep the legacy default background setter connected to existing subscribers. */
export function setDefaultScopeBackground(background: string | null): void {
  setDefaultBackground(background);
  defaultGlassScope.setBackground(background);
}
