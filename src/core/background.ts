/**
 * background.ts
 * -------------
 * The implicit page-background singleton. Each `.lg-bg` / `.lgs-bg` copy
 * subscribes here; the model paints them with the page background (explicit
 * `setBackground()` value, else auto-detected from `document.body`) and keeps
 * them viewport-registered: when the background has a `url()` image its
 * natural size is read (preloaded once per URL) and a
 * `background-size: cover; background-position: center`-equivalent is
 * computed for the viewport, then offset by each copy's own viewport
 * position. Gradients/colors get viewport-sized placement with the same
 * offset math. Size recomputes on resize; position on scroll. The library
 * never touches `document.body` styles.
 */

import {
  getGeometryRect,
  type GeometryTarget,
  subscribeGeometry,
  subscribeScrollGeometry,
} from "./geometry.js";

export interface BackgroundSubscriber {
  /** The copy element to paint. */
  element: HTMLElement;
  /** Per-subscriber explicit background CSS; null → the page background. */
  override?: () => string | null;
}

let explicitBackground: string | null = null;
let detected: { image: string; color: string } | null = null;

const subscribers = new Set<BackgroundSubscriber>();
const subscriberState = new WeakMap<
  BackgroundSubscriber,
  { visible: boolean; observer: IntersectionObserver | null }
>();
let unsubscribeGeometry: (() => void) | null = null;
let unsubscribeScrollGeometry: (() => void) | null = null;

type ImageEntry = { width: number; height: number } | "loading" | "error";
const imageCache = new Map<string, ImageEntry>();

