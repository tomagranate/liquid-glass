# Liquid Glass v0.1 — Surface + Lens redesign

**Status:** approved 2026-07-03 · milestone 0 closed — root causes and Safari tiering are preserved in [apply-spike-learnings.md](./apply-spike-learnings.md) and `ARCHITECTURE.md`; milestones 2–4 inherit them as hard requirements (compositing, minimal regions, Safari move path, no-scroller surfaces, size budget, engine tiers).

## Milestone checklist

- [x] 0 — Core validation spike: Safari diagnosis (root-caused: feImage requires composited layer; mutation needs epsilon flush; region-buffer size cap), multi-sub-lens filter, hole-cut compositing, per-lens material, webkit/firefox vitest instances. Findings preserved and `examples/spike/` removed by [apply-spike-learnings.md](./apply-spike-learnings.md)
- [x] 1 — Core model: `types.ts`, `geometry.ts`, `registry.ts` + unit tests
- [x] 2 — Content-surface backend: multi-lens `filter.ts`, `backends/content.ts`, `.lgs-bg`, dev warnings
- [x] 3 — Background + media backends: clone port + clip-path holes, `backends/media.ts`
- [x] 4 — Vanilla API + panel: `panel.ts`, `glass.ts`, rewritten CSS, kitchen-sink page
- [x] 5 — React layer: provider/components/hooks, SSR-safe
- [x] 6 — Demo + docs rewrite
- [ ] 7 — Cross-browser CI: pixel-smoke fixtures, per-engine baselines

