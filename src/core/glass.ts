/**
 * glass.ts
 * --------
 * `glass(el)` — one call per glass panel, zero configuration. The element
 * becomes a lens: the library styles its chrome (radius/tint/shadow/sheen)
 * and routes refraction per overlapping surface:
 *
 * 1. lens⊂surface or surface⊂lens → the pair never registers (filtering
 *    would bend the lens's own crisp children); such lenses refract the
 *    background copy instead.
 * 2. rect overlap decides registration.
 * 3. content surface + overlap → sub-lens in that surface's shared filter.
 * 4. media surface + overlap → lens instance in the surface's WebGL pass.
 * 5. `.lg-bg` paints the bent page-background copy iff `background !== false`
 *    and the union of overlapping surface rects does not fully cover the
 *    lens (1px per-edge tolerance).
 * 6. a Safari over-budget surface puts its lenses' `.lg-bg` on native
 *    `backdrop-filter` instead.
 * 7. a lens overlapping N surfaces holds N registrations simultaneously.
 *
 * On Chromium (the only engine that renders `backdrop-filter: url()`), rules
 * 2–5 collapse into the backdrop tier: `.lg-bg` carries a per-lens
 * `backdrop-filter: url(#filter)` the compositor samples at composite time —
 * zero scroll lag, no surface registrations, no scroll work.
 */

import "./liquid-glass.css";
import {
  type BackgroundSubscriber,
  paintBackground,
  subscribeBackground,
} from "./background.js";
import { backgroundClipPath } from "./composition.js";
import {
  buildBackdropFilter,
  buildGlassFilter,
  filterReach,
  getDefs,
  nextId,
  supportsBackdropUrlFilter,
} from "./filter.js";
import {
  getGeometryRect,
  type GeometryTarget,
  subscribeGeometry,
  subscribeLive,
} from "./geometry.js";
import { bakeSpecularHighlight, generateDisplacementMap } from "./map.js";
import { listMediaSurfaces, MediaSurface } from "./media.js";
import { createPanel, type PanelChrome } from "./panel.js";
import { chooseGlassPolicy, detectEngine } from "./policy.js";
import { recordPolicy, type ScopeRuntime } from "./runtime.js";
import {
  ContentSurface,
  isSafariEngine,
  type LensBox,
  listContentSurfaces,
  setWebkitFilter,
} from "./surfaces.js";
import type {
  GlassBackend,
  GlassHandle,
  GlassOptions,
  GlassPreset,
  ResolvedLensMaterial,
} from "./types.js";

const DEFAULTS = {
  radius: 16 as number | string,
  depth: 14,
  scale: 90,
  blur: 0.6,
  chroma: 0.4,
  specular: 0,
  specularAngle: 135,
  dpr: 2,
  tint: "rgba(255,255,255,0.06)",
  rimLight: 0.6,
  shadow: "0 8px 30px rgba(0,0,0,0.25)",
};

const NATIVE_BACKDROP = "blur(10px) saturate(1.5)";

const PRESETS: Record<GlassPreset, Partial<GlassOptions>> = {
  thin: {
    depth: 8,
    scale: 45,
    blur: 0.35,
    chroma: 0.15,
    rimLight: 0.4,
    tint: "rgba(255,255,255,0.04)",
  },
  regular: {},
  prominent: {
    depth: 18,
    scale: 120,
    blur: 0.9,
    chroma: 0.55,
    rimLight: 0.85,
    tint: "rgba(255,255,255,0.09)",
  },
};

const BACKEND_ORDER: readonly GlassBackend[] = [
  "backdrop",
  "background-copy",
  "content-svg",
  "media-webgl",
  "native",
  "none",
];

function option<K extends keyof GlassMaterialOptions>(
  opts: GlassOptions,
  key: K,
): GlassMaterialOptions[K] {
  return (opts[key] ??
    PRESETS[opts.preset ?? "regular"][key] ??
    DEFAULTS[key]) as GlassMaterialOptions[K];
}

