# Product API v0.1 — definitive spec (surfaces × lenses)

**Status:** implementation contract, 2026-07-04. Successor to
[surface-lens-redesign.md](./surface-lens-redesign.md) milestones 1–6; inherits
every Safari rule in `ARCHITECTURE.md` ("Safari: constraints and
countermeasures") as hard requirements. This document is the single source of
truth for public signatures, DOM/class contracts, and routing rules. Do not
deviate from a signature without updating this file.

## Design goal

One call per glass panel — `glass(el)` / `<Glass>` — that works with **zero
configuration** over any page, and gets *better* (live-content refraction,
video refraction) when the page registers surfaces. Every rough edge the old
API pushed onto consumers is handled inside the library:

| v0.0.2 rough edge | v0.1 |
|---|---|
| Consumer maintains a duplicate page copy (`pageCopy`, `GlassCopyContext`) to bend live content | `createSurface(el)` — content bends **in place**, one line |
| Consumer wires 5 refs into exact nested markup with exact class names | `useGlass(ref, opts)` — one ref, no markup contract; or `<Glass>` |
| Consumer sets `--lq-backdrop` **and** `--lq-cover-*` CSS vars and keeps body background in sync | Background auto-detected from `document.body`; cover-fit math computed by the library from the image's natural size. `setBackground()` to override |
| One lens per surface (current slice warns and replaces) | N lenses per surface, one shared filter, O(2 attr writes) per move |
| Video/canvas requires hand-wiring `useGlassTexture` + lens rect math | `createMediaSurface(video)` + the same `glass()` call |
| `alignTo` refraction-target mode with hand-built copy markup | dead; a moving lens over a `createSurface`d track does it in place |
| Safari blank filters / oversized surfaces | composited-layer CSS + size budget + automatic native degrade tier |

## Model

- **Surface** — a registered pixel source lenses can refract.
  - *Content surface* (`createSurface`): a live DOM subtree. Backend = ONE SVG
    filter on the element with a neutral `feFlood` field and one `feImage`
    sub-lens per overlapping lens. Pixels bend in place; stay
    selectable/clickable.
  - *Media surface* (`createMediaSurface`): `<video>`/`<canvas>`/`<img>`.
    Backend = overlay `<canvas>` + `WebGLGlass` instanced lens draw.
  - *Background* (implicit singleton): the page background. Not an element —
    each lens paints its own bent copy in `.lg-bg`. Auto-detected; override
    with `setBackground()`.
- **Lens** — `glass(el)`. The library styles the element as a glass panel
  (chrome: radius/tint/shadow/sheen) and routes refraction per overlapping
  surface. Children stay crisp and interactive on top.

## Public API (vanilla)

```ts
export interface GlassMaterial {
  radius?: number | string; // px or "NN%" (default 16)
  depth?: number;           // refracting rim thickness px (default 14)
  scale?: number;           // displacement strength px (default 90)
  blur?: number;            // frost px (default 0.6)
  chroma?: number;          // chromatic aberration 0..1 (default 0.4)
  specular?: number;        // filter specular 0..1 (default 0)
  specularAngle?: number;   // degrees (default 135)
  dpr?: number;             // map supersampling (default 2)
  tint?: string;            // CSS background (default "rgba(255,255,255,0.06)")
  rimLight?: number;        // CSS bevel strength 0..1.5 (default 0.6)
  shadow?: string;          // CSS drop shadow
}

export interface GlassOptions extends GlassMaterial {
  /** Surfaces this lens may refract. Default "auto" = every registered surface. */
  surfaces?: "auto" | SurfaceHandle[];
  /** "live" = geometry re-read every frame (for JS-animated lenses). Default "auto". */
  track?: "auto" | "live";
  /**
   * The background copy behind uncovered lens area. Default "auto": paint it
   * unless a content/media surface fully covers the lens. `false` = never,
   * a CSS string = use that instead of the page background.
   */
  background?: "auto" | false | string;
}

export interface GlassHandle {
  update(patch: GlassOptions): void;   // material and option patches; cheap for CSS-only props
  geometryChanged(): void;             // notify after programmatic moves outside scroll/resize
  refresh(): void;                     // force full re-sync (maps, filters, routing)
  destroy(): void;                     // restore the element completely
}

export function glass(el: HTMLElement, opts?: GlassOptions): GlassHandle;

export interface SurfaceOptions {
  /**
   * Paint the page background behind this surface's content (inside the
   * surface, in a `.lgs-bg` layer) so lenses bend wallpaper + content
   * together and `background-attachment: fixed`-style backdrops survive
   * filtering. true = auto-detected page background; string = explicit CSS.
   */
  background?: boolean | string;
}

export interface SurfaceHandle {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export function createSurface(el: HTMLElement, opts?: SurfaceOptions): SurfaceHandle;

export interface MediaSurfaceOptions {
  /** Re-upload the source every frame while a lens overlaps (playing video). */
  live?: boolean;
}
export function createMediaSurface(
  media: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  opts?: MediaSurfaceOptions,
): SurfaceHandle;

/** Set/override the implicit page background (any CSS background value), or
 *  null to re-auto-detect from document.body. Propagates to every mounted
 *  lens `.lg-bg` and surface `.lgs-bg`. */
export function setBackground(bg: string | null): void;
```

Kept low-level exports (unchanged semantics): `generateDisplacementMap`,
`buildGlassFilter` (extended, below), `moveFilterLens(filter, lensId, x, y)`,
`WebGLGlass`, types `LensSpec`, `LensRect`, `LensMaterial`,
`DisplacementMapOptions`, `GlassFilterOptions`.

**Deleted public API** (clean break, approved): `applyGlass`,
`createGlassController`, `GlassController`, `GlassLayers`, `AlignTo`,
old 5-ref `useGlass`, `useGlassTexture`, `UseGlassResult`,
`UseGlassTextureParams`. Reuse their internals freely.

## Public API (React)

All SSR-safe: components render host + children only; controllers attach in
`useLayoutEffect` (guarded for SSR). No refs to wire, no class-name contract.

```tsx
// Components render <As> with the library classes; layer children (sheen/bg)
// are rendered BY the component (React owns them; the core detects and adopts
// existing .lg-sheen/.lg-bg children instead of creating its own).
export function Glass<As extends ElementType = "div">(props: {
  as?: As;                       // default "div"
  children?: ReactNode;
} & GlassOptions & ComponentPropsWithoutRef<As>): JSX.Element;

export function GlassSurface<As extends ElementType = "div">(props: {
  as?: As;
  background?: boolean | string;
  children?: ReactNode;
} & ComponentPropsWithoutRef<As>): JSX.Element;

// Registers the first <video>/<canvas>/<img> descendant (or the element
// itself if the host IS one via `as`).
export function GlassMediaSurface(props: {
  live?: boolean;
  children?: ReactNode;
} & ComponentPropsWithoutRef<"div">): JSX.Element;

// Hooks (escape hatches; single external ref, no markup contract)
export function useGlass(ref: RefObject<HTMLElement | null>, opts?: GlassOptions): GlassHandle | null;
export function useSurface(ref: RefObject<HTMLElement | null>, opts?: SurfaceOptions): SurfaceHandle | null;
export function useMediaSurface(ref: RefObject<HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null>, opts?: MediaSurfaceOptions): SurfaceHandle | null;
```

Hook semantics: create on mount, destroy on unmount; option changes flow
through `handle.update()` (compare a material key, never re-create for a
material change). `useGlass` returns the live handle (null before mount) so
demos can call `geometryChanged()` during drags.

## DOM / class / CSS contract

Class prefix `lg-` (panel/lens) and `lgs-` (surface). The old `lq-*` classes
and `--lq-*` variables die.

```
element.lg                 glass panel (position != static, overflow hidden,
 │                         border-radius, isolation, tint bg, shadow)
 ├─ .lg-bg   (optional)    bent page-background copy. ONE element: painted
 │                         background + `filter: url(#lens-filter)`, sized
 │                         element + sampling margin, transformed -margin.
 │                         pointer-events none, z-index 0. On the Chromium
 │                         backdrop tier it instead carries a per-lens
 │                         `backdrop-filter: url(#filter)` at inset 0 (no copy,
 │                         no margin, no transform); in the Safari native degrade
 │                         tier `backdrop-filter: blur() saturate()`, no SVG filter.
 ├─ .lg-sheen              CSS rim light + directional sheen, z-index 1,
 │                         pointer-events none, aria-hidden.
 ├─ .lg-spec (optional)    baked specular highlight, Chromium backdrop tier ONLY.
 │                         mix-blend-mode: plus-lighter, z-index 1, aria-hidden.
 │                         Core-created, never adopted; absent when specular = 0.
 └─ (children)             untouched consumer children, z-index 2 via
                           `.lg > :not(.lg-sheen):not(.lg-bg):not(.lg-spec)` rule.

element.lgs-surface        registered content surface (+ .lg-composited on Safari only).
 └─ .lgs-bg  (optional)    viewport-registered page-background copy, first
                           child, behind content, pointer-events none.
```

Core creates `.lg-bg`/`.lg-sheen`/`.lgs-bg` if absent, **adopts them if
present** (so React can own them); `.lg-spec` is always core-created and never
adopted. `destroy()` removes only nodes it created and restores every inline
style it wrote.

Stylesheet (`src/core/liquid-glass.css`) keeps: the z-order rules above,
pointer-events, and a `.lg-composited` promotion rule (`transform:
translateZ(0); will-change: transform`) that the core applies to filtered
elements **behind a Safari UA gate only** (Safari rule 1). Never promote on
other engines: universal promotion turned each `.lg-bg` into its own
compositor layer whose texture re-uploaded every scrolled frame
(background-position changes) — 8 fps scrolling vs 49+ fps unpromoted,
measured in the demo on Chromium. Behavior-critical styles live in the
stylesheet or inline via JS; visual defaults (tint, shadow) come from options.

## Routing rules (the heart of "rough edges handled")

On lens create/update and on geometry invalidation:

0. **Chromium backdrop tier** (Chromium only, `supportsBackdropUrlFilter()`) —
   the highest-priority route. When it passes AND `background === "auto"`, the
   lens registers with **no** surface (rules 1–5 are skipped): `.lg-bg` becomes a
   per-lens `backdrop-filter: url(#filter)` carrier (inset 0; no copy, margin or
   transform) that the compositor samples at composite time — zero scroll lag, no
   scroll subscription, only a border-box SIZE change rebuilds. Per-lens
   blur/chroma are exact (own filter per lens); chroma collapses to a single
   displacement pass above `BACKDROP_CHROMA_AREA_LIMIT` (150 000 CSS px²) and
   specular bakes into a static `.lg-spec` `plus-lighter` overlay. An explicit
   CSS-string `background` (uncomposable by the compositor) or `background: false`
   falls through to the rules below. In the code the Safari native degrade tier
   (rule 6) is evaluated first and "wins", but the two are engine-exclusive
   (Chromium-only vs Safari-only), so they never actually co-occur. See
   `ARCHITECTURE.md`, "The Chromium zero-lag backdrop tier".

For each candidate surface (per `opts.surfaces`):

1. **Descendant exclusion.** If `surface.element.contains(lensEl)` or
   `lensEl.contains(surface.element)`, the pair NEVER registers (filtering
   would bend the lens's own crisp children). Such lenses refract the
   background copy instead. Dev-warn once per pair only if the lens was
   *explicitly* given that surface in `opts.surfaces`.
2. **Overlap.** Rect intersection (cached rects) decides registration; an
   IntersectionObserver-grade cheap check is fine, exact rects on sync.
3. **Content surface + overlap** → sub-lens in that surface's shared filter
   (multi-lens filter below). Move = `moveFilterLens` + Safari epsilon flush.
4. **Media surface + overlap** → lens instance in the surface's WebGL pass.
5. **Background copy.** `.lg-bg` paints iff `background !== false` AND the
   union of overlapping content/media surface rects does not fully cover the
   lens rect (per-edge tolerance 1px). Fully covered → `.lg-bg` display:none.
   (Partial-overlap seams: `.lg-bg` has no holes in v0.1 — hidden only on full
   cover. Document the limitation; hole-cut clip-path is post-v0.1.)
6. **Safari size budget** (Safari UA only): if
   `surfaceW * regionScaleX * dpr > 2048` or same for Y, the surface enters the
   **native tier**: its filter is removed/never applied, and every lens over it
   shows `.lg-bg` with `backdrop-filter: blur(10px) saturate(1.5)` (+ normal
   chrome). One console.warn with the measured numbers. Non-Safari: no budget.
7. A lens overlapping N surfaces holds N registrations simultaneously.

Geometry invalidation: one global scroll (capture, passive) + resize listener
pair shared by ALL lenses/surfaces (module-level, refcounted); one
ResizeObserver per lens covering the lens element + registered surface
elements; `track: "live"` lenses additionally re-sync on a shared rAF ticker
(the ONLY rAF in the system, running only while ≥1 live lens exists — Safari
click-latency rule). `geometryChanged()` for programmatic moves.

**Auto-tracked CSS motion:** a `track: "auto"` lens joins the shared ticker
whenever a CSS transition or animation starts anywhere in its subtree
(`transitionrun`/`animationstart`, which bubble) and leaves it after the
subtree reports no running animations (`getAnimations({subtree: true})`) for
two consecutive frames. Sliding switch thumbs and segmented-control pills
therefore need NO `track: "live"` and no manual calls; `track: "live"` remains
only for JS-driven per-frame motion without transitions, and
`geometryChanged()` for instant programmatic jumps.

## Multi-lens content filter

Extend `buildGlassFilter` to accept `lenses: SubLens[]` (back-compat single
`lens` may be dropped — update tests):

```ts
interface SubLens {
  id: string;                       // stable per lens registration
  x: number; y: number; width: number; height: number;
  mapUrl: string;                   // per-lens map (own radius/depth/specular/amplitude)
}
```

- Chain: ONE neutral `feFlood` + one `feImage` per sub-lens (result
  `lqbump-<id>`) + `feMerge` of all bumps (`bumpAll`) over the flood → shared
  blur → displacement (1 or 3 passes for chroma) → specular → silhouette
  compositing (`in` over `bumpAll` for bent, `out` for crisp) exactly like the
  current single-lens chain.
- **Per-lens strength on a shared chain:** the chain's `scale` = max of the
  registered lenses' `scale`. Each lens's map is generated with
  `amplitude = lens.scale / chainScale` (multiply dx/dy before the 128 offset;
  add an `amplitude?: number` option to `generateDisplacementMap`).
  Per-lens shape/depth/specular are baked in the map. `blur`/`chroma` are
  per-surface (max of lenses) — documented limitation.
- `moveFilterLens(filter, lensId, x, y)` retargets by sub-lens id (two
  attribute writes). Adding/removing a lens rebuilds the surface's filter with
  a FRESH id (Safari cache defeat — keep).
- Keep minimal filter regions computed from source bounds + displacement +
  blur reach (Safari rule 2).
- Keep epsilon-flush after mutation, Safari-gated, coalesced per rAF (rule 3);
  keep the scroller warning (rule 4).

## Background model

Module-level `BackgroundModel`:

- Value: explicit `setBackground(css)` > auto-detect
  (`getComputedStyle(document.body)` backgroundImage+backgroundColor).
- **Cover-fit without consumer vars:** when the background contains an
  `url(...)` image, preload it, read natural size, compute
  `background-size`/`background-position` that reproduce
  `background-size: cover; background-position: center` of the viewport,
  offset by each copy's viewport position (`rect.left/top` minus the copy's
  own margin transform). Recompute on resize and on scroll (position only).
  Gradients/colors: size = viewport, same offset math.
- Subscribers: every `.lg-bg` and `.lgs-bg`. `setBackground` and window resize
  push updates to all.
- Consumers keep their real `document.body` background themselves; the library
  never touches body styles.

## Media backend

`createMediaSurface(media, { live })`:

- Creates an overlay `<canvas class="lgm-overlay">` inserted after the media
  element (parent auto-`position: relative` if static), absolutely positioned
  over the media rect (RO-synced), `pointer-events: none`, dpr-scaled.
- Wraps the existing `WebGLGlass`: `setSource(media)`, `resize`, `setLenses`
  with the registered lenses' rects in media-space, materials from lens
  options (radius/depth/scale/chroma/specular — px values dpr-scaled as the
  current `useGlassTexture` does).
- `live: true` → rAF upload+render loop **only while ≥1 lens registered**
  (and paused when the media rect is off-viewport); `live: false` → upload
  once + render on lens geometry change.
- No WebGL2 → surface registers but never activates; lenses over it fall back
  to the background copy path (rule 5 treats it as non-covering). Warn once.

## File layout (src/)

```
core/types.ts        GlassMaterial, GlassOptions, GlassHandle, SurfaceHandle,
                     SurfaceOptions, MediaSurfaceOptions, SubLens, LensSpec (webgl), …
core/map.ts          generateDisplacementMap (+ amplitude)
core/filter.ts       buildGlassFilter (multi-lens), moveFilterLens, defs mgmt, region math
core/background.ts   BackgroundModel (detect, cover-fit, subscribers, setBackground)
core/geometry.ts     shared scroll/resize/RO/rAF invalidation plumbing
core/surfaces.ts     content-surface registry + filter sync + Safari budget/tiers
core/media.ts        media-surface backend over WebGLGlass
core/panel.ts        lens chrome (.lg, .lg-sheen, .lg-bg) build/adopt/restore
core/glass.ts        glass() — routing/orchestration
core/liquid-glass-webgl.ts  WebGLGlass (unchanged)
core/liquid-glass.css       rewritten (.lg-*, .lgs-*, .lgm-*)
react/index.tsx      Glass, GlassSurface, GlassMediaSurface, useGlass, useSurface, useMediaSurface
index.ts             public entry (JSDoc'd)
```

`liquid-glass.ts` disappears; keep import paths in `index.ts` accurate.
Unit tests land next to modules (`*.test.ts`, jsdom) and the browser suite in
`core/glass.browser.test.ts` (structural, 3 engines).

## Testing requirements

- Unit (jsdom): multi-lens filter structure (N feImage bumps, merge, shared
  chain), per-lens amplitude in map bytes, moveFilterLens by id touches only
  x/y, routing (overlap add/remove, descendant exclusion, full-cover hides
  .lg-bg, explicit-surfaces filtering), background cover-fit math (mock
  Image), panel build/adopt/destroy restore, setBackground propagation,
  Safari budget triggers native tier (UA mock).
- Browser (chromium/webkit/firefox, structural + pixel-stats like today):
  filter output non-blank per engine; two lenses over one surface bend
  independently; move touches only its own feImage; media overlay renders
  over a test canvas (chromium at minimum).
- Keep `scripts/safari-check` as the real-Safari release gate.

## Demo (examples/demo) requirements

Every scene shows a `<CodeBlock>` with the exact (trimmed) code to build it —
the code shown must match the API actually used by the scene. Scenes:

1. **Hero + draggable lens** — full-page `<GlassSurface background>` wrapping
   the scroller; the lens is a `<Glass>` in a sibling overlay using
   `track="live"` during drag. Code block: 6-line vanilla + JSX variant.
2. **Nav over live content** — `<Glass as="nav">` over the same surface.
3. **Dock / cards / control center** — plain `<Glass>` panels (inside the
   surface ⇒ auto background-copy path; the code block calls this out).
   Switches/sliders/toggles: track = small `createSurface`, thumb =
   `<Glass track="live">` — no more alignTo copies.
4. **Video** — `<GlassMediaSurface live>` + `<Glass>` controls.
5. **Shockwave** (keep, uses low-level WebGLGlass — labelled "low-level API").
6. **Playground** — material knobs → `handle.update()` via `useGlass`.

Delete: `flat.ts`, `GlassCopyContext`, `pageCopy`, `useCopyWallpaper`,
`alignTo` usage, all `lq-*` markup. `--lq-backdrop`/`--lq-cover-*` vars die;
the demo just sets `document.body` background per wallpaper and calls
`setBackground(null)`… no — it calls nothing: auto-detect re-reads on
`setBackground(null)`. Wallpaper switch = set body background, then
`setBackground(null)` to re-sync (document this in the switcher code block).