> The implemented public API contract (the successor to this plan's signatures)
> lives in [product-api-v0.1.md](./product-api-v0.1.md).

## Context

The package (`@tomagranate/liquid-glass` v0.0.2) is a clean-room take on Aave's "building glass for the web", but it inverted Aave's technique: instead of filtering live content in place, it filters a **copy** of the backdrop the consumer must supply (`.lq-backdrop` — CSS background clone, or a hand-maintained DOM duplicate via `alignTo`). Consequences:

- **Glass over live/changing page content is only half-supported** — the demo maintains a full duplicate scene (`GlassCopyContext` + `pageCopy`, `examples/demo/src/App.jsx:150-172`) just to make headlines bend under the nav. Consumers would have to do the same.
- **The React API is hostile**: `useGlass` returns 5 refs wired into exact nested markup with exact class names (`src/react/useGlass.ts:14-25`).
- **Safari visual breakage is diagnosed**: `feImage` filters blank on
  non-composited elements, moving `feImage` lenses need an epsilon CSS flush,
  and large content surfaces need a size-budget router.

Goal: one simple API (vanilla + React) over a hybrid engine supporting (A) glass over live content and backgrounds, (B) crisp content inside the glass, in all modern browsers with Safari verified. Clean break from v0.0.2 is approved. **The core mechanism gets fully validated in a throwaway spike before any library code is built on it.**

## Underlying technologies and hard limitations

Everything in this design is forced by what the web platform does and doesn't allow:

1. **There is no cross-browser way to read the pixels behind an element.** `backdrop-filter: url(#svgFilter)` — the "obvious" solution — is Chromium-only; Safari and Firefox only support the built-in filter functions (blur, saturate, …), which can't do displacement. There is no DOM-to-texture API (element capture requires a permission-prompting screen-share). This is the root constraint: refraction pixels must come from one of exactly three obtainable sources:
   - **The content itself**, by applying `filter: url(#id)` *to* the element containing it (SVG filters via the `filter` property work in Chromium, Firefox, and Safari) — Aave's approach;
   - **A reproducible copy** — anything expressible as CSS (wallpaper image, gradient), re-painted inside the glass and offset to register with the real page;
   - **A readable texture** — `<video>`/`<canvas>`/`<img>` are `TexImageSource`, so WebGL can sample and refract them (SVG filters can't sample live video at all in Safari).
   Every possible architecture is a composition of these three. Ours composes all three behind one API.

2. **The SVG filter pipeline** (the heart of the effect): `feDisplacementMap` takes the painted element (`SourceGraphic`) plus a map image, and for each pixel shifts it by an offset encoded in the map's R (x) and G (y) channels, 128 = no shift. We generate the map on a 2D canvas as a signed-distance field of a rounded rect — displacement concentrated in a rim of thickness `depth`, smoothstep-fading to a clear center — and feed it in via `feImage` (data URL). Chromatic aberration = three displacement passes at slightly different scales, split per channel with `feColorMatrix`, recombined with `feComposite`. Frost = `feGaussianBlur` before displacement.

3. **The sub-lens trick** (what makes content surfaces viable): instead of one map filling the filtered element, the filter lays down a neutral-grey `feFlood` field (128/128 = zero displacement everywhere) and places small lens maps as positioned `feImage`s on top, merged, then displaces once. Result: a large content region carries ONE filter, refraction happens only under the lens rectangles, and **moving a lens is two attribute writes** on its feImage (x/y) — no map regen, no filter rebuild, no repaint of the map (`moveFilterLens`, `src/core/liquid-glass.ts:370-379`). This is how N glass panels over one surface stay cheap.

4. **`filter` creates a containing block and stacking context.** Inside a filtered subtree: `position: fixed` descendants become element-fixed (broken), `background-attachment: fixed` breaks, and top-layer elements (`<dialog>`, popover) escape the filter entirely. ⇒ fixed backgrounds must be handled by the copy technique, never by filtering; popovers must be lenses, never surface content.

5. **Safari-specific constraints** (from milestone 0):
   - `feImage` in a CSS-referenced SVG filter requires a composited filtered element. Library CSS must promote every filtered layer with `transform: translateZ(0)` / `will-change: transform`; `will-change: filter` is not enough.
   - Content-surface movement uses normal `feImage` x/y mutation in Chromium/Firefox, but Safari must coalesce one epsilon filter-string flush per rAF (`url(#id)` ↔ `url(#id) brightness(1.0001)`). Safari drags temporarily set `chroma` to 0.
   - A **ceiling on filter-region buffer size** — filters over too-large regions go blank/corrupt. Use minimal regions and warn/degrade when `size * regionScale * dpr` exceeds the Safari cap. Use a conservative `~2048` device-px cap until the real-Safari release gate records a stricter project value.
   - A filtered content surface must wrap its scroller; the surface itself must not be scrollable.
   - **Filter-output caching**: Safari caches aggressively; current code defeats it with a fresh filter id per regenerate (`liquid-glass.ts:618`) — keep.
   - **Click-latency regression**: a perpetual per-controller rAF doing `getBoundingClientRect` makes Safari's pre-click compositing flush lag (`liquid-glass.ts:381-391`). ⇒ geometry tracking must be event/observer-driven; rAF only for explicitly `track: "live"` lenses.

6. **WebGL2** for media: the same rounded-rect SDF evaluated analytically in a fragment shader, one instance per lens in a single instanced draw (`WebGLGlass`, `src/core/liquid-glass-webgl.ts`). WebGL **cannot** be the universal backend — it can't see DOM pixels (constraint #1). It's plenty performant for its role (a full-viewport pass with dozens of instanced lenses is trivial GPU work); the "tons of UI" scaling story is the sub-lens trick on SVG filters, which is O(1) filter per surface, not per lens.

## How the core works

**Model: Surfaces (pixel sources) × Lenses (glass panels), connected by a geometry-driven router.**

- **Surface** — a registered refractable source. Three kinds, one backend each:
  - *Content surface*: a live DOM subtree the app wraps (`createSurface(el)` / `<GlassSurface>`). Backend applies ONE SVG filter to `el` — neutral flood field + one feImage sub-lens per overlapping lens (tech #3). Pixels bend **in place**, at the surface's own z-position, stay selectable/clickable. Optionally paints the page background behind its content (`.lgs-bg`, a viewport-registered copy layer — the demo's `useCopyWallpaper` absorbed into the library) so lenses bend wallpaper + content together, and fixed-attachment backgrounds survive (constraint #4).
  - *Background surface*: implicit singleton — CSS background auto-detected from body or set via `setBackground()`/provider. No element, no filter; each lens paints its own bent copy (see compositing).
  - *Media surface*: `createMediaSurface(video)` — backend positions an overlay canvas over the media, uploads frames (`live: true` = every frame while a lens overlaps), draws all overlapping lenses in one instanced WebGL pass.
- **Lens** — `glass(el)` / `<Glass>`. Carries material (radius, depth, scale, blur, chroma, specular, tint, rimLight, shadow). Panel DOM built by the library:
  ```
  el.lg                (radius, overflow hidden, isolation, tint, shadow)
   ├─ .lg-bg           bent background-surface copy; clip-path holes (below)
   ├─ .lg-sheen        rim light / tint (pure CSS — no filter cost)
   └─ .lg-content      original children, crisp, interactive, unfiltered
  ```
- **GeometryTracker** — cached rects for all surfaces + lenses. Invalidation: one global scroll/resize listener pair, one ResizeObserver over registered elements, per-lens IntersectionObserver for coarse overlap candidates, explicit `geometryChanged()` for programmatic moves, shared rAF ticker **only** for `track:"live"` lenses (constraint #5d). Emits `overlapsChanged(lens)` / `moved(lens, surface)`.
- **Router** — on `overlapsChanged`: `backend.addLens/removeLens` per surface (content: rebuild that surface's filter — rare; media: update instance buffer). On `moved`: content → `moveFilterLens` (2 attr writes), media → buffer rewrite, background → reposition offset math (ported from `_reposition`). A lens overlapping N surfaces simply holds N registrations.

**Compositing a multi-surface lens** (e.g. a dropdown over a content surface + wallpaper):
1. Content/media surfaces bend their own pixels in place, below the panel — page stacking order composes them for free.
2. The panel's `.lg-bg` paints the bent background-surface copy — the only copied pixels in the system.
3. `.lg-bg` gets `clip-path` (evenodd) **holes** cut at its intersections with every overlapping content/media surface, so their in-place-bent pixels show through from below. Hole update = one attribute write per geometry change.

Documented limitation: unregistered page content under a lens is covered by the bent wallpaper copy — the fix is registering it as a surface. A Chromium-only `backdrop-filter: url()` opt-in tier ("over absolutely anything") is deferred post-v1: visually inconsistent across browsers, and ~1 day additive later.

## Public API

### Vanilla

```ts
interface GlassMaterial { radius?, depth?, scale?, blur?, chroma?, specular?, specularAngle?, tint?, rimLight?, shadow? }

createSurface(el: HTMLElement, opts?: { includeBackground?: boolean; background?: string }): SurfaceHandle
createMediaSurface(media: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement, opts?: { live?: boolean }): SurfaceHandle
setBackground(bg: string | null): void   // implicit background surface; auto-detected if never called

glass(el: HTMLElement, opts?: GlassOptions): GlassHandle
// GlassOptions = GlassMaterial & { surfaces?: "auto" | SurfaceHandle[]; track?: "auto" | "live" }
// GlassHandle  = { update, geometryChanged, refresh, destroy }
```

```ts
// A) Panel over wallpaper — zero config
glass(document.querySelector(".card"));
// B) Navbar over live scrolling content
createSurface(document.querySelector("main"));
glass(document.querySelector("nav"), { radius: 999, blur: 2 });
// C) Controls over playing video
createMediaSurface(document.querySelector("video"), { live: true });
glass(document.querySelector(".player-controls"), { track: "live" });
```

### React

```tsx
<GlassProvider background={...} material={...}>        // page background + material defaults
<GlassSurface as="main">{children}</GlassSurface>      // live content; lenses refract it in place
<GlassMediaSurface live><video …/></GlassMediaSurface>
<Glass as="nav" radius={999} blur={2.5}>{crisp content}</Glass>
// escape hatches: useGlass(ref, opts), useSurface(ref, opts) — single ref, no markup contract
```

No refs to wire, no class-name contract, children = in-glass content. SSR-safe: components render host + children only; layer DOM attaches in `useLayoutEffect`.

## Milestones — core validation first

**Milestone 0 (closed): core validation spike.** Throwaway plain-HTML pages
(`examples/spike/`, now removed) used only hand-written filter/map code
(extracted from current `liquid-glass.ts`), run in Chromium + WebKit + Firefox
(Playwright) and real Safari (manual). It proved or killed each core hypothesis:

1. **Safari breakage diagnosis**: toggleable variants per suspect from constraint #5b (href/xlink; primitiveUnits; color-interpolation-filters incl. a linearRGB-compensated map; data-URL vs blob-URL vs inline `<image>`; filter region). Exit: the current bug reproduced in a failing WebKit test + a written primitive/attribute compat matrix.
2. **Multi-sub-lens content filter**: one filter with 3+ feImage sub-lenses over a live scrolling text/image region, correct in all three engines; drag a lens via `moveFilterLens`-style attr writes at 60fps (Safari especially).
3. **Size ceiling**: source-graphic size ladder (500² → full page) in Safari; record where output degrades. This number becomes the dev-warning budget.
4. **Hole-cut compositing**: a panel straddling a content-surface edge — `.lg-bg` wallpaper copy with an evenodd clip-path hole over the in-place-bent region; verify no visible seam while scrolling/dragging in all engines.
5. **Per-lens material on a shared filter**: confirm per-lens shape/strength via map amplitude works when the chain (scale/chroma) is shared; determine whether per-lens frost is feasible (masked feGaussianBlur) or gets documented out.
6. Add webkit + firefox instances to `vitest.config.ts` browser config (playwright already a devDep; chromium-only today) so spike assertions run in CI.

**Exit result:** all three automated engines passed structural/pixel-smoke
coverage, the Safari bug was root-caused, the sub-lens approach survived, and
the size budget formula is known. The exact Safari cap is kept conservative
until `scripts/safari-check` records a release baseline; over-budget Safari
content surfaces route to the native degrade tier.

| # | Milestone | Contents | Size |
|---|---|---|---|
| 0 | **Core validation spike** | closed; findings preserved in `ARCHITECTURE.md`, spike deleted | done |
| 1 | Core model | `types.ts`, `geometry.ts` (GeometryTracker), `registry.ts` (overlap engine + router); unit tests for intersection math + router sequencing | 2–3 d |
| 2 | Content-surface backend | `filter.ts` (multi-lens, spike-mandated attrs), `backends/content.ts`, `.lgs-bg`, dev warnings (size budget, fixed descendants, nesting) | 3–4 d |
| 3 | Background + media backends | clone/_reposition port + clip-path holes; `backends/media.ts` around unchanged `WebGLGlass` | 1–2 d |
| 4 | Vanilla API + panel | `panel.ts`, `glass.ts`, rewritten CSS; three scenarios in a kitchen-sink page | 2–3 d |
| 5 | React layer (can overlap 4) | provider/components/hooks, SSR-safe | 2 d |
| 6 | Demo + docs rewrite | delete `pageCopy`/`GlassCopyContext`/`flat.ts`; README + ARCHITECTURE rewrite; new dropdown-over-two-surfaces scene | 2–3 d |
| 7 | Cross-browser CI | pixel-smoke fixtures, per-engine baselines, CI matrix | 1–2 d |

## New src/ layout

```
core/
  types.ts       GlassMaterial, SurfaceHandle, GlassHandle, LensSpec
  map.ts         generateDisplacementMap (verbatim; + linearRGB compensation if spike mandates)
  filter.ts      buildGlassFilter extended lens? → lenses: SubLens[]; moveFilterLens + sub-lens id; <defs> mgmt
  geometry.ts    GeometryTracker
  registry.ts    SurfaceRegistry + LensRegistry + overlap engine + backend router
  panel.ts       lens panel DOM, clip-path holes, sheen/material CSS (reused from applyStatic)
  backends/      content.ts / background.ts / media.ts
  webgl.ts       WebGLGlass (unchanged)
  glass.ts       glass / createSurface / createMediaSurface / setBackground
  liquid-glass.css  rewritten (.lg-*, .lgs-*)
react/           GlassProvider, GlassSurface, GlassMediaSurface, Glass, hooks.ts
```

## Reuse vs rewrite

- **Reused verbatim**: `generateDisplacementMap` (liquid-glass.ts:74-159, incl. `inset`), `<defs>` mgmt, sheen styling (:573-583), `WebGLGlass` (whole file), rebuild/mapSig caching pattern, fresh-filter-id Safari cache defeat.
- **Extended**: `buildGlassFilter` (:208-363) single-lens → multi-lens; `moveFilterLens` (:370-379) gains sub-lens id.
- **Ported**: clone-mode slicing/`_reposition` (:555-571, :673-694) → `backends/background.ts`; `useGlassTexture` upload/ready logic → `backends/media.ts`; demo `useCopyWallpaper` → library `.lgs-bg`.
- **Deleted** (clean break): `applyGlass`, `createGlassController`, old `useGlass`, `useGlassTexture`, `GlassLayers`, `AlignTo`; demo `flat.ts`/`GlassCopyContext`/`pageCopy`. Keep `generateDisplacementMap`/`buildGlassFilter`/`moveFilterLens`/`WebGLGlass`/`LensSpec` exported as low-level APIs.

## Verification

- **Unit (jsdom)**: overlap math, router add/remove/move sequencing, clip-path string generation, map byte checks.
- **Browser (vitest+playwright, chromium/webkit/firefox)**: non-blank filter output per engine; checkerboard-bend pixel-statistics assertions (coarse, stable — not golden images); sub-lens move touches only feImage x/y; media backend over a test canvas. Playwright WebKit is structural coverage only for Safari-specific rendering failures.
- **Pixel-diff smoke in CI**: 3 fixture pages (canonical scenarios), per-engine baselines (never shared across engines), generous threshold, explicit update script.
- **Demo eyeball**: nav bends scrolling headlines; lens dragged across a surface/background boundary with no seam; dropdown over two surfaces; wallpaper switch propagates; video controls at 60fps.
- **Real-Safari release gate** (`scripts/safari-check`; Playwright WebKit ≠ Safari's GPU path): first paint not blank, scroll alignment, click latency with 10+ lenses, dpr/zoom change, tab restore, screenshot pixel stats/diff against any recorded baselines.

## Risks

1. Safari size ceiling × large content surfaces — measured budget + dev warning; scope surfaces to sections; full-page panels use the background copy path.
2. Sub-lens content filtering fails in Safari — decided at the milestone-0 gate; fallback: per-lens filtered clone regions.
3. `position: fixed`/top-layer descendants inside surfaces escape the filter — dev warning; popovers become lenses or their own surfaces.
4. Shared filter chain per surface limits per-lens material — spike item 5; documented if limited.
5. SSR first-frame flash — visibility-gate `.lg` until attach (opt-out).
6. Nested surfaces — detect, warn, unsupported v1.
