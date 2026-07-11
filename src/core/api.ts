import { defaultGlassScope, setDefaultScopeBackground } from "./scope.js";
import type {
  GlassHandle,
  GlassOptions,
  MediaSurfaceOptions,
  SurfaceHandle,
  SurfaceOptions,
} from "./types.js";

export function glass(
  element: HTMLElement,
  options: GlassOptions = {},
): GlassHandle {
  return defaultGlassScope.glass(element, options);
}

export function createSurface(
  element: HTMLElement,
  options: SurfaceOptions = {},
): SurfaceHandle {
  return defaultGlassScope.createSurface(element, options);
}

export function createMediaSurface(
  media: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  options: MediaSurfaceOptions = {},
): SurfaceHandle {
  return defaultGlassScope.createMediaSurface(media, options);
}

export function setBackground(background: string | null): void {
  setDefaultScopeBackground(background);
}
