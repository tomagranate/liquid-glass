# Architecture

How the liquid-glass effect works: the surfaces-×-lenses model, the three
backends that feed a lens (background copy, in-place content filter, WebGL
media), and the Chromium-only zero-lag backdrop tier that collapses them into a
compositor-sampled `backdrop-filter`. See the [README](README.md) for
installation and usage.

## The key idea (and why it works in every browser)

Most web "liquid glass" demos use `backdrop-filter: url(#filter)`, which only
works in Chromium. This library sidesteps that entirely. (Chromium *also* gets an
optional zero-lag tier built on `backdrop-filter: url()` — see
[The Chromium zero-lag backdrop tier](#the-chromium-zero-lag-backdrop-tier) — but
that is a per-engine optimisation layered on top of the copy path, never the
cross-browser foundation.)

The whole effect rests on a single SVG filter primitive, **`feDisplacementMap`**.
`feDisplacementMap` takes two inputs — the painted content and a displacement map
we generate — and shifts each pixel of the content by an amount the map encodes.
**Nothing is sampled from underneath the glass; the content's own pixels are the
ones moving.** So the refraction is a plain `filter: url(#glass)` applied to a
**copy of what sits behind the glass**, painted on its own layer and bent by the
map. Because it is an ordinary SVG `filter` (not `backdrop-filter`), it renders
in Chromium, Firefox and Safari with no flags.

Surfaces an SVG filter can't read — a `<canvas>` QR code, a playing `<video>` —
fall back to a small WebGL shader fed the same displacement (see
[The WebGL texture backend](#the-webgl-texture-backend)).

## The model: surfaces × lenses

The public API has two nouns and a router that connects them.

The router belongs to a `GlassScope`. Top-level functions use a default scope;
`createGlassScope()` and React `<GlassRoot>` create isolated registries,
background state, policy defaults, budgets, and diagnostics. Auto routing means
all geometrically overlapping surfaces in that scope. DOM ancestry is not a
routing signal, so portals and remote DOM remain deterministic.

- A **lens** is a glass panel: `glass(el)` / `<Glass>`. The library styles its
  chrome and routes its refraction per overlapping surface.
- A **surface** is a registered pixel source a lens can refract. There are three
  kinds, one backend each:
  - **Content surface** (`createSurface`): a live DOM subtree. One SVG filter is
    applied *to the surface element* — pixels bend **in place**, at the surface's
    own z-position, and stay selectable and clickable.
  - **Media surface** (`createMediaSurface`): a `<video>`/`<canvas>`/`<img>` an
    SVG filter can't read. A WebGL overlay canvas is drawn over the media rect.
  - **Background** (implicit singleton): the page background. Not an element —
    each lens paints its own bent copy of it.

A lens over N surfaces holds N registrations at once, and a lens over no surface
still refracts the background copy. Page stacking order composes an in-place
content bend, a WebGL media overlay, and a lens's background copy for free.

### The panel DOM contract

`glass()` (and `<Glass>` from the framework-isolated `/react` entry) build this structure on the host element. React
renders the layer children itself; the core **adopts** any `.lg-bg`/`.lg-sheen`
it finds and creates them otherwise (`.lg-spec` is always core-created, never
adopted). `destroy()` removes only nodes it created and restores every inline
style it wrote.

```
element.lg          the lens (position != static, overflow hidden, rounded,
 │                  isolation, tint background, shadow)
 ├─ .lg-bg          bent page-background copy (optional). ONE element carrying
 │                  a painted background + `filter: url(#lens-filter)`, sized
 │                  lens + sampling margin and pulled back by -margin so the rim
 │                  never samples past the copy. pointer-events none, z-index 0.
 │                  On the Chromium backdrop tier it instead carries a per-lens
 │                  `backdrop-filter: url(#filter)` at inset 0 — no copy, no
 │                  margin, no transform. In the Safari native tier it carries a
 │                  native `backdrop-filter: blur() saturate()` and no SVG filter.
 ├─ .lg-sheen       CSS rim light + directional sheen, z-index 1, aria-hidden.
 ├─ .lg-spec        baked specular highlight (Chromium backdrop tier only).
 │                  `mix-blend-mode: plus-lighter`, z-index 1, aria-hidden.
 │                  Core-created, never adopted; absent when specular is 0.
 └─ (children)      your crisp, interactive content, z-index 2 via the
                    `.lg > :not(.lg-sheen):not(.lg-bg):not(.lg-spec)` rule.
```

### The content-surface contract

```
element.lgs-surface   registered content surface, carrying the shared filter.
 │                    On Safari only, also `.lg-composited` (translateZ(0)) —
 │                    Safari blanks feImage-backed filters on non-composited
 │                    layers; other engines must NOT promote (see rule 1).
 └─ .lgs-bg  (opt.)   viewport-registered page-background copy, first child,
                      behind the content (z-index -1), pointer-events none. Lets
                      lenses bend wallpaper + content together in one filter and
                      keeps `background-attachment: fixed`-style backdrops alive
                      under the filter.
```

The surface element must **not** be its own scroller (Safari rule 4); wrap a
scroller inside it. A media surface adds a sibling `.lgm-overlay` canvas after
the media element instead.

## The background model

The page background is a module-level singleton, not per-lens config. Its value
is an explicit `setBackground(css)` if set, else auto-detected from
`getComputedStyle(document.body)` (background image + colour). Every `.lg-bg` and
`.lgs-bg` copy subscribes to it.

**Cover-fit without consumer variables.** When the background is a `url()` image,
its natural size is read (preloaded once per URL) and a `background-size`/
`background-position` is computed that reproduces `background-size: cover;
background-position: center` of the viewport, then offset by each copy's own
viewport position (so every copy lines up with the real page). Gradients and
colours get viewport-sized placement with the same offset math. Size recomputes
on resize, position on scroll. The library never writes to `document.body` — a
wallpaper switch is "set the body background, then `setBackground(null)` to
re-detect".

## The Chromium zero-lag backdrop tier

The painted-copy path (`.lg-bg`) repositions the background copy from JavaScript
on every scrolled frame. Modern browsers scroll on the **compositor thread**, so
any JS-driven alignment is at least one frame behind the scroll the compositor
has already presented — a background that visibly lags the page underneath it
while scrolling, and no amount of optimisation removes it, because the alignment
is running on the wrong thread. Zero lag requires the compositor **itself** to do
the alignment.

`backdrop-filter: url(#filter)` is exactly that mechanism. The compositor samples
the real backdrop at composite time and runs our `feImage`/`feDisplacementMap`
chain over it, so the refraction tracks the scroll for free — perfect alignment,
by construction. The catch: **only Chromium renders SVG `url()` filters in
`backdrop-filter`.** Safari and Firefox implement `backdrop-filter` for the
built-in function list only (blur, saturate, …), which cannot displace. So this
is an engine-gated tier, detected by `supportsBackdropUrlFilter()` in `filter.ts`:
a `navigator.userAgentData` Chromium-brand check (with a UA-string fallback, iOS
"Chrome" excluded — it is WebKit) **AND** a guarded
`CSS.supports("backdrop-filter", "url(#x)")`. The `CSS.supports` gate alone is
untrustworthy — an engine can parse the value without rendering it — so the
engine check carries the decision.

### What the tier changes

When detection passes **and** `background` is `"auto"` (the default), `.lg-bg`
stops being a painted copy and becomes a **backdrop carrier**: inset 0, no
sampling margin, no transform, `backdrop-filter: url(#perLensFilter)`. A lens on
this tier:

- **registers with no content or media surface.** The backdrop-filter already
  bends wallpaper, live scrolling content and playing media behind the lens in
  one mechanism — registering a sub-lens or WebGL instance would bend those
  pixels twice. Surfaces receive no sub-lenses and apply no filter; the WebGL
  overlay is unused.
- **does no scroll work.** No scroll subscription, no epsilon flush, no position
  re-sync. Only a change to the lens's border-box **size** rebuilds the map and
  filter (signature-guarded, so a same-size resync is a no-op).
- **gets exact per-lens blur and chroma.** Each lens carries its own filter
  (`buildBackdropFilter`), so the per-surface-maxima sharing that a content
  surface's one shared filter forces is a **copy/content-path limitation only**
  now — it does not apply here.

Explicit backgrounds opt out: a `background:` CSS *string* is an arbitrary value,
not the real backdrop, so the compositor cannot sample it — it stays on the
painted-copy path even on Chromium. `background: false` still means no copy.

### Keeping the per-frame chain cheap

A backdrop filter re-runs over the live backdrop **every composited frame**, so
per-frame chain cost, not build cost, dominates. The naïve full chain (3-pass
chroma + in-chain specular) measured ~41 fps on a 2 s driven scroll of the demo
(headed Chrome 149, dpr 2). Two cuts pay for the tier:

- **Area-adaptive chroma.** `BACKDROP_CHROMA_AREA_LIMIT` (150 000 CSS px²,
  ~390×390 px, exported from `filter.ts`): a lens larger than this drops to a
  single displacement pass instead of the 3-pass chromatic dispersion. The
  fringe is a rim-only effect and a large pane does not earn three full-area
  passes; docks and pills stay under the limit and keep full chroma, code panes
  go over.
- **Baked specular.** The specular highlight derives purely from the *static*
  displacement map, so it is baked out of the per-frame chain into a static
  `.lg-spec` overlay (`mix-blend-mode: plus-lighter`, bitmap from
  `bakeSpecularHighlight()` in `map.ts`, generated async, regenerated on size
  change, absent when specular is 0). `plus-lighter` reproduces the in-chain
  arithmetic composite (`k2·spec + lens`) exactly. In-chain specular cost ~30 fps
  at these sizes; the static overlay is free.

Net, with 32 live lenses on the demo: ~85 fps scrolling / ~117 fps idle, versus
~56 fps *with* the one-frame lag on the old copy path; the adaptive + baked
config measured up to 103 fps in isolation. Run-to-run variance is real — read
these as the shape of the win, not a guaranteed single number.

### Caveats

- **Backdrop-root leniency.** Per spec a filtered element is its own backdrop
  root, so a lens nested inside a filtered surface "should" sample that surface,
  not the page. Chromium is currently more lenient and still samples the page
  wallpaper — which is what we want, and what the tier relies on. A browser
  regression test in `glass.browser.test.ts` guards against Chromium tightening
  this.
- **Safari and Firefox are unchanged.** They keep the copy architecture and its
  one-frame scroll lag; this tier is a Chromium bonus, not a portable fix. A
  possible future mitigation there is a `background-attachment: fixed` carrier
  the compositor pins, but it is untested — it conflicts with the
  transform-promotion the copy path needs, and iOS ignores fixed attachment.
  Known limitation + future work, not shipped.

## Displacement map

A small PNG drawn on a `<canvas>`. R/G encode how far each pixel bends in x/y
(128 = no shift); B carries an optional specular value. The lens is a
rounded-rectangle **signed-distance field**: bending is concentrated in a rim of
thickness `depth` and fades to zero toward the centre — a clear middle with a
refractive bevel, like real curved glass.

The map is regenerated only when the glass changes **shape**. When it merely
**moves** (a slider thumb, a toggle indicator) only the backdrop copy's offset
shifts — cheap, so motion stays at frame rate. For a moving sub-lens the map is
placed as a small bump bitmap on a flat-grey field and slid by repositioning the
`feImage` (`moveFilterLens` — two attribute writes per frame, no repaint or map
rebuild). Each regeneration uses a fresh filter id to defeat Safari's
filter-output cache.

A few more passes finish the look:

- **Chromatic aberration**: the displacement is run three times at slightly
  different scales and recombined per channel, for a red/blue rim fringe.
- **Specular**: an optional filter highlight blended from the map's blue channel.
- **Rim light**: a CSS bevel highlight (inset box-shadows + a directional
  gradient on `.lg-sheen`), independent of the filter so colour/opacity tweaks
  cost nothing to re-render.

## The content-surface filter (multi-sub-lens)

A content surface carries exactly **one** SVG filter no matter how many lenses
sit over it. The filter lays down a neutral-grey `feFlood` field (128/128 = zero
displacement everywhere) and places one small lens map as a positioned `feImage`
per overlapping lens, merges the bumps, then runs the shared chain once: blur →
displacement (1 pass, or 3 for chroma) → specular → composite the bent result
back only inside the merged lens silhouette (outside it the source passes through
crisp). This is why N glass panels over one surface stay cheap: **moving a lens
is two attribute writes** on its `feImage` (`moveFilterLens`) — no map regen, no
filter rebuild, no repaint.

**Per-lens strength on a shared chain.** The chain's `scale` is the *max* of the
registered lenses' scales; each lens's map is generated with
`amplitude = lens.scale / chainScale` (a multiplier on dx/dy before the 128
offset — the `amplitude` option on `generateDisplacementMap`). So each lens keeps
its own shape, depth, specular and displacement strength, baked into its map,
while sharing one displacement pass. `blur` and `chroma` are shared per surface
(the max of the lenses' values — a documented limitation), with a small blur
floor to antialias displaced text. This maxima-sharing is a property of the
**shared-filter copy/content path only**; on the Chromium backdrop tier each lens
owns its filter, so blur and chroma are exact per lens.

Adding or removing a lens rebuilds the surface's filter with a **fresh id** (to
defeat Safari's filter-output cache); a pure move does not.

## Geometry and invalidation

A lens or surface must re-sync when anything moves it or what it refracts. The
plumbing is deliberately event/observer-driven, with the `requestAnimationFrame`
ticker used as sparingly as possible:

- **One** shared window `scroll` (capture, passive) + `resize` listener pair
  serves every lens and surface (module-level, refcounted).
- **One `ResizeObserver` per lens** covering the lens element plus its registered
  surface elements.
- **`geometryChanged()`** for programmatic moves outside scroll/resize.
- **One shared rAF ticker**, the *only* rAF in the geometry system, running only
  while ≥1 lens needs it. A lens joins it when `track: "live"` (JS-driven
  per-frame motion), and — for `track: "auto"` — **automatically while a CSS
  transition/animation runs in its subtree**: it subscribes on
  `transitionrun`/`animationstart` (both bubble) and drains itself after
  `getAnimations({subtree: true})` reports quiet for two consecutive frames. So
  sliding switch thumbs and segmented-control pills need no manual tracking, and
  an idle page keeps the ticker fully off.

That last point matters for Safari specifically: a perpetual rAF doing a
`getBoundingClientRect` (a forced layout read) per lens per frame makes Safari's
pre-click compositing flush slow enough to delay click handling. Nothing rides
the ticker unless it currently needs to.

Surfaces also broadcast a geometry invalidation when they appear or disappear, so
already-mounted lenses discover a new surface (or fall back to the background
copy when one is destroyed).

## Routing rules

On lens create/update and on every geometry invalidation:

0. **Chromium backdrop tier (highest priority).** If `supportsBackdropUrlFilter()`
   and `background` is `"auto"`, the lens skips surface registration entirely and
   `.lg-bg` becomes a `backdrop-filter: url()` carrier the compositor samples at
   composite time (see
   [The Chromium zero-lag backdrop tier](#the-chromium-zero-lag-backdrop-tier)).
   Rules 1–5 do not run. An explicit CSS-string `background`, or
   `background: false`, falls through to the rules below.

For each candidate surface (all surfaces in the current scope, or the explicit
same-scope `opts.surfaces` list):

1. **Descendant exclusion.** If the surface contains the lens or the lens
   contains the surface, the pair never registers (filtering would bend the
   lens's own crisp children); the lens refracts the background copy instead. A
   dev-warning fires once only if the surface was named explicitly.
2. **Overlap.** Rect intersection decides registration.
3. **Content surface + overlap** → a sub-lens in that surface's shared filter.
4. **Media surface + overlap** → a lens instance in the surface's WebGL pass.
5. **Background copy** paints iff `background !== false` and the union of
   overlapping content/media surface rects does not fully cover the lens (exact
   coverage via coordinate compression, 1px per-edge tolerance). Fully covered →
   `.lg-bg` is hidden. Partial overlap uses one reusable even-odd SVG clip path;
   surface intersections become seam-expanded holes and moves mutate only `d`.
6. **Runtime policy.** Provisional device-pixel area budgets are 3,000,000 for
   Chromium, 750,000 for Firefox, and 1,500,000 for WebKit. Quality changes the
   budget monotonically and caps effective DPR/chroma/specular. WebKit retains
   its hard 2048 device-pixel dimension. Exceeded work enters the configured
   fallback tier with a diagnostic reason and effective values.
   SVG allocation uses `(source + 2·filterReach) · dpr` in each dimension after
   quality caps/adaptive chroma are resolved; the WebKit hard dimension uses
   those expanded bounds. Backdrop carriers and WebGL use raw bounds because
   they do not allocate that expanded SVG source region.

CSS-only props (`backdrop`, `tint`, `rimLight`, `shadow`) are deliberately
excluded from the map/filter rebuild signature, so a colour or opacity change
(e.g. a switch toggling on/off) restyles without any canvas, PNG or filter work.

## The media backend (WebGL)

For a surface that's already a texture — an image, a `<canvas>`, a `<video>`, or
any `TexImageSource` — an SVG filter can't read the pixels. `createMediaSurface`
positions an overlay `<canvas class="lgm-overlay">` over the media rect and uses
`WebGLGlass` to refract it. Displacement is computed analytically in a fragment
shader (the same rounded-rect SDF as the PNG map, evaluated per fragment), and
every lens is one instance of a single instanced draw call, so cost is flat in
the number of lenses.

```ts
const r = new WebGLGlass(canvas);
r.setSource(imageOrCanvasOrVideo);
r.resize(width, height);
r.setLenses([{ x, y, w, h, radius, depth, scale, chroma, specular }]);
r.render();
```

`createMediaSurface(media, { live })` wraps this: `live: true` runs an
upload+render loop, but only while ≥1 lens is registered *and* the media rect is
on-viewport; a static source (`live: false`) uploads once and re-renders on lens
geometry change. Without WebGL2 the surface registers but never activates —
lenses over it fall back to the background-copy path (routing rule 5 treats an
inactive media surface as non-covering) — and it warns once.

### Which backend feeds a lens?

- **Background copy** (default, no surface) — a bent CSS copy of the page
  background. Cross-browser, cheap, for standalone panels over the wallpaper.
- **Content filter-on-DOM** (`createSurface`) — one shared SVG filter on live
  page content: cross-browser, keeps content interactive and in place, O(1)
  filter per surface.
- **Media WebGL** (`createMediaSurface`) — for surfaces an SVG filter can't read
  (canvas, video). Requires WebGL2.

A single lens can use several at once (e.g. a dropdown over a content surface and
the wallpaper).

## Safari constraints and countermeasures

The milestone-0 spike in `examples/spike/` was removed after its findings were
condensed here. Playwright WebKit is useful structural coverage, but real Safari
uses a different GPU path and remains the correctness gate for release.

### Confirmed Safari rules

1. **Composite every filtered element — on Safari ONLY.** A CSS-referenced SVG
   filter containing `feImage` blanks the element on non-composited layers in
   real Safari, so the core adds `.lg-composited` (`transform: translateZ(0);
   will-change: transform`) to every filtered surface and `.lg-bg` layer behind
   a UA gate. `will-change: filter` did not reliably promote the v0.0.2
   `.lq-refraction` layer. The gate matters as much as the promotion: applying
   it universally gave every background copy its own compositor layer, and
   because scrolling shifts each copy's `background-position`, every promoted
   layer's texture re-uploaded on every scrolled frame — measured at 8 fps
   scrolling in the demo on Chromium, versus 49+ fps with promotion removed.
   Chromium and Firefox render feImage filters fine unpromoted.
2. **Use minimal filter regions.** The old `-30% ... 160%` region is too large
   for large surfaces and still too small for some high-scale small lenses. The
   region should be computed from element bounds plus displacement reach
   (`scale`, including chroma's strongest pass) plus blur reach. This keeps
   Chromium and Firefox cheaper and raises Safari's usable content-surface size.
3. **Safari moving content lenses need a CSS flush.** Initial `feImage` x/y
   placement is correct, but bare x/y mutation is flaky in real Safari. After
   `moveFilterLens`, Safari alternates the CSS filter string between
   `url(#id)` and `url(#id) brightness(1.0001)`, coalesced to one write per
   animation frame. Chromium and Firefox should keep the native mutation path.
   During interactive Safari drags, the content backend should temporarily drop
   chroma to zero and restore it on release.
4. **A content surface must not be its own scroller.** Safari anchors the filter
   to the scroll layer's content when a filtered element scrolls. The required
   structure is `surface[filter] > scroller > content`, with a dev warning when
   the surface element itself has scrollable overflow.
5. **Safari has a filter-region buffer budget.** Route content surfaces to a
   native degrade tier when `size * regionScale * devicePixelRatio` exceeds the
   Safari cap. The spike confirmed the shape of the budget and observed that
   a composited 500px wide-region rung fit while 900px blanked; use a
   conservative default cap of about 2048 device px until `scripts/safari-check`
   records a project-specific release value.

### Backend tiers

One public API routes each surface/lens pair to the strongest backend the engine
can run reliably:

| Backend | Chromium / Firefox | Safari |
| --- | --- | --- |
| Background clone | Full fidelity | Full fidelity; lens-sized static filters move by background-position, not SVG filter mutation. |
| Media WebGL | Full fidelity | Full fidelity; no SVG filter is involved. |
| Content filter-on-DOM | Full refraction with native `feImage` mutation moves | Conditional full refraction within the size budget, using the epsilon flush path for moving lenses. Over-budget surfaces degrade to native `backdrop-filter: blur() saturate()` plus tint, rim and sheen. |

The degrade is per surface registration. The panel chrome stays coherent; only
live-content refraction is simplified on Safari when the surface is too large.

On Chromium, an `auto`-background lens does not use the background-clone row at
all: it routes through the [zero-lag backdrop tier](#the-chromium-zero-lag-backdrop-tier)
above, where the compositor bends wallpaper and live content together with no
scroll lag. That tier is Chromium-only; Safari and Firefox keep the clone/filter
rows in the table.

Per-lens frost remains out of scope for v0.1. A shared content-surface filter can
carry shared blur, but the spike did not prove a cheap, masked, movable per-lens
blur path that is Safari-compatible.

## Project layout

```
src/
  core/types.ts               shared types (GlassMaterial/Options/Handle, Surface*, SubLens, Lens*)
  core/map.ts                 generateDisplacementMap (+ per-lens amplitude)
  core/filter.ts              buildGlassFilter (multi-lens), moveFilterLens, <defs> mgmt, region math
  core/background.ts          the background model (detect, cover-fit, subscribers, setBackground)
  core/geometry.ts            shared scroll/resize/rAF invalidation plumbing
  core/surfaces.ts            content-surface registry + shared filter sync + Safari budget/tiers
  core/media.ts               media-surface backend over WebGLGlass
  core/panel.ts               lens chrome — build/adopt/restore .lg / .lg-sheen / .lg-bg
  core/glass.ts               glass() — routing/orchestration
  core/liquid-glass-webgl.ts  WebGL2 backend for texture sources (image/canvas/video)
  core/liquid-glass.css       structural styles for the .lg-* / .lgs-* / .lgm-* layers
  react/index.tsx             Glass, GlassSurface, GlassMediaSurface, useGlass, useSurface, useMediaSurface
  index.ts                    public entry
  core/*.test.ts              unit tests (jsdom) next to each module
  core/glass.browser.test.ts  structural browser suite (chromium/webkit/firefox)
examples/demo/                Vite showcase app (styled component references)
scripts/safari-check          real-Safari screenshot smoke/pixel-diff gate
.github/workflows/            CI (lint/typecheck/test/build) + npm release
```