type GlassMaterialOptions = typeof DEFAULTS;

type AnySurface = ContentSurface | MediaSurface;

function resolveRadius(
  radius: GlassOptions["radius"],
  width: number,
  height: number,
): number {
  const value = radius ?? DEFAULTS.radius;
  if (typeof value === "string" && value.endsWith("%")) {
    return (Number.parseFloat(value) / 100) * Math.min(width, height);
  }
  return Math.min(value as number, Math.min(width, height) / 2);
}

function resolveMaterial(
  opts: GlassOptions,
  width: number,
  height: number,
): ResolvedLensMaterial {
  return {
    radius: resolveRadius(option(opts, "radius"), width, height),
    depth: option(opts, "depth"),
    scale: option(opts, "scale"),
    blur: option(opts, "blur"),
    chroma: option(opts, "chroma"),
    specular: option(opts, "specular"),
    specularAngle: option(opts, "specularAngle"),
    dpr: option(opts, "dpr"),
    quality: opts.quality ?? "balanced",
    fallback: opts.fallback ?? "blur",
  };
}

function chromeOf(opts: GlassOptions, disabled = false): PanelChrome {
  return {
    radius: option(opts, "radius"),
    tint: disabled ? "transparent" : option(opts, "tint"),
    shadow: disabled ? "none" : option(opts, "shadow"),
    rimLight: disabled ? 0 : option(opts, "rimLight"),
    specularAngle: option(opts, "specularAngle"),
  };
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function intersects(a: Box, b: Box): boolean {
  return (
    a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom
  );
}

function scrollElementOf(target: GeometryTarget): Element | null {
  if (!target) return null;
  if (target === window || target === document) {
    return document.scrollingElement ?? document.documentElement;
  }
  return target instanceof Element ? target : null;
}

function isFixedLike(element: HTMLElement): boolean {
  const position = getComputedStyle(element).position;
  return position === "fixed" || position === "sticky";
}

/**
 * Exact "does the union of `covers` contain `lens`" via coordinate
 * compression (N is tiny), with a per-edge tolerance.
 */
export function unionCovers(lens: Box, covers: Box[], tolerance = 1): boolean {
  const left = lens.left + tolerance;
  const top = lens.top + tolerance;
  const right = lens.right - tolerance;
  const bottom = lens.bottom - tolerance;
  if (right <= left || bottom <= top) return covers.length > 0;
  const clipped = covers
    .map((r) => ({
      left: Math.max(r.left, left),
      top: Math.max(r.top, top),
      right: Math.min(r.right, right),
      bottom: Math.min(r.bottom, bottom),
    }))
    .filter((r) => r.right > r.left && r.bottom > r.top);
  if (!clipped.length) return false;
  const xs = Array.from(
    new Set([left, right, ...clipped.flatMap((r) => [r.left, r.right])]),
  ).sort((a, b) => a - b);
  const ys = Array.from(
    new Set([top, bottom, ...clipped.flatMap((r) => [r.top, r.bottom])]),
  ).sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    for (let j = 0; j < ys.length - 1; j++) {
      const cy = (ys[j] + ys[j + 1]) / 2;
      const inside = clipped.some(
        (r) => cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom,
      );
      if (!inside) return false;
    }
  }
  return true;
}

function documentCanScroll(): boolean {
  const scroller = document.scrollingElement ?? document.documentElement;
  return scroller.scrollHeight > scroller.clientHeight + 1;
}