function extractUrl(value: string): string | null {
  const m = /url\((['"]?)([^'")]+)\1\)/.exec(value);
  return m ? m[2] : null;
}

function detectFromBody(): { image: string; color: string } {
  if (typeof document === "undefined" || !document.body) {
    return { image: "", color: "transparent" };
  }
  const style = getComputedStyle(document.body);
  const image =
    style.backgroundImage && style.backgroundImage !== "none"
      ? style.backgroundImage
      : "";
  return { image, color: style.backgroundColor || "transparent" };
}

function pageBackground(): { image: string; color: string | null } {
  if (explicitBackground != null) {
    return { image: explicitBackground, color: null };
  }
  detected ??= detectFromBody();
  return detected;
}

/** Kick off (or look up) a natural-size read for a background image URL. */
function imageDims(url: string): { width: number; height: number } | null {
  const cached = imageCache.get(url);
  if (cached && cached !== "loading" && cached !== "error") return cached;
  if (cached) return null;
  imageCache.set(url, "loading");
  if (typeof Image === "undefined") return null;
  const img = new Image();
  img.onload = () => {
    imageCache.set(url, {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
    });
    repaintAll();
  };
  img.onerror = () => imageCache.set(url, "error");
  img.src = url;
  return null;
}

/** Viewport cover-fit: size + centred offset for the current background. */
function coverFit(backgroundValue: string): {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
} {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const url = extractUrl(backgroundValue);
  const dims = url ? imageDims(url) : null;
  if (!dims) {
    // Gradient/color (or image not yet measured): viewport-sized placement.
    return { width: vw, height: vh, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.max(vw / dims.width, vh / dims.height);
  const width = dims.width * scale;
  const height = dims.height * scale;
  return {
    width,
    height,
    offsetX: (vw - width) / 2,
    offsetY: (vh - height) / 2,
  };
}

/** Paint (or, with `positionOnly`, just re-register) one subscriber. */
function paint(sub: BackgroundSubscriber, positionOnly: boolean): void {
  if (typeof window === "undefined") return;
  const el = sub.element;
  const override = sub.override?.() ?? null;
  let value: string;
  if (override != null) {
    if (!positionOnly) el.style.background = override;
    value = override;
  } else {
    const page = pageBackground();
    if (!positionOnly) {
      if (page.color != null) {
        el.style.background = "";
        el.style.backgroundColor = page.color;
        el.style.backgroundImage = page.image || "none";
      } else {
        el.style.background = page.image;
      }
    }
    value = page.image;
  }

  const rect = getGeometryRect(el);
  const cover = coverFit(value);
  el.style.backgroundRepeat = "no-repeat";
  el.style.backgroundSize = `${cover.width}px ${cover.height}px`;
  el.style.backgroundPosition = `${cover.offsetX - rect.left}px ${cover.offsetY - rect.top}px`;
}

function isVisible(sub: BackgroundSubscriber): boolean {
  return subscriberState.get(sub)?.visible ?? true;
}

function repaintAll(): void {
  for (const sub of subscribers) {
    if (isVisible(sub)) paint(sub, false);
  }
}

function scrollElementOf(target: GeometryTarget): Element | null {
  if (!target) return null;
  if (target === window || target === document) {
    return document.scrollingElement ?? document.documentElement;
  }
  return target instanceof Element ? target : null;
}

function hasFixedAncestorBefore(
  element: HTMLElement,
  stopAt: Element,
): boolean {
  for (let el: HTMLElement | null = element; el; el = el.parentElement) {
    if (el === stopAt) return false;
    const position = getComputedStyle(el).position;
    if (position === "fixed" || position === "sticky") return true;
  }
  return false;
}

function shouldRepositionOnScroll(
  sub: BackgroundSubscriber,
  target: GeometryTarget,
): boolean {
  const scroller = scrollElementOf(target);
  if (!scroller) return true;
  if (!scroller.contains(sub.element)) return false;
  return !hasFixedAncestorBefore(sub.element, scroller);
}

function repositionForScroll(target: GeometryTarget): void {
  for (const sub of subscribers) {
    if (isVisible(sub) && shouldRepositionOnScroll(sub, target)) {
      paint(sub, true);
    }
  }
}

function onGeometry(kind: "scroll" | "resize"): void {
  if (kind === "resize") repaintAll();
}

/** Fully (re)paint one subscriber — call after moving/resizing its copy. */
export function paintBackground(sub: BackgroundSubscriber): void {
  paint(sub, false);
}

/** Re-register one subscriber's background-position only (cheap move path). */
export function positionBackground(sub: BackgroundSubscriber): void {
  paint(sub, true);
}

/** Register a background copy. Paints immediately; returns an unsubscriber. */
export function subscribeBackground(sub: BackgroundSubscriber): () => void {
  subscribers.add(sub);
  unsubscribeGeometry ??= subscribeGeometry(onGeometry);
  unsubscribeScrollGeometry ??= subscribeScrollGeometry(repositionForScroll);
  const state: { visible: boolean; observer: IntersectionObserver | null } = {
    visible: true,
    observer: null,
  };
  subscriberState.set(sub, state);
  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry?.isIntersecting ?? true;
        state.visible = visible;
        if (visible) paint(sub, false);
      },
      { root: null, rootMargin: "512px" },
    );
    state.observer = observer;
    observer.observe(sub.element);
  }
  paint(sub, false);
  return () => {
    subscribers.delete(sub);
    subscriberState.get(sub)?.observer?.disconnect();
    subscriberState.delete(sub);
    if (!subscribers.size && unsubscribeGeometry) {
      unsubscribeGeometry();
      unsubscribeGeometry = null;
    }
    if (!subscribers.size && unsubscribeScrollGeometry) {
      unsubscribeScrollGeometry();
      unsubscribeScrollGeometry = null;
    }
  };
}

/**
 * Set/override the implicit page background (any CSS background value), or
 * null to re-auto-detect from `document.body`. Propagates to every mounted
 * lens `.lg-bg` and surface `.lgs-bg`.
 */
export function setBackground(bg: string | null): void {
  explicitBackground = bg;
  if (bg == null) detected = null;
  repaintAll();
}

/** @internal test hook — reset all module state. */
export function __resetBackground(): void {
  explicitBackground = null;
  detected = null;
  for (const sub of subscribers) {
    subscriberState.get(sub)?.observer?.disconnect();
    subscriberState.delete(sub);
  }
  subscribers.clear();
  imageCache.clear();
  if (unsubscribeGeometry) {
    unsubscribeGeometry();
    unsubscribeGeometry = null;
  }
  if (unsubscribeScrollGeometry) {
    unsubscribeScrollGeometry();
    unsubscribeScrollGeometry = null;
  }
}
