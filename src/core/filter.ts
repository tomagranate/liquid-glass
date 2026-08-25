/**
 * filter.ts
 * ---------
 * SVG `<filter>` construction for content refraction. One filter serves a
 * whole surface: a neutral grey flood carries one movable bump bitmap per
 * lens (`feImage`), the merged bump field drives a shared displacement chain
 * (blur → 1-or-3-pass displacement → specular), and the result is composited
 * back only inside the merged lens silhouette — outside it the source passes
 * through crisp and untouched.
 */

import type { SubLens } from "./types.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Real-Safari detection (no feature detect exists for its filter quirks).
 * Gates the composited-layer promotion, the epsilon-flush move path, and the
 * filter-region size budget; every other engine skips all three.
 */
export function isSafariEngine(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /\bSafari\//.test(ua) &&
    /\bAppleWebKit\//.test(ua) &&
    !/\b(Chrome|HeadlessChrome|Chromium|CriOS|FxiOS|Edg|OPR)\//.test(ua)
  );
}

/**
 * Chromium-only zero-lag tier detection: `backdrop-filter: url(#filter)` with
 * feImage+feDisplacementMap samples the real backdrop at composite time, but
 * only Chromium renders it. `CSS.supports` alone is not trustworthy — an
 * engine can parse the value without rendering it — so an engine check gates
 * it (iOS "Chrome" is WebKit and must not match).
 */
export function supportsBackdropUrlFilter(): boolean {
  if (typeof navigator === "undefined") return false;
  const brands = (
    navigator as Navigator & {
      userAgentData?: { brands?: Array<{ brand: string }> };
    }
  ).userAgentData?.brands;
  const chromium = brands
    ? brands.some((b) => b.brand === "Chromium")
    : /\b(Chrome|HeadlessChrome|Chromium|Edg|OPR)\//.test(
        navigator.userAgent,
      ) && !/\b(CriOS|FxiOS)\/|iPhone|iPad/.test(navigator.userAgent);
  return (
    chromium &&
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("backdrop-filter", "url(#x)")
  );
}

let _uid = 0;
/** Fresh unique id — a new one per filter rebuild defeats Safari's filter-output cache. */
export const nextId = (): string => `lq-${Date.now().toString(36)}-${_uid++}`;

/* One shared off-screen <svg> holds every generated <filter>. */
let _defs: SVGDefsElement | null = null;
export function getDefs(): SVGDefsElement {
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
  /** Sub-lenses placed over the neutral field; each carries its own map. */
  lenses: SubLens[];
  /** Shared displacement strength, px (max of the lenses' scales). */
  scale: number;
  /** frost (gaussian) applied before displacement, px */
  blur?: number;
  /** chromatic aberration, 0..1 */
  chroma?: number;
  /** specular blend strength, 0..1 */
  specular?: number;
  /**
   * Source graphic bounds, CSS px. When provided, the filter region is
   * tightened to the actual displacement reach instead of a broad default.
   */
  source?: { width: number; height: number };
}

function pct(v: number): string {
  const rounded = Math.round(v * 1000) / 1000;
  return `${Object.is(rounded, -0) ? 0 : rounded}%`;
}

/** How far the chain can push or smear pixels past the source bounds, CSS px. */
export function filterReach(
  scale: number,
  blur: number,
  chroma: number,
): number {
  const displacementReach = Math.max(0, scale * (1 + 0.18 * chroma));
  const blurReach = Math.max(0, blur * 3);
  return Math.ceil(displacementReach + blurReach);
}

function filterRegion(
  source: GlassFilterOptions["source"],
  scale: number,
  blur: number,
  chroma: number,
): { x: string; y: string; width: string; height: string } {
  if (!source || source.width <= 0 || source.height <= 0) {
    return { x: "-30%", y: "-30%", width: "160%", height: "160%" };
  }

  const reach = filterReach(scale, blur, chroma);
  const xPad = (reach / source.width) * 100;
  const yPad = (reach / source.height) * 100;

  return {
    x: pct(-xPad),
    y: pct(-yPad),
    width: pct(100 + 2 * xPad),
    height: pct(100 + 2 * yPad),
  };
}