/** Turn an element into a glass lens over every registered surface. */
export function glass(
  element: HTMLElement,
  options: GlassOptions = {},
  runtime?: ScopeRuntime,
): GlassHandle {
  const opts: GlassOptions = { ...options };
  const panel = createPanel(element);
  panel.applyChrome(chromeOf(opts));
  const originalBackendAttribute = element.getAttribute("data-lg-backend");

  // Chromium zero-lag tier: `.lg-bg` carries a per-lens `backdrop-filter:
  // url()` the compositor samples at composite time, instead of a
  // JS-positioned wallpaper copy. On this tier the lens never registers on
  // content/media surfaces — the backdrop-filter already bends live content
  // and media behind it, so registering would bend twice.
  const backdropSupported = supportsBackdropUrlFilter();
  const backdropEligible = (): boolean =>
    backdropSupported && (opts.background ?? "auto") === "auto";

  /** Identity of this lens's registrations across all surfaces. */
  const key = {};
  let destroyed = false;
  let active = new Set<AnySurface>();
  const observedSurfaces = new Set<Element>();
  const warnedExcluded = new Set<AnySurface>();
  const warnedForeignSurfaces = new WeakSet<object>();
  let warnedFixedDocumentScroll = false;
  let currentBackends: readonly GlassBackend[] = [];
  let backendSignature = "";

  function publishBackends(found: Set<GlassBackend>): void {
    if (!found.size) found.add("none");
    const next = BACKEND_ORDER.filter((backend) => found.has(backend));
    const signature = next.join(",");
    if (signature === backendSignature) return;
    currentBackends = Object.freeze(next);
    backendSignature = signature;
    element.dataset.lgBackend = signature;
    opts.onBackendChange?.(currentBackends);
  }

  // .lg-bg state
  let bgFilterEl: SVGFilterElement | null = null;
  let bgFilterSig = "";
  let bgMapUrl: string | null = null;
  let bgMapSig = "";
  let bgPaintSig = "";
  let bgSubscriber: BackgroundSubscriber | null = null;
  let bgUnsubscribe: (() => void) | null = null;
  let bgClip: SVGClipPathElement | null = null;
  let bgClipPath: SVGPathElement | null = null;

  // Baked specular overlay state (backdrop tier only; core-created, never
  // adopted). The token discards stale async bakes.
  let specEl: HTMLElement | null = null;
  let specSig = "";
  let specBakeToken = 0;

  const ro =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => sync(true));
  ro?.observe(element);

  function observeSurface(el: Element): void {
    if (observedSurfaces.has(el)) return;
    observedSurfaces.add(el);
    ro?.observe(el);
  }

  function unobserveSurface(el: Element): void {
    if (!observedSurfaces.delete(el)) return;
    ro?.unobserve(el);
  }

  const materialSig = (): string =>
    [
      opts.preset ?? "regular",
      option(opts, "radius"),
      option(opts, "depth"),
      option(opts, "scale"),
      option(opts, "blur"),
      option(opts, "chroma"),
      option(opts, "specular"),
      option(opts, "specularAngle"),
      option(opts, "dpr"),
    ].join("|");

  function effectiveMaterial(
    width: number,
    height: number,
    desiredBackend: GlassBackend,
  ): { material: ResolvedLensMaterial; backend: GlassBackend; reason: string } {
    const material = resolveMaterial(opts, width, height);
    const decision = chooseGlassPolicy({
      engine: detectEngine(),
      desiredBackend,
      quality: material.quality,
      fallback: material.fallback,
      material,
      width,
      height,
      dpr: typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
      budgets: runtime?.budgets,
    });
    recordPolicy(runtime, decision);
    return {
      material: decision.effectiveMaterial,
      backend: decision.backend,
      reason: decision.reason,
    };
  }

  function candidateSurfaces(): { list: AnySurface[]; explicit: boolean } {
    const sel = opts.surfaces;
    if (Array.isArray(sel)) {
      const list: AnySurface[] = [];
      for (const surface of sel) {
        if (
          !(surface instanceof ContentSurface) &&
          !(surface instanceof MediaSurface)
        ) {
          continue;
        }
        if (runtime && surface.runtime !== runtime) {
          if (!warnedForeignSurfaces.has(surface)) {
            warnedForeignSurfaces.add(surface);
            console.warn(
              "liquid-glass: explicit surface belongs to another scope and was ignored.",
            );
          }
          continue;
        }
        list.push(surface);
      }
      return { list, explicit: true };
    }
    return {
      list: runtime
        ? [...runtime.content, ...runtime.media]
        : [...listContentSurfaces(), ...listMediaSurfaces()],
      explicit: false,
    };
  }

  function warnIfFixedLensChasesDocumentScroll(surface: ContentSurface): void {
    if (warnedFixedDocumentScroll || !documentCanScroll()) return;
    const lensStyle = getComputedStyle(element);
    const surfaceStyle = getComputedStyle(surface.element);
    if (
      lensStyle.position === "fixed" &&
      surfaceStyle.position !== "fixed" &&
      surfaceStyle.position !== "sticky"
    ) {
      warnedFixedDocumentScroll = true;
      console.warn(
        "liquid-glass: a fixed lens over a document-scrolled content surface will lag during compositor scrolling. Use a fixed surface that wraps an inner scroller instead.",
      );
    }
  }

  function sync(force: boolean): void {
    if (destroyed) return;
    const lensRect = getGeometryRect(element);
    const tooSmall = lensRect.width < 2 || lensRect.height < 2;
    const offscreen =
      lensRect.right <= 0 ||
      lensRect.bottom <= 0 ||
      lensRect.left >= window.innerWidth ||
      lensRect.top >= window.innerHeight;
    const inactive = tooSmall || offscreen;
    const next = new Set<AnySurface>();
    const coveringRects: Box[] = [];
    let anyNative = false;
    const backends = new Set<GlassBackend>();

    if (!inactive && !backdropEligible()) {
      const { list, explicit } = candidateSurfaces();
      for (const surface of list) {
        if (surface.destroyed || next.has(surface)) continue;
        const surfaceEl = surface.element;
        // Rule 1: descendant exclusion — filtering would bend the lens's
        // own crisp children.
        if (
          surfaceEl === element ||
          surfaceEl.contains(element) ||
          element.contains(surfaceEl)
        ) {
          if (explicit && !warnedExcluded.has(surface)) {
            warnedExcluded.add(surface);
            console.warn(
              "liquid-glass: a lens cannot refract a surface that contains it (or that it contains); the pair is skipped and the lens refracts the background copy instead.",
            );
          }
          continue;
        }
        const surfaceRect = getGeometryRect(surfaceEl);
        if (surfaceRect.width < 2 || surfaceRect.height < 2) continue;
        if (!intersects(lensRect, surfaceRect)) continue;

        const box: LensBox = {
          x: Math.round(lensRect.left - surfaceRect.left),
          y: Math.round(lensRect.top - surfaceRect.top),
          width: Math.round(lensRect.width),
          height: Math.round(lensRect.height),
        };
        const material = effectiveMaterial(
          box.width,
          box.height,
          surface.kind === "content" ? "content-svg" : "media-webgl",
        ).material;
        if (surface.kind === "content") {
          warnIfFixedLensChasesDocumentScroll(surface);
          surface.attachLens(key, box, material, force);
          if (surface.nativeTier) anyNative = true;
          else {
            coveringRects.push(surfaceRect);
            backends.add("content-svg");
          }
        } else {
          surface.attachLens(key, box, material);
          if (surface.active) {
            coveringRects.push(surfaceRect);
            backends.add("media-webgl");
          }
        }
        next.add(surface);
        observeSurface(surfaceEl);
      }
    }

    for (const surface of active) {
      if (!next.has(surface)) {
        surface.detachLens(key);
        unobserveSurface(surface.element);
      }
    }
    active = next;

    const backgroundBackend = updateBg(
      lensRect,
      coveringRects,
      anyNative,
      force,
      inactive,
    );
    if (backgroundBackend) backends.add(backgroundBackend);
    publishBackends(backends);
  }

  function shouldSyncForScroll(target: GeometryTarget): boolean {
    if (!active.size) return false;
    const scroller = scrollElementOf(target);
    if (!scroller) return true;

    const lensFixed = isFixedLike(element);
    const lensMovesWithScroller = !lensFixed && scroller.contains(element);

    for (const surface of active) {
      const surfaceFixed = isFixedLike(surface.element);
      if (lensFixed !== surfaceFixed) return true;

      const surfaceMovesWithScroller =
        !surfaceFixed && scroller.contains(surface.element);
      if (lensMovesWithScroller !== surfaceMovesWithScroller) return true;
    }
    return false;
  }

  function clearBgFilter(bg: HTMLElement): void {
    bgFilterEl?.remove();
    bgFilterEl = null;
    bgFilterSig = "";
    bg.style.filter = "";
    bg.style.removeProperty("-webkit-filter");
  }

  function clearBgClip(bg?: HTMLElement): void {
    if (bg) bg.style.clipPath = "";
    bgClip?.remove();
    bgClip = null;
    bgClipPath = null;
  }

  function syncBgClip(
    bg: HTMLElement,
    lensRect: DOMRect,
    covers: Box[],
    margin: number,
  ): void {
    if (!covers.length) {
      clearBgClip(bg);
      return;
    }
    if (!bgClip) {
      const ns = "http://www.w3.org/2000/svg";
      bgClip = document.createElementNS(ns, "clipPath");
      bgClip.id = nextId();
      bgClip.setAttribute("clipPathUnits", "userSpaceOnUse");
      bgClipPath = document.createElementNS(ns, "path");
      bgClipPath.setAttribute("fill-rule", "evenodd");
      bgClipPath.setAttribute("clip-rule", "evenodd");
      bgClip.appendChild(bgClipPath);
      getDefs().appendChild(bgClip);
    }
    bgClipPath?.setAttribute("d", backgroundClipPath(lensRect, covers, margin));
    bg.style.clipPath = `url(#${bgClip.id})`;
  }

  function unsubscribeBg(): void {
    bgUnsubscribe?.();
    bgUnsubscribe = null;
    bgPaintSig = "";
  }

  function removeSpecOverlay(): void {
    specBakeToken++;
    specEl?.remove();
    specEl = null;
    specSig = "";
  }

  /**
   * Backdrop tier: the in-chain specular pass is baked once into a static
   * `.lg-spec` overlay (the highlight derives purely from the static
   * displacement map — no reason to pay for it on every composited frame).
   * Regenerated whenever the map regenerates; async so creation never blocks.
   */
  function syncSpecOverlay(
    width: number,
    height: number,
    material: ResolvedLensMaterial,
    force: boolean,
  ): void {
    if (material.specular <= 0 || !bgMapUrl) {
      removeSpecOverlay();
      return;
    }
    const sig = `${bgMapSig}|${material.specular}`;
    if (!force && sig === specSig && specEl) return;
    specSig = sig;
    const token = ++specBakeToken;
    void bakeSpecularHighlight({
      mapUrl: bgMapUrl,
      width,
      height,
      specular: material.specular,
      dpr: material.dpr,
    }).then((url) => {
      if (destroyed || token !== specBakeToken || !url) return;
      if (!specEl) {
        specEl = document.createElement("div");
        specEl.classList.add("lg-spec");
        specEl.setAttribute("aria-hidden", "true");
        panel.sheen.after(specEl);
      }
      specEl.style.backgroundImage = `url("${url}")`;
    });
  }

  function updateBg(
    lensRect: DOMRect,
    coveringRects: Box[],
    anyNative: boolean,
    force: boolean,
    tooSmall: boolean,
  ): GlassBackend | null {
    const bgOpt = opts.background ?? "auto";
    const fallback = opts.fallback ?? "blur";
    let mode: "hidden" | "native" | "backdrop" | "paint";
    if (tooSmall) mode = "hidden";
    else if (anyNative && fallback === "blur") mode = "native";
    else if (anyNative) mode = "hidden";
    else if (bgOpt === false) mode = "hidden";
    // An explicit CSS-string background cannot be sampled by the compositor,
    // so it stays on the painted-copy path even on the backdrop tier.
    else if (backdropEligible()) mode = "backdrop";
    else if (unionCovers(lensRect, coveringRects)) mode = "hidden";
    else mode = "paint";

    if (mode !== "backdrop") removeSpecOverlay();
    panel.applyChrome(chromeOf(opts, anyNative && fallback === "none"));

    if (mode === "hidden") {
      unsubscribeBg();
      clearBgClip(panel.bg ?? undefined);
      if (panel.bg) panel.bg.style.display = "none";
      if (anyNative) return fallback === "none" ? "none" : "native";
      return null;
    }

    const bg = panel.ensureBg();
    bg.style.display = "";

    if (mode === "native") {
      // Safari over-budget degrade tier: native backdrop blur, no SVG filter,
      // no painted copy (the real page shows through the blur).
      unsubscribeBg();
      clearBgFilter(bg);
      clearBgClip(bg);
      bg.style.background = "none";
      bg.style.backgroundImage = "";
      bg.style.backgroundColor = "";
      bg.style.width = "100%";
      bg.style.height = "100%";
      bg.style.transform = "translateZ(0)";
      bg.style.backdropFilter = NATIVE_BACKDROP;
      bg.style.setProperty("-webkit-backdrop-filter", NATIVE_BACKDROP);
      return "native";
    }

    if (mode === "backdrop") {
      // Chromium zero-lag tier: the compositor tracks lens position for
      // free, so there is no painted copy, no scroll subscription and no
      // position re-sync — only a SIZE change regenerates the map + filter.
      // Chromium's backdrop root is lenient enough to sample the page
      // wallpaper even when the lens sits inside a filtered surface
      // (covered by a browser regression test in glass.browser.test.ts).
      unsubscribeBg();
      bg.style.background = "none";
      bg.style.backgroundImage = "";
      bg.style.backgroundColor = "";
      bg.style.width = "100%";
      bg.style.height = "100%";
      bg.style.transform = "";
      bg.style.borderRadius = "inherit";
      bg.style.filter = "";
      bg.style.removeProperty("-webkit-filter");
      clearBgClip(bg);

      const width = Math.round(lensRect.width);
      const height = Math.round(lensRect.height);
      const decision = effectiveMaterial(width, height, "backdrop");
      const material = decision.material;
      if (decision.backend !== "backdrop") {
        panel.applyChrome(chromeOf(opts, decision.backend === "none"));
        const nativeFilter =
          decision.backend === "native" && (opts.fallback ?? "blur") === "blur"
            ? NATIVE_BACKDROP
            : "";
        bg.style.backdropFilter = nativeFilter;
        bg.style.setProperty("-webkit-backdrop-filter", nativeFilter);
        return decision.backend;
      }
      const filterSig = [
        "backdrop",
        width,
        height,
        material.radius,
        material.depth,
        material.scale,
        material.blur,
        material.chroma,
        material.specular,
        material.specularAngle,
        material.dpr,
      ].join("|");
      if (force || filterSig !== bgFilterSig || !bgFilterEl) {
        const mapSig = [
          "backdrop",
          width,
          height,
          material.radius,
          material.depth,
          material.specular,
          material.specularAngle,
          material.dpr,
        ].join("|");
        if (force || mapSig !== bgMapSig || !bgMapUrl) {
          // Full-box map (no inset, no alpha mask): it never sits inside a
          // larger filter here, and alpha-0 corners would un-premultiply to
          // garbage displacement without a neutral flood underneath.
          bgMapUrl = generateDisplacementMap({
            width,
            height,
            radius: material.radius,
            depth: material.depth,
            dpr: material.dpr,
            specular: material.specular,
            specularAngle: material.specularAngle,
          });
          if (runtime) runtime.diagnostics.mapRegenerations++;
          bgMapSig = mapSig;
        }
        if (bgMapUrl) {
          const id = nextId();
          const filter = buildBackdropFilter({
            id,
            width,
            height,
            mapUrl: bgMapUrl,
            scale: material.scale,
            blur: material.blur,
            chroma: material.chroma,
          });
          getDefs().appendChild(filter);
          if (runtime) runtime.diagnostics.filterRebuilds++;
          bgFilterEl?.remove();
          bgFilterEl = filter;
          bgFilterSig = filterSig;
          bg.style.backdropFilter = `url(#${id})`;
          bg.style.setProperty("-webkit-backdrop-filter", `url(#${id})`);
        }
      }
      syncSpecOverlay(width, height, material, force);
      return "backdrop";
    }

    // Paint mode: ONE element carrying the painted background copy AND the
    // SVG filter, sized lens + sampling margin and pulled back by -margin so
    // the rim never samples past the copy. Moves ride background-position
    // (never SVG filter mutation), which keeps static lenses cheap on Safari.
    bg.style.backdropFilter = "";
    bg.style.removeProperty("-webkit-backdrop-filter");
    bg.style.borderRadius = "";
    const width = Math.round(lensRect.width);
    const height = Math.round(lensRect.height);
    const decision = effectiveMaterial(width, height, "background-copy");
    const material = decision.material;
    if (decision.backend !== "background-copy") {
      panel.applyChrome(chromeOf(opts, decision.backend === "none"));
      clearBgFilter(bg);
      clearBgClip(bg);
      bg.style.background = "none";
      const nativeFilter =
        decision.backend === "native" && (opts.fallback ?? "blur") === "blur"
          ? NATIVE_BACKDROP
          : "";
      bg.style.backdropFilter = nativeFilter;
      bg.style.setProperty("-webkit-backdrop-filter", nativeFilter);
      return decision.backend;
    }
    const margin = filterReach(material.scale, material.blur, material.chroma);
    bg.style.width = `${width + 2 * margin}px`;
    bg.style.height = `${height + 2 * margin}px`;
    // translateZ keeps the filtered layer composited on Safari (rule 1); on
    // other engines promotion is harmful (per-frame texture re-uploads).
    bg.style.transform = `translate(${-margin}px, ${-margin}px)${isSafariEngine() ? " translateZ(0)" : ""}`;
    syncBgClip(bg, lensRect, coveringRects, margin);

    const filterSig = [
      width,
      height,
      margin,
      material.radius,
      material.depth,
      material.scale,
      material.blur,
      material.chroma,
      material.specular,
      material.specularAngle,
      material.dpr,
    ].join("|");
    if (force || filterSig !== bgFilterSig || !bgFilterEl) {
      const mapSig = [
        width,
        height,
        material.radius,
        material.depth,
        material.specular,
        material.specularAngle,
        material.dpr,
      ].join("|");
      if (force || mapSig !== bgMapSig || !bgMapUrl) {
        bgMapUrl = generateDisplacementMap({
          width,
          height,
          radius: material.radius,
          depth: material.depth,
          dpr: material.dpr,
          specular: material.specular,
          specularAngle: material.specularAngle,
          inset: 1,
          maskAlpha: true,
        });
        if (runtime) runtime.diagnostics.mapRegenerations++;
        bgMapSig = mapSig;
      }
      if (bgMapUrl) {
        const id = nextId();
        const filter = buildGlassFilter({
          id,
          lenses: [
            {
              id: "bg",
              x: margin,
              y: margin,
              width,
              height,
              mapUrl: bgMapUrl,
            },
          ],
          scale: material.scale,
          blur: material.blur,
          chroma: material.chroma,
          specular: material.specular,
          source: { width: width + 2 * margin, height: height + 2 * margin },
        });
        getDefs().appendChild(filter);
        if (runtime) runtime.diagnostics.filterRebuilds++;
        bgFilterEl?.remove();
        bgFilterEl = filter;
        bgFilterSig = filterSig;
        setWebkitFilter(bg, `url(#${id})`);
      }
    }

    // Keep the copy viewport-registered. The model also repaints on
    // resize/scroll/setBackground; this covers lens moves + option changes.
    const paintSig = `${Math.round(lensRect.left)}|${Math.round(lensRect.top)}|${width}|${height}|${margin}|${String(opts.background)}`;
    if (!bgUnsubscribe) {
      bgSubscriber = {
        element: bg,
        override: () =>
          typeof opts.background === "string"
            ? opts.background
            : (runtime?.background ?? null),
      };
      bgUnsubscribe = subscribeBackground(bgSubscriber);
      bgPaintSig = paintSig;
    } else if (force || paintSig !== bgPaintSig) {
      bgPaintSig = paintSig;
      if (bgSubscriber) paintBackground(bgSubscriber);
    }
    return "background-copy";
  }

  // Shared invalidation: resize always reroutes; scroll reroutes only when the
  // scrolled container can change active lens/surface relative positions.
  const unsubscribeGeometry = subscribeGeometry((kind, target) => {
    if (kind === "resize" || shouldSyncForScroll(target)) sync(false);
  });
  let unsubscribeLive: (() => void) | null = null;
  function syncLive(): void {
    if (opts.track === "live" && !unsubscribeLive) {
      unsubscribeLive = subscribeLive(() => {
        if (runtime) runtime.diagnostics.geometryRafCallbacks++;
        sync(false);
      });
    } else if (opts.track !== "live" && unsubscribeLive) {
      unsubscribeLive();
      unsubscribeLive = null;
    }
  }

  // `track: "auto"` lenses ride the ticker only while a CSS transition or
  // animation is running in the lens subtree (a sliding switch thumb, a hover
  // scale), so CSS-driven motion needs no `track: "live"` and no manual
  // `geometryChanged()` calls. The subscription drains itself after two quiet
  // frames — an idle page keeps the shared rAF (and its per-frame layout
  // reads, which delay Safari's pre-click compositing flush) fully off.
  let unsubscribeAutoLive: (() => void) | null = null;
  let autoLiveQuiet = 0;
  function autoLiveTick(): void {
    if (runtime) runtime.diagnostics.geometryRafCallbacks++;
    sync(false);
    const animating =
      typeof element.getAnimations === "function" &&
      element.getAnimations({ subtree: true }).length > 0;
    autoLiveQuiet = animating ? 0 : autoLiveQuiet + 1;
    if (autoLiveQuiet > 2) {
      unsubscribeAutoLive?.();
      unsubscribeAutoLive = null;
    }
  }
  function onSubtreeMotion(): void {
    if (destroyed || opts.track === "live" || unsubscribeAutoLive) return;
    autoLiveQuiet = 0;
    unsubscribeAutoLive = subscribeLive(autoLiveTick);
  }
  element.addEventListener("transitionrun", onSubtreeMotion);
  element.addEventListener("animationstart", onSubtreeMotion);

  sync(true);
  syncLive();

  const handle: GlassHandle = {
    get backends() {
      return currentBackends;
    },
    update(patch: GlassOptions) {
      if (destroyed) return;
      const prevSig = materialSig();
      Object.assign(opts, patch);
      panel.applyChrome(chromeOf(opts));
      sync(materialSig() !== prevSig);
      syncLive();
    },
    geometryChanged() {
      sync(false);
    },
    refresh() {
      sync(true);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribeGeometry();
      unsubscribeLive?.();
      unsubscribeLive = null;
      unsubscribeAutoLive?.();
      unsubscribeAutoLive = null;
      element.removeEventListener("transitionrun", onSubtreeMotion);
      element.removeEventListener("animationstart", onSubtreeMotion);
      ro?.disconnect();
      for (const surface of active) surface.detachLens(key);
      active.clear();
      unsubscribeBg();
      bgFilterEl?.remove();
      bgFilterEl = null;
      clearBgClip(panel.bg ?? undefined);
      removeSpecOverlay();
      if (originalBackendAttribute == null) {
        element.removeAttribute("data-lg-backend");
      } else {
        element.setAttribute("data-lg-backend", originalBackendAttribute);
      }
      panel.destroy();
      if (runtime?.lenses.delete(handle)) runtime.diagnostics.lenses--;
    },
  };
  runtime?.lenses.add(handle);
  if (runtime) runtime.diagnostics.lenses++;
  return handle;
}
