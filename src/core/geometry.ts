/**
 * geometry.ts
 * -----------
 * Shared geometry-invalidation plumbing. ONE window scroll (capture, passive)
 * + resize listener pair serves every lens and surface (module-level,
 * refcounted), and ONE requestAnimationFrame ticker serves every
 * `track: "live"` lens — running only while at least one exists. A perpetual
 * rAF doing forced layout reads per frame makes Safari's pre-click
 * compositing flush slow enough to delay click handling, so nothing rides
 * the ticker unless it asked to.
 */

export type GeometryKind = "scroll" | "resize";
export type GeometryTarget = Element | Document | Window | null;
type GeometrySubscriber = (kind: GeometryKind, target: GeometryTarget) => void;

const geometrySubs = new Set<GeometrySubscriber>();
const scrollSyncSubs = new Set<(target: GeometryTarget) => void>();
let listenersBound = false;
let scrollRaf = 0;
let rectCache: WeakMap<Element, DOMRect> | null = null;

/**
 * Read an element rect through the current geometry-broadcast cache. Outside a
 * broadcast this is just `getBoundingClientRect()`.
 */
export function getGeometryRect(element: Element): DOMRect {
  if (!rectCache) return element.getBoundingClientRect();
  const cached = rectCache.get(element);
  if (cached) return cached;
  const rect = element.getBoundingClientRect();
  rectCache.set(element, rect);
  return rect;
}

/** Broadcast a geometry invalidation to every subscriber. Also used by the
 *  surface registries so lenses re-route when a surface appears/disappears. */
export function notifyGeometry(
  kind: GeometryKind,
  target: GeometryTarget = null,
): void {
  broadcastWithRectCache(() => {
    for (const fn of Array.from(geometrySubs)) fn(kind, target);
  });
}

function notifyScrollSync(target: GeometryTarget): void {
  broadcastWithRectCache(() => {
    for (const fn of Array.from(scrollSyncSubs)) fn(target);
  });
}

function broadcastWithRectCache(fn: () => void): void {
  const outer = rectCache == null;
  if (outer) rectCache = new WeakMap();
  try {
    fn();
  } finally {
    if (outer) rectCache = null;
  }
}

let scrollTarget: GeometryTarget = null;

function onScroll(event: Event): void {
  const target = event.target ?? null;
  notifyScrollSync(target as GeometryTarget);
  scrollTarget =
    scrollTarget === null || scrollTarget === target
      ? (target as GeometryTarget)
      : null;
  if (scrollRaf) return;
  if (typeof requestAnimationFrame === "function") {
    scrollRaf = requestAnimationFrame(() => {
      const target = scrollTarget;
      scrollRaf = 0;
      scrollTarget = null;
      notifyGeometry("scroll", target);
    });
  } else {
    const target = scrollTarget;
    scrollTarget = null;
    notifyGeometry("scroll", target);
  }
}
function onResize(): void {
  notifyGeometry("resize", window);
}

function bindListeners(): void {
  if (listenersBound || typeof window === "undefined") return;
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  window.addEventListener("resize", onResize);
  listenersBound = true;
}

function unbindListeners(): void {
  if (!listenersBound || geometrySubs.size || scrollSyncSubs.size) return;
  window.removeEventListener("scroll", onScroll, { capture: true });
  window.removeEventListener("resize", onResize);
  if (scrollRaf && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = 0;
  }
  listenersBound = false;
}

/** Subscribe to shared scroll/resize invalidation. Returns an unsubscriber. */
export function subscribeGeometry(fn: GeometrySubscriber): () => void {
  geometrySubs.add(fn);
  bindListeners();
  return () => {
    geometrySubs.delete(fn);
    unbindListeners();
  };
}

/**
 * Subscribe to the immediate scroll path. Use only for very cheap work that
 * must land before the browser paints the next scrolled frame.
 */
export function subscribeScrollGeometry(
  fn: (target: GeometryTarget) => void,
): () => void {
  scrollSyncSubs.add(fn);
  bindListeners();
  return () => {
    scrollSyncSubs.delete(fn);
    unbindListeners();
  };
}

const liveSubs = new Set<() => void>();
let liveRaf = 0;

function tickLive(): void {
  for (const fn of Array.from(liveSubs)) fn();
  liveRaf = liveSubs.size ? requestAnimationFrame(tickLive) : 0;
}

/** Ride the single shared rAF ticker (starts on first subscriber, stops on
 *  last). Returns an unsubscriber. */
export function subscribeLive(fn: () => void): () => void {
  liveSubs.add(fn);
  if (!liveRaf && typeof requestAnimationFrame === "function") {
    liveRaf = requestAnimationFrame(tickLive);
  }
  return () => {
    liveSubs.delete(fn);
    if (!liveSubs.size && liveRaf) {
      cancelAnimationFrame(liveRaf);
      liveRaf = 0;
    }
  };
}