const bumpResult = (lensId: string): string => `lqbump-${lensId}`;

/**
 * Append the shared bending chain — blur → 1-or-3-pass displacement (driven
 * by the "map" result) → specular — and return the name of the fully-bent
 * graphic.
 */
function appendGlassChain(
  filter: SVGFilterElement,
  o: { scale: number; blur: number; chroma: number; specular: number },
): string {
  const { scale, blur, chroma, specular } = o;

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

  // Name of the fully-bent graphic to mask by the lens silhouettes.
  let bent = "lens";
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
        result: "speclens",
      }),
    );
    bent = "speclens";
  }
  return bent;
}

/** Build the shared SVG `<filter>` that bends a surface under its lenses. */
export function buildGlassFilter(o: GlassFilterOptions): SVGFilterElement {
  const {
    id,
    lenses,
    scale,
    blur = 0,
    chroma = 0,
    specular = 0,
    source: sourceBounds,
  } = o;
  const region = filterRegion(sourceBounds, scale, blur, chroma);

  const filter = svgEl("filter", {
    id,
    filterUnits: "objectBoundingBox",
    primitiveUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
  });

  // Flat-grey field everywhere (R=G=128 → no bend) with one bump bitmap per
  // lens. Sliding a lens is just moving its feImage (`moveFilterLens`) — the
  // field, the other lenses and the displacement chain are untouched.
  filter.appendChild(
    svgEl("feFlood", {
      "flood-color": "rgb(128,128,128)",
      "flood-opacity": "1",
      result: "lqfield",
    }),
  );
  for (const lens of lenses) {
    filter.appendChild(
      svgEl("feImage", {
        href: lens.mapUrl,
        preserveAspectRatio: "none",
        x: String(lens.x),
        y: String(lens.y),
        width: String(lens.width),
        height: String(lens.height),
        result: bumpResult(lens.id),
      }),
    );
  }
  // All bumps together: their merged coverage alpha is the union silhouette
  // used for the crisp/bent compositing below.
  const bumps = svgEl("feMerge", { result: "bumpAll" });
  for (const lens of lenses) {
    bumps.appendChild(svgEl("feMergeNode", { in: bumpResult(lens.id) }));
  }
  filter.appendChild(bumps);
  const field = svgEl("feMerge", { result: "map" });
  field.appendChild(svgEl("feMergeNode", { in: "lqfield" }));
  field.appendChild(svgEl("feMergeNode", { in: "bumpAll" }));
  filter.appendChild(field);

  const bent = appendGlassChain(filter, { scale, blur, chroma, specular });

  // Clip the bent (and optionally blurred) graphic to the union of the lens
  // silhouettes using the bumps' coverage alpha, punch that same union OUT of
  // the crisp original, and merge. Outside the lenses the original passes
  // through verbatim — no displacement, no frost. Inside, only the bent copy
  // shows: where it is transparent (glyph gaps on a transparent surface) the
  // backdrop behind the surface shows through, instead of the undisplaced
  // content ghosting underneath. At the mask edge the coverage alpha α
  // crossfades (1−α)·crisp + α·bent, keeping the silhouettes antialiased.
  filter.appendChild(
    svgEl("feComposite", {
      in: bent,
      in2: "bumpAll",
      operator: "in",
      result: "lqbent",
    }),
  );
  filter.appendChild(
    svgEl("feComposite", {
      in: "SourceGraphic",
      in2: "bumpAll",
      operator: "out",
      result: "lqcrisp",
    }),
  );
  const out = svgEl("feMerge", {});
  out.appendChild(svgEl("feMergeNode", { in: "lqcrisp" }));
  out.appendChild(svgEl("feMergeNode", { in: "lqbent" }));
  filter.appendChild(out);

  return filter;
}

