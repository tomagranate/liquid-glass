/**
 * liquid-glass.ts
 * ----------------
 * Framework-independent "liquid glass" refraction for the web, using a plain
 * SVG `filter` (works in every browser). The glass refracts a copy of what sits
 * behind it — the real page underneath stays selectable and clickable.
 *
 * Layers (built by `applyGlass`, or supply your own to `createGlassController`):
 *   .lq                the glass element (overflow:hidden, rounded, isolates)
 *    ├─ .lq-refraction has `filter: url(#glass)`; bends its child
 *    │   └─ .lq-backdrop a copy of the backdrop, offset to line up with reality
 *    ├─ .lq-sheen      CSS tint + rim light + hairline border + drop shadow
 *    └─ .lq-content    your real, interactive content, on top
 *
 * The displacement map is a small PNG (R/G = x/y bend, B = specular) encoding a
 * rounded-rectangle SDF: bending concentrated in a rim of thickness `depth`,
 * fading to a clear centre. It's regenerated only on shape change; moving the
 * lens just shifts the backdrop copy.
 */

import "./liquid-glass.css";

const SVG_NS = "http://www.w3.org/2000/svg";

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
const smoothstep = (t: number): number =>
  t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

let _uid = 0;
const nextId = (): string => `lq-${Date.now().toString(36)}-${_uid++}`;

/** Signed distance to an axis-aligned rounded rectangle, centred at origin. */
function sdfRoundRect(
  px: number,
  py: number,
  hw: number,
  hh: number,
  r: number,
): number {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  return (
    Math.min(Math.max(qx, qy), 0) +
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
    r
  );
}

export interface DisplacementMapOptions {
  /** lens width, CSS px */
  width: number;
  /** lens height, CSS px */
  height: number;
  /** corner radius, CSS px */
  radius?: number;
  /** refracting rim thickness, CSS px */
  depth?: number;
  /** super-sampling factor for a crisp map */
  dpr?: number;
  /** specular strength baked into the blue channel, 0..1 */
  specular?: number;
  /** light direction, degrees */
  specularAngle?: number;
  /**
   * Neutral (no-bend) margin, CSS px, left around the lens shape. The rounded
   * rect is inset by this much so the map fades to flat grey before the edge —
   * needed when the map is placed as a movable sub-lens inside a larger filter,
   * so the bend transitions seamlessly into the surrounding (flat) surface.
   */
  inset?: number;
}

