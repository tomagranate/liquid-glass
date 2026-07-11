import { setBackground as setDefaultBackground } from "./background.js";
import { glass as createLens } from "./glass.js";
import { MediaSurface } from "./media.js";
import { diagnosticsSnapshot, type ScopeRuntime } from "./runtime.js";
import { ContentSurface } from "./surfaces.js";
import type {
  GlassHandle,
  GlassScope,
  GlassScopeOptions,
  MediaSurfaceOptions,
  SurfaceHandle,
  SurfaceOptions,
} from "./types.js";

function runtimeOf(options: GlassScopeOptions = {}): ScopeRuntime {
  const { budgets, ...defaults } = options;
  return {
    content: new Set(),
    media: new Set(),
    lenses: new Set(),
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
  return {
    glass(element, lensOptions = {}): GlassHandle {
      assertLive();
      return createLens(
        element,
        { ...runtime.defaults, ...lensOptions },
        runtime,
      );
    },
    createSurface(element, surfaceOptions: SurfaceOptions = {}): SurfaceHandle {
      assertLive();
      return new ContentSurface(element, surfaceOptions, runtime);
    },
    createMediaSurface(
      media,
      mediaOptions: MediaSurfaceOptions = {},
    ): SurfaceHandle {
      assertLive();
      return new MediaSurface(media, mediaOptions, runtime);
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