/**
 * Backdrop tier only: lens border-box area (CSS px²) above which chromatic
 * aberration collapses into a single displacement pass. A backdrop filter
 * re-runs over the live backdrop every composited frame, so the per-frame
 * chain cost is what matters — and dispersion is a rim-only fringe that does
 * not earn three full-area passes on a large pane (~390×390 px: docks and
 * pills stay under, code panes go over; measured 41 → 103 fps on the demo at
 * dpr 2 together with the baked specular bitmap).
 */
export const BACKDROP_CHROMA_AREA_LIMIT = 150_000;

export interface BackdropFilterOptions {
  id: string;
  /** lens border-box width, CSS px */
  width: number;
  /** lens border-box height, CSS px */
  height: number;
  /** displacement map covering the whole border box */
  mapUrl: string;
  /** displacement strength, px */
  scale: number;
  /** frost (gaussian) applied before displacement, px */
  blur?: number;
  /** chromatic aberration, 0..1 (dropped above {@link BACKDROP_CHROMA_AREA_LIMIT}) */
  chroma?: number;
  /** CSS px the backdrop carrier extends past the lens on every side */
  margin?: number;
  /** baked white specular-highlight bitmap */
  specUrl?: string | null;
}

/**
 * Build the per-lens `<filter>` for the Chromium `backdrop-filter: url()`
 * tier. SourceGraphic is the live backdrop, sampled by the compositor at
 * composite time — zero scroll lag by construction. Unlike
 * {@link buildGlassFilter} there is no neutral field or silhouette
 * compositing: the map covers the lens box within an oversized backdrop
 * carrier, and the host's rounded overflow clip shapes the output. The extra
 * sampling margin lets the convex map pull real backdrop pixels into the rim.
 * Chroma remains area-adaptive. A baked specular bitmap is added inside this
 * SVG chain: a plus-lighter sibling would make the panel Chromium's backdrop
 * root, leaving every sibling backdrop-filter lens with an empty black input.
 */
export function buildBackdropFilter(
  o: BackdropFilterOptions,
): SVGFilterElement {
  const {
    id,
    width,
    height,
    mapUrl,
    scale,
    blur = 0,
    chroma = 0,
    margin = 0,
    specUrl = null,
  } = o;
  const effectiveChroma =
    width * height > BACKDROP_CHROMA_AREA_LIMIT ? 0 : chroma;
  const filter = svgEl("filter", {
    id,
    filterUnits: "userSpaceOnUse",
    primitiveUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
    x: "0",
    y: "0",
    width: String(width + 2 * margin),
    height: String(height + 2 * margin),
  });
  filter.appendChild(
    svgEl("feImage", {
      href: mapUrl,
      preserveAspectRatio: "none",
      x: String(margin),
      y: String(margin),
      width: String(width),
      height: String(height),
      result: "map",
    }),
  );
  const bent = appendGlassChain(filter, {
    scale,
    blur,
    chroma: effectiveChroma,
    specular: 0,
  });
  if (specUrl) {
    filter.appendChild(
      svgEl("feImage", {
        href: specUrl,
        preserveAspectRatio: "none",
        x: String(margin),
        y: String(margin),
        width: String(width),
        height: String(height),
        result: "spec",
      }),
    );
    filter.appendChild(
      svgEl("feComposite", {
        in: "spec",
        in2: bent,
        operator: "arithmetic",
        k1: "0",
        k2: "1",
        k3: "1",
        k4: "0",
      }),
    );
  }
  return filter;
}

/**
 * Slide the sub-lens `lensId` (built via {@link buildGlassFilter}) to a new
 * x/y by repositioning its bump bitmap. No map regeneration, no repaint —
 * just two attribute writes — so it stays inside the frame budget even on
 * Safari. Other lenses in the same filter are untouched.
 */
export function moveFilterLens(
  filter: SVGFilterElement,
  lensId: string,
  x: number,
  y: number,
): void {
  const wanted = bumpResult(lensId);
  for (const bump of Array.from(filter.querySelectorAll("feImage"))) {
    if (bump.getAttribute("result") !== wanted) continue;
    bump.setAttribute("x", String(x));
    bump.setAttribute("y", String(y));
    return;
  }
}
