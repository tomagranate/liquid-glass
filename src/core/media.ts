/**
 * media.ts
 * --------
 * Media surfaces: `<video>` / `<canvas>` / `<img>` sources an SVG filter
 * cannot read. Backend = an overlay `<canvas class="lgm-overlay">` positioned
 * over the media rect + a {@link WebGLGlass} instanced lens draw. `live`
 * sources re-upload every frame — but only while at least one lens is
 * registered and the media rect is on-viewport. Without WebGL2 the surface
 * registers but never activates (lenses treat it as non-covering).
 */

import "./liquid-glass.css";
import { getGeometryRect, notifyGeometry } from "./geometry.js";
import { WebGLGlass } from "./liquid-glass-webgl.js";
import type { ScopeRuntime } from "./runtime.js";
import type {
  LensSpec,
  MediaSurfaceOptions,
  ResolvedLensMaterial,
  SurfaceHandle,
} from "./types.js";
import type { LensBox } from "./surfaces.js";

type MediaElement = HTMLVideoElement | HTMLCanvasElement | HTMLImageElement;

function sourceReady(media: MediaElement): boolean {
  if (
    typeof HTMLVideoElement !== "undefined" &&
    media instanceof HTMLVideoElement
  ) {
    return media.readyState >= 2;
  }
  if (
    typeof HTMLImageElement !== "undefined" &&
    media instanceof HTMLImageElement
  ) {
    return media.complete && media.naturalWidth > 0;
  }
  return true;
}

interface MediaAttachment {
  rect: LensBox;
  material: ResolvedLensMaterial;
}

const registry = new Set<MediaSurface>();

/** Every live registered media surface. */
export function listMediaSurfaces(): MediaSurface[] {
  return Array.from(registry);
}

export class MediaSurface implements SurfaceHandle {
  readonly kind = "media" as const;
  readonly element: HTMLElement;
  readonly runtime?: ScopeRuntime;
  destroyed = false;
  /** false when WebGL2 is unavailable — the surface is inert/non-covering. */
  active: boolean;