/** Render the displacement map and return a PNG data URL (or null if no 2D ctx). */
export function generateDisplacementMap(
  o: DisplacementMapOptions,
): string | null {
  const {
    width,
    height,
    radius = 0,
    depth = 12,
    dpr = 2,
    specular = 0,
    specularAngle = 135,
    inset = 0,
  } = o;

  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const img = ctx.createImageData(w, h);
  const data = img.data;

  // Half-extents of the lens shape, shrunk by `inset` so a flat-grey margin
  // surrounds it (see `inset` docs).
  const ins = Math.max(0, inset * dpr);
  const cx = w / 2;
  const cy = h / 2;
  const hw = cx - ins;
  const hh = cy - ins;
  const r = Math.min(Math.max(0, radius * dpr), Math.min(hw, hh));
  const rim = Math.max(1, depth * dpr);

  const la = (specularAngle * Math.PI) / 180;
  const lx = Math.cos(la);
  const ly = Math.sin(la);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;

      const sdf = sdfRoundRect(px, py, hw, hh, r);

      if (sdf >= 0) {
        data[idx] = 128;
        data[idx + 1] = 128;
        data[idx + 2] = 128;
        data[idx + 3] = 255;
        continue;
      }

      let gx =
        sdfRoundRect(px + 1, py, hw, hh, r) -
        sdfRoundRect(px - 1, py, hw, hh, r);
      let gy =
        sdfRoundRect(px, py + 1, hw, hh, r) -
        sdfRoundRect(px, py - 1, hw, hh, r);
      const glen = Math.hypot(gx, gy) || 1;
      gx /= glen;
      gy /= glen;

      const mag = 1 - smoothstep(-sdf / rim);
      const dx = gx * mag;
      const dy = gy * mag;

      data[idx] = clampByte((0.5 + 0.5 * dx) * 255);
      data[idx + 1] = clampByte((0.5 + 0.5 * dy) * 255);

      let b = 128;
      if (specular > 0) {
        const facing = Math.max(0, gx * lx + gy * ly);
        const s = specular * mag * facing ** 2;
        b = clampByte(128 + 127 * Math.min(1, s));
      }
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

/* One shared off-screen <svg> holds every generated <filter>. */
let _defs: SVGDefsElement | null = null;
function getDefs(): SVGDefsElement {
  if (_defs?.isConnected) return _defs;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText =
    "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;";
  const defs = document.createElementNS(SVG_NS, "defs");
  svg.appendChild(defs);
  document.body.appendChild(svg);
  _defs = defs;
  return defs;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const n = document.createElementNS(SVG_NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

export interface GlassFilterOptions {
  id: string;
  /** displacement map PNG data URL */
  mapUrl: string;
  /** displacement strength, px */
  scale: number;
  /** frost (gaussian) applied before displacement, px */
  blur?: number;
  /** chromatic aberration, 0..1 */
  chroma?: number;
  /** specular blend strength, 0..1 */
  specular?: number;
  /**
   * Place the displacement map as a movable sub-lens at this box (CSS px, in the
   * host's coordinate space) instead of filling the whole element. The rest of
   * the surface is flat grey (no bend), so a small lens can slide across a large
   * static backdrop — move it cheaply afterwards with {@link moveFilterLens},
   * which is how a handle animates without repainting or regenerating the map.
   */
  lens?: { x: number; y: number; width: number; height: number };
}

/** Build the SVG `<filter>` that bends the backdrop copy. */
export function buildGlassFilter(o: GlassFilterOptions): SVGFilterElement {
  const { id, mapUrl, scale, blur = 0, chroma = 0, specular = 0, lens } = o;

  const filter = svgEl("filter", {
    id,
    filterUnits: "objectBoundingBox",
    primitiveUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
    x: "-30%",
    y: "-30%",
    width: "160%",
    height: "160%",
  });

  if (lens) {
    // Flat-grey field everywhere (R=G=128 → no bend), with the bump bitmap
    // placed at the lens box. Sliding the lens is just moving the feImage —
    // the field and the displacement chain are untouched (the map stays the
    // same, only the filter's region shifts).
    filter.appendChild(
      svgEl("feFlood", {
        "flood-color": "rgb(128,128,128)",
        "flood-opacity": "1",
        result: "lqfield",
      }),
    );
    filter.appendChild(
      svgEl("feImage", {
        href: mapUrl,
        preserveAspectRatio: "none",
        x: String(lens.x),
        y: String(lens.y),
        width: String(lens.width),
        height: String(lens.height),
        result: "lqbump",
      }),
    );
    const merge = svgEl("feMerge", { result: "map" });
    merge.appendChild(svgEl("feMergeNode", { in: "lqfield" }));
    merge.appendChild(svgEl("feMergeNode", { in: "lqbump" }));
    filter.appendChild(merge);
  } else {
    filter.appendChild(
      svgEl("feImage", {
        href: mapUrl,
        preserveAspectRatio: "none",
        x: "0",
        y: "0",
        width: "100%",
        height: "100%",
        result: "map",
      }),
    );
  }

  let source = "SourceGraphic";
  if (blur > 0) {
    filter.appendChild(
      svgEl("feGaussianBlur", {
        in: "SourceGraphic",
        stdDeviation: String(blur),
        result: "blurred",
      }),
    );
    source = "blurred";
  }

  if (chroma > 0) {
    const passes: Array<[string, number, string, string]> = [
      [
        "R",
        scale * (1 + 0.18 * chroma),
        "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
        "dispR",
      ],
      [
        "G",
        scale * (1 + 0.09 * chroma),
        "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
        "dispG",
      ],
      ["B", scale, "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0", "dispB"],
    ];
    for (const [, s, mtx, result] of passes) {
      filter.appendChild(
        svgEl("feDisplacementMap", {
          in: source,
          in2: "map",
          scale: String(s),
          xChannelSelector: "R",
          yChannelSelector: "G",
        }),
      );
      filter.appendChild(
        svgEl("feColorMatrix", { type: "matrix", values: mtx, result }),
      );
    }
    filter.appendChild(
      svgEl("feComposite", {
        in: "dispR",
        in2: "dispG",
        operator: "arithmetic",
        k1: "0",
        k2: "1",
        k3: "1",
        k4: "0",
      }),
    );
    filter.appendChild(
      svgEl("feComposite", {
        in2: "dispB",
        operator: "arithmetic",
        k1: "0",
        k2: "1",
        k3: "1",
        k4: "0",
        result: "lens",
      }),
    );
  } else {
    filter.appendChild(
      svgEl("feDisplacementMap", {
        in: source,
        in2: "map",
        scale: String(scale),
        xChannelSelector: "R",
        yChannelSelector: "G",
        result: "lens",
      }),
    );
  }

  if (specular > 0) {
    filter.appendChild(
      svgEl("feColorMatrix", {
        in: "map",
        type: "matrix",
        values: `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 ${-128 / 255}`,
        result: "spec",
      }),
    );
    filter.appendChild(
      svgEl("feComposite", {
        in: "spec",
        in2: "lens",
        operator: "arithmetic",
        k1: "0",
        k2: String(specular),
        k3: "1",
        k4: "0",
      }),
    );
  }

  return filter;
}

/**
 * Slide a sub-lens (built via {@link buildGlassFilter} with `lens`) to a new x/y
 * by repositioning its bump bitmap. No map regeneration, no backdrop repaint —
 * just two attribute writes — so it stays inside the frame budget even on Safari.
 */
export function moveFilterLens(
  filter: SVGFilterElement,
  x: number,
  y: number,
): void {
  const bump = filter.querySelector('feImage[result="lqbump"]');
  if (!bump) return;
  bump.setAttribute("x", String(x));
  bump.setAttribute("y", String(y));
}

/* ── Backdrop alignment ────────────────────────────────────────────────────
   A backdrop copy must stay registered with whatever it refracts:
   - clone mode follows the page, so it only needs realigning on scroll/resize;
   - refraction-target (`alignTo`) mode tracks an element that can move on its
     own, so those controllers are realigned every frame.
   The previous design ran one perpetual rAF over *every* controller, each doing
   a `getBoundingClientRect` (a forced layout read) per frame. With several glass
   elements present that continuous churn made Safari's pre-click compositing
   flush slow enough to noticeably delay click handling. So clone-mode
   controllers stay off the rAF entirely and ride scroll/resize instead; only
   `alignTo` controllers are ticked. */
const _all = new Set<GlassController>();
const _live = new Set<GlassController>();
let _raf = 0;
function tickLive(): void {
  for (const c of _live) c._reposition();
  _raf = _live.size ? requestAnimationFrame(tickLive) : 0;
}
function startLive(): void {
  if (!_raf && _live.size) _raf = requestAnimationFrame(tickLive);
}
let _scrollBound = false;
function repositionAll(): void {
  for (const c of _all) c._reposition();
}
function bindScroll(): void {
  if (_scrollBound || typeof window === "undefined") return;
  window.addEventListener("scroll", repositionAll, {
    passive: true,
    capture: true,
  });
  window.addEventListener("resize", repositionAll);
  _scrollBound = true;
}

/** A reference element (or accessor) for "refraction target" mode. */
export type AlignTo = HTMLElement | (() => HTMLElement | DOMRect | null) | null;

export interface GlassOptions {
  /** corner radius, px (or a "NN%" string) */
  radius?: number | string;
  /** refracting rim thickness, px */
  depth?: number;
  /** displacement strength, px */
  scale?: number;
  /** frost, px */
  blur?: number;
  /** chromatic aberration, 0..1 */
  chroma?: number;
  /** SVG-filter specular, 0..1 (CSS rim light usually suffices) */
  specular?: number;
  /** light direction, degrees */
  specularAngle?: number;
  /** displacement-map super-sampling */
  dpr?: number;
  /** CSS tint background */
  tint?: string;
  /** CSS bevel highlight strength, 0..1 */
  rimLight?: number;
  /** CSS drop shadow */
  shadow?: string;
  /** explicit CSS background to refract, else --lq-backdrop / body bg */
  backdrop?: string | null;
  /** when set, switches to refraction-target mode (see file docs) */
  alignTo?: AlignTo;
}

export interface GlassLayers {
  refraction: HTMLElement;
  backdrop: HTMLElement;
  sheen?: HTMLElement | null;
}

export interface GlassController {
  /** Patch options and re-render. */
  update(patch: GlassOptions): void;
  /** Force a map + filter rebuild. */
  refresh(): void;
  /** Tear down and clean up. */
  destroy(): void;
  /** @internal re-align the backdrop copy (called by the shared ticker). */
  _reposition(force?: boolean): void;
}

type ResolvedOptions = Required<Omit<GlassOptions, "backdrop" | "alignTo">> & {
  backdrop: string | null;
  alignTo: AlignTo;
};

const DEFAULTS: ResolvedOptions = {
  radius: 16,
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
  backdrop: null,
  alignTo: null,
};

function resolveBackdrop(backdrop: string | null): string {
  if (backdrop) return backdrop;
  const root = getComputedStyle(document.documentElement);
  const v = root.getPropertyValue("--lq-backdrop").trim();
  if (v) return v;
  const body = getComputedStyle(document.body);
  if (body.backgroundImage && body.backgroundImage !== "none") {
    return `${body.backgroundColor} ${body.backgroundImage}`;
  }
  return body.backgroundColor || "transparent";
}

/**
 * Wire the glass effect onto an existing layer structure. Used by both the
 * vanilla `applyGlass` and the React components.
 */
export function createGlassController(
  host: HTMLElement,
  layers: GlassLayers,
  options: GlassOptions = {},
): GlassController {
  const opts: ResolvedOptions = { ...DEFAULTS, ...options };
  const { refraction, backdrop, sheen } = layers;

  let filterEl: SVGFilterElement | null = null;
  let lastW = 0;
  let lastH = 0;
  let lastLeft = Number.NaN;
  let lastTop = Number.NaN;
  let lastBW = Number.NaN;
  let lastBH = Number.NaN;
  // Cache the displacement map (a canvas → PNG, the expensive part) so changes
  // that don't affect geometry can reuse it.
  let cachedMapUrl: string | null = null;
  let mapSig = "";

  /** Signature of every option that requires rebuilding the map or the filter.
   *  CSS-only props (backdrop, tint, rimLight, shadow) are deliberately absent,
   *  so colour/opacity changes skip the costly regenerate entirely. */
  const rebuildSig = (): string =>
    [
      opts.radius,
      opts.depth,
      opts.scale,
      opts.blur,
      opts.chroma,
      opts.specular,
      opts.specularAngle,
      opts.dpr,
    ].join("|");

  function radiusPx(w: number, h: number): number {
    const r = opts.radius;
    if (typeof r === "string" && r.endsWith("%")) {
      return (Number.parseFloat(r) / 100) * Math.min(w, h);
    }
    return Math.min(r as number, Math.min(w, h) / 2);
  }

  function applyStatic(): void {
    if (getComputedStyle(host).position === "static")
      host.style.position = "relative";
    host.style.overflow = "hidden";
    host.style.isolation = "isolate";
    host.style.background = opts.tint;
    host.style.boxShadow = opts.shadow;

    backdrop.style.position = "absolute";
    backdrop.style.pointerEvents = "none";
    if (!opts.alignTo) {
      const bg = resolveBackdrop(opts.backdrop);
      if (opts.backdrop) {
        // An explicit backdrop is a local fill — paint it across the (small) box.
        backdrop.style.backgroundImage = "";
        backdrop.style.background = bg;
      } else {
        // Page clone: a viewport-sized gradient, but shown through a small box
        // sliced to the element's position (size/position set in `_reposition`).
        // Never give the filter a viewport-sized source graphic — that stalls
        // Safari's compositor and, with several glass elements, makes its
        // pre-click flush slow enough to delay click handling.
        backdrop.style.background = "";
        backdrop.style.backgroundImage = bg;
        backdrop.style.backgroundRepeat = "no-repeat";
      }
    }

    if (sheen) {
      const k = opts.rimLight;
      sheen.style.boxShadow = [
        `inset 0 1px 1.5px rgba(255,255,255,${0.9 * k})`,
        `inset 1px 0 1px rgba(255,255,255,${0.35 * k})`,
        `inset -1px 0 1px rgba(255,255,255,${0.35 * k})`,
        `inset 0 -1.5px 2px rgba(0,0,0,${0.25 * k})`,
        `inset 0 0 0 1px rgba(255,255,255,${0.25 * k})`,
      ].join(", ");
      sheen.style.background = `linear-gradient(${opts.specularAngle + 90}deg, rgba(255,255,255,${0.18 * k}) 0%, rgba(255,255,255,0) 38%, rgba(255,255,255,0) 64%, rgba(255,255,255,${0.08 * k}) 100%)`;
    }
  }

  function syncRadius(w: number, h: number): number {
    const rad = radiusPx(w, h);
    host.style.borderRadius = `${rad}px`;
    if (sheen) sheen.style.borderRadius = `${rad}px`;
    return rad;
  }

  function regenerate(): void {
    const rect = host.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w < 2 || h < 2) return;

    const rad = syncRadius(w, h);

    // The map depends only on geometry; regenerate it just when that changes.
    const sig = `${w}x${h}|${rad}|${opts.depth}|${opts.specular}|${opts.specularAngle}|${opts.dpr}`;
    if (sig !== mapSig || !cachedMapUrl) {
      const mapUrl = generateDisplacementMap({
        width: w,
        height: h,
        radius: rad,
        depth: opts.depth,
        dpr: opts.dpr,
        specular: opts.specular,
        specularAngle: opts.specularAngle,
      });
      if (!mapUrl) return;
      cachedMapUrl = mapUrl;
      mapSig = sig;
    }

    const id = nextId();
    const newFilter = buildGlassFilter({
      id,
      mapUrl: cachedMapUrl,
      scale: opts.scale,
      blur: opts.blur,
      chroma: opts.chroma,
      specular: opts.specular,
    });
    getDefs().appendChild(newFilter);
    refraction.style.filter = `url(#${id})`;
    refraction.style.setProperty("-webkit-filter", `url(#${id})`);

    if (filterEl) filterEl.remove();
    filterEl = newFilter;

    lastW = w;
    lastH = h;
    _reposition(true);
  }

  function _reposition(force?: boolean): void {
    const rect = host.getBoundingClientRect();

    if (opts.alignTo) {
      const ref =
        typeof opts.alignTo === "function" ? opts.alignTo() : opts.alignTo;
      const a =
        ref && "getBoundingClientRect" in ref
          ? ref.getBoundingClientRect()
          : ref;
      if (!a) return;
      const left = a.left - rect.left;
      const top = a.top - rect.top;
      if (
        !force &&
        left === lastLeft &&
        top === lastTop &&
        a.width === lastBW &&
        a.height === lastBH
      )
        return;
      lastLeft = left;
      lastTop = top;
      lastBW = a.width;
      lastBH = a.height;
      backdrop.style.width = `${a.width}px`;
      backdrop.style.height = `${a.height}px`;
      backdrop.style.transform = `translate(${left}px, ${top}px)`;
      return;
    }

    // Clone mode: a small box (element + sampling margin), not a viewport-sized
    // layer. The margin covers the filter's reach (~30% past each edge + `scale`
    // px of displacement) so the rim never samples past the copy.
    const mx = Math.ceil(0.4 * rect.width + opts.scale);
    const my = Math.ceil(0.4 * rect.height + opts.scale);
    const width = rect.width + 2 * mx;
    const height = rect.height + 2 * my;
    if (!opts.backdrop) {
      // Slice the viewport-anchored page gradient to this box's screen position,
      // so it lines up seamlessly with the real page behind the glass. (For an
      // explicit local-fill backdrop, the fill already covers the box.)
      backdrop.style.backgroundSize = `${window.innerWidth}px ${window.innerHeight}px`;
      backdrop.style.backgroundPosition = `${mx - rect.left}px ${my - rect.top}px`;
    }
    if (force || width !== lastBW || height !== lastBH) {
      lastBW = width;
      lastBH = height;
      lastLeft = -mx;
      lastTop = -my;
      backdrop.style.width = `${width}px`;
      backdrop.style.height = `${height}px`;
      backdrop.style.transform = `translate(${-mx}px, ${-my}px)`;
    }
  }

  applyStatic();
  regenerate();

  const ro = new ResizeObserver(() => {
    const rect = host.getBoundingClientRect();
    if (
      Math.abs(rect.width - lastW) > 0.5 ||
      Math.abs(rect.height - lastH) > 0.5
    )
      regenerate();
  });
  ro.observe(host);

  // Per-frame realignment is only needed in refraction-target mode (the target
  // can move on its own); clone mode rides scroll/resize.
  function syncLive(): void {
    if (opts.alignTo) {
      if (!_live.has(ctrl)) {
        _live.add(ctrl);
        startLive();
      }
    } else {
      _live.delete(ctrl);
    }
  }

  const ctrl: GlassController = {
    _reposition,
    update(patch: GlassOptions) {
      const prevSig = rebuildSig();
      Object.assign(opts, patch);
      applyStatic();
      // Rebuild the map/filter only when a prop that affects them changed.
      // A pure CSS change (e.g. a switch's on/off colour) just restyles —
      // no canvas/PNG/filter work — so the animation stays smooth.
      if (rebuildSig() !== prevSig) regenerate();
      syncLive();
      _reposition();
    },
    refresh: regenerate,
    destroy() {
      _all.delete(ctrl);
      _live.delete(ctrl);
      if (!_live.size && _raf) {
        cancelAnimationFrame(_raf);
        _raf = 0;
      }
      ro.disconnect();
      if (filterEl) filterEl.remove();
      refraction.style.filter = "";
    },
  };
  _all.add(ctrl);
  bindScroll();
  syncLive();
  return ctrl;
}

/**
 * Vanilla, zero-markup entry point. Builds the layers inside `host`, moving any
 * existing children into a content layer, and wires the effect.
 */
export function applyGlass(
  host: HTMLElement,
  options: GlassOptions = {},
): GlassController {
  const content = document.createElement("div");
  content.className = "lq-content";
  while (host.firstChild) content.appendChild(host.firstChild);

  const refraction = document.createElement("div");
  refraction.className = "lq-refraction";
  const backdrop = document.createElement("div");
  backdrop.className = "lq-backdrop";
  refraction.appendChild(backdrop);

  const sheen = document.createElement("div");
  sheen.className = "lq-sheen";

  host.classList.add("lq");
  host.appendChild(refraction);
  host.appendChild(sheen);
  host.appendChild(content);

  return createGlassController(host, { refraction, backdrop, sheen }, options);
}

export default applyGlass;
