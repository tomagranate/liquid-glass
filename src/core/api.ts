import { defaultGlassScope, setDefaultScopeBackground } from "./scope.js";
import type {
  GlassAppearanceOptions,
  GlassHandle,
  GlassMediaHandle,
  GlassOptions,
  GlassOverMediaOptions,
  GlassOverRegionOptions,
  GlassRegionHandle,
  GlassSourceHandle,
  MediaSurfaceOptions,
  SurfaceOptions,
} from "./types.js";

export function glass(
  element: HTMLElement,
  options: GlassOptions = {},
): GlassHandle {
  return defaultGlassScope.glass(element, options);
}

/** Glass over the arbitrary live page. Safari and Firefox use the fallback. */
export function glassOverPage(
  element: HTMLElement,
  options: GlassAppearanceOptions = {},
): GlassSourceHandle {
  return defaultGlassScope.glassOverPage(element, options);
}

/** Glass over one or more marked live DOM regions. */
export function glassOverRegion(
  element: HTMLElement,
  options: GlassOverRegionOptions = {},
): GlassSourceHandle {
  return defaultGlassScope.glassOverRegion(element, options);
}

/** Glass over registered image, video, or canvas media. */
export function glassOverMedia(
  element: HTMLElement,
  options: GlassOverMediaOptions = {},
): GlassSourceHandle {
  return defaultGlassScope.glassOverMedia(element, options);
}

/** Glass over known CSS artwork that the library can paint again. */
export function glassOverWallpaper(
  element: HTMLElement,
  wallpaper: string,
  options: GlassAppearanceOptions = {},
): GlassSourceHandle {
  return defaultGlassScope.glassOverWallpaper(element, wallpaper, options);
}

/** Mark a live DOM region as a refraction source. */
export function createGlassRegion(
  element: HTMLElement,
  options: SurfaceOptions = {},
): GlassRegionHandle {
  return defaultGlassScope.createGlassRegion(element, options);
}

/** Register image, video, or canvas media as a refraction source. */
export function createGlassMedia(
  media: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  options: MediaSurfaceOptions = {},
): GlassMediaHandle {
  return defaultGlassScope.createGlassMedia(media, options);
}

/** @deprecated Use {@link createGlassRegion}. */
export function createSurface(
  element: HTMLElement,
  options: SurfaceOptions = {},
): GlassRegionHandle {
  return defaultGlassScope.createSurface(element, options);
}

/** @deprecated Use {@link createGlassMedia}. */
export function createMediaSurface(
  media: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  options: MediaSurfaceOptions = {},
): GlassMediaHandle {
  return defaultGlassScope.createMediaSurface(media, options);
}

export function setBackground(background: string | null): void {
  setDefaultScopeBackground(background);
}