  private readonly media: MediaElement;
  private readonly live: boolean;
  private readonly overlay: HTMLCanvasElement;
  private glassGL: WebGLGlass | null = null;
  private readonly attachments = new Map<object, MediaAttachment>();
  private readonly ro: ResizeObserver | null;
  private raf = 0;
  private uploaded = false;
  private readonly parentEl: HTMLElement | null;
  private readonly parentOriginalPosition: string | null;
  private readonly viewportObserver: IntersectionObserver | null = null;
  private onViewport = true;
  private readonly onVisibilityChange = (): void => this.syncLoop();
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.active = false;
    this.syncLoop();
    notifyGeometry("resize");
  };
  private readonly onContextRestored = (): void => {
    this.active = Boolean(this.glassGL);
    this.uploaded = false;
    this.applyLenses();
    notifyGeometry("resize");
  };
  private readonly onSourceReady = (): void => {
    this.uploaded = false;
    this.applyLenses();
  };

  constructor(
    media: MediaElement,
    options: MediaSurfaceOptions,
    runtime?: ScopeRuntime,
  ) {
    this.element = media;
    this.runtime = runtime;
    this.media = media;
    this.live = options.live ?? false;

    this.overlay = document.createElement("canvas");
    this.overlay.classList.add("lgm-overlay");
    this.overlay.setAttribute("aria-hidden", "true");

    this.parentEl = media.parentElement;
    const parentPosition = this.parentEl
      ? getComputedStyle(this.parentEl).position
      : null;
    if (
      this.parentEl &&
      (parentPosition === "static" || parentPosition === "")
    ) {
      this.parentOriginalPosition = this.parentEl.style.position;
      this.parentEl.style.position = "relative";
    } else {
      this.parentOriginalPosition = null;
    }
    media.after(this.overlay);

    try {
      this.glassGL = new WebGLGlass(this.overlay);
      this.active = true;
    } catch (error) {
      console.warn(
        "liquid-glass: WebGL2 unavailable — media surface is inert; lenses over it refract the page background instead.",
        (error as Error).message,
      );
      this.active = false;
      this.overlay.remove();
    }

    if (typeof IntersectionObserver !== "undefined") {
      this.viewportObserver = new IntersectionObserver(([entry]) => {
        this.onViewport = entry?.isIntersecting ?? true;
        this.syncLoop();
        if (this.onViewport) this.applyLenses();
      });
      this.viewportObserver.observe(media);
    }

    this.ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            this.layout();
            this.applyLenses();
          });
    this.ro?.observe(media);

    media.addEventListener("loadeddata", this.onSourceReady);
    media.addEventListener("load", this.onSourceReady);
    this.overlay.addEventListener("webglcontextlost", this.onContextLost);
    this.overlay.addEventListener(
      "webglcontextrestored",
      this.onContextRestored,
    );
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.layout();
    (runtime?.media ?? registry).add(this);
    if (runtime) runtime.diagnostics.mediaSurfaces++;
    notifyGeometry("resize");
  }

  /** Size and place the overlay over the media rect (RO-synced). */
  private layout(): void {
    if (!this.active || !this.glassGL) return;
    const mediaRect = getGeometryRect(this.media);
    if (this.parentEl) {
      const parentRect = getGeometryRect(this.parentEl);
      const left =
        mediaRect.left -
        parentRect.left -
        this.parentEl.clientLeft +
        this.parentEl.scrollLeft;
      const top =
        mediaRect.top -
        parentRect.top -
        this.parentEl.clientTop +
        this.parentEl.scrollTop;
      this.overlay.style.left = `${left}px`;
      this.overlay.style.top = `${top}px`;
    }
    if (mediaRect.width >= 1 && mediaRect.height >= 1) {
      this.glassGL.resize(mediaRect.width, mediaRect.height);
    }
  }

  /** Register/update a lens over this surface (rect in media space). */
  attachLens(key: object, rect: LensBox, material: ResolvedLensMaterial): void {
    if (this.destroyed) return;
    this.attachments.set(key, { rect, material });
    this.applyLenses();
  }

  detachLens(key: object): void {
    if (!this.attachments.delete(key) || this.destroyed) return;
    this.applyLenses();
  }

  hasLens(key: object): boolean {
    return this.attachments.has(key);
  }

  private lensSpecs(): LensSpec[] {
    return Array.from(this.attachments.values(), ({ rect, material }) => ({
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
      radius: material.radius,
      depth: material.depth,
      scale: material.scale,
      chroma: material.chroma,
      specular: material.specular,
    }));
  }

  private applyLenses(): void {
    if (!this.active || !this.glassGL || this.destroyed) return;
    this.glassGL.setLenses(this.lensSpecs());
    this.syncLoop();
    if (!this.raf) {
      this.ensureUpload();
      this.glassGL.render();
    }
  }

  private ensureUpload(): void {
    if (!this.glassGL || this.uploaded || !sourceReady(this.media)) return;
    this.glassGL.setSource(this.media);
    this.uploaded = true;
  }

  /** Upload+render loop: only while live, active, and ≥1 lens registered. */
  private syncLoop(): void {
    const shouldRun =
      this.live &&
      this.active &&
      !this.destroyed &&
      this.attachments.size > 0 &&
      this.onViewport &&
      document.visibilityState !== "hidden";
    if (shouldRun && !this.raf) {
      const loop = (): void => {
        if (!this.glassGL) return;
        if (this.runtime) this.runtime.diagnostics.mediaRafCallbacks++;
        if (sourceReady(this.media)) {
          this.glassGL.setSource(this.media);
          this.uploaded = true;
        }
        this.glassGL.render();
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    } else if (!shouldRun && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  refresh(): void {
    if (this.destroyed) return;
    this.uploaded = false;
    this.layout();
    this.applyLenses();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    (this.runtime?.media ?? registry).delete(this);
    if (this.runtime) this.runtime.diagnostics.mediaSurfaces--;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.ro?.disconnect();
    this.viewportObserver?.disconnect();
    this.media.removeEventListener("loadeddata", this.onSourceReady);
    this.media.removeEventListener("load", this.onSourceReady);
    this.overlay.removeEventListener("webglcontextlost", this.onContextLost);
    this.overlay.removeEventListener(
      "webglcontextrestored",
      this.onContextRestored,
    );
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.glassGL?.destroy();
    this.glassGL = null;
    this.overlay.remove();
    if (this.parentEl && this.parentOriginalPosition != null) {
      this.parentEl.style.position = this.parentOriginalPosition;
    }
    this.attachments.clear();
    notifyGeometry("resize");
  }
}

/** Register a `<video>`/`<canvas>`/`<img>` as a refraction source. */
export function createMediaSurface(
  media: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  options: MediaSurfaceOptions = {},
): SurfaceHandle {
  return new MediaSurface(media, options);
}
