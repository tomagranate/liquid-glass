# @tomagranate/liquid-glass

An Apple-style **liquid-glass** (refraction) effect with progressive enhancement.
Chromium can sample the live backdrop in the compositor; Safari and Firefox use
bounded SVG-filtered copies or content surfaces when they fit the calibrated
budget, and otherwise keep the component usable with native blur, tint, rim,
and sheen. The framework-independent core also includes a WebGL backend for
`<canvas>`/`<video>`.

One call per glass panel — **`glass(el)`** (or **`<Glass>`** in React) — works
with **zero configuration** over any page, and gets *better* when the page
registers surfaces: lenses that select surface routing (`background: false`)
then refract live scrolling content and playing video in place, not just the
wallpaper.

```sh
npm install @tomagranate/liquid-glass
```

Import the stylesheet once, anywhere in your app:

```ts
import "@tomagranate/liquid-glass/styles.css";
```

The package root is framework-free and does not load React. React bindings live
at `@tomagranate/liquid-glass/react`; React and React DOM (>=18) are optional
peer dependencies needed only when that subpath is imported.

## Concepts

Two nouns, and a router that connects them:

- A **lens** is a glass panel — `glass(el)` / `<Glass>`. The library styles its
  chrome (radius, tint, shadow, sheen) and refracts whatever sits behind it. Its
  children stay crisp and interactive on top.
- A **surface** is a registered pixel source a lens can refract:
  - a **content surface** (`createSurface` / `<GlassSurface>`) — a live DOM
    subtree whose pixels bend **in place** and stay selectable and clickable;
  - a **media surface** (`createMediaSurface` / `<GlassMediaSurface>`) — a
    `<video>`/`<canvas>`/`<img>`, refracted through a WebGL overlay (an SVG
    filter cannot sample those);
  - the **page background** — an implicit singleton, auto-detected from
    `document.body` (override with `setBackground`). Every lens paints its own
    bent copy of it.

A lens over no surface still works: it refracts the page background. Register
surfaces only for the parts you want to bend live. Put a surface and its lens
in the same positioned wrapper as **overlapping siblings**. Do not nest either
one inside the other: filtering an ancestor would also bend the lens's own
children, which must remain crisp and interactive.

## Quick start

The simplest thing is a single lens over the page wallpaper — no surfaces, no
config:

```ts
import { glass } from "@tomagranate/liquid-glass";
import "@tomagranate/liquid-glass/styles.css";

glass(document.querySelector("#card"));
```

That's it. The card now refracts the page background; the real element
underneath stays interactive. From here, the three scenarios:

### A — Panel over wallpaper (zero config)

Nothing to register. The lens paints a bent copy of the auto-detected page
background.

```ts
import { glass } from "@tomagranate/liquid-glass";

glass(document.querySelector(".card"), { radius: 24, chroma: 0.5 });
```

```tsx
import { Glass } from "@tomagranate/liquid-glass/react";

<Glass className="card" radius={24} chroma={0.5}>
  {children}
</Glass>;
```

### B — Lens over a bounded live-content island

Register only the UI island that earns in-place refraction. Keeping content
surfaces bounded gives Firefox and Safari predictable work; a general nav should
use the zero-config route shown above and let the runtime select its backend.

```ts
import { glass, createSurface } from "@tomagranate/liquid-glass";

createSurface(document.querySelector(".live-card"));
glass(document.querySelector(".card-lens"), {
  radius: 24,
  blur: 2,
  background: false,
});
```

```html
<div class="glass-stage">
  <div class="live-card">Live, selectable content</div>
  <button class="card-lens">Open</button>
</div>
```

`.glass-stage` is positioned; `.live-card` and `.card-lens` are overlapping
sibling layers. `background: false` explicitly selects registered-surface
routing on Chromium instead of its higher-priority compositor backdrop tier.

```tsx
import { Glass, GlassSurface } from "@tomagranate/liquid-glass/react";

<>
  <div className="glass-stage">
    <GlassSurface background className="live-card">
      {liveCardContent}
    </GlassSurface>
    <Glass
      as="button"
      className="card-lens"
      radius={24}
      blur={2}
      background={false}
    >
      Open
    </Glass>
  </div>
</>;
```

`background` on the surface paints the page wallpaper behind its content, so a
lens bends wallpaper and content together in one pass.

### C — Controls over playing video

An SVG filter can't read video pixels, so register the video as a **media
surface**; lenses over it are drawn by a WebGL shader fed the same displacement.

```ts
import { glass, createMediaSurface } from "@tomagranate/liquid-glass";

createMediaSurface(document.querySelector("video"), { live: true });
glass(document.querySelector(".play"), {
  radius: "50%",
  chroma: 0.7,
  background: false,
});
```

```html
<div class="video-stage">
  <video src="/coast.mp4" muted loop playsinline></video>
  <button class="play" aria-label="Play"></button>
</div>
```

```tsx
import { Glass, GlassMediaSurface } from "@tomagranate/liquid-glass/react";

<div className="video-stage">
  <GlassMediaSurface live className="video-source">
    <video src="/coast.mp4" muted loop playsInline />
  </GlassMediaSurface>
  <Glass as="button" className="play" radius="50%" background={false}>
    {playIcon}
  </Glass>
</div>;
```

`live` re-uploads the video every frame while a lens overlaps it (and only
then, and only while the video is on-screen). A static `<canvas>` or `<img>`
uploads once — leave `live` off.

## React

Components render the host element plus their library layers; there are no refs
to wire and no class-name contract. Everything is SSR-safe (controllers attach
in `useLayoutEffect`).

| Component / hook | Role |
| --- | --- |
| `<GlassRoot quality="balanced">` | Own an isolated registry, background, and policy. Nested roots isolate; portals retain their nearest React scope. |
| `<Glass as="div" {...material}>` | A lens. Material/option props are peeled off; every other prop spreads onto the host. `as` picks the tag (`"nav"`, `"button"`, …). |
| `<GlassSurface background>` | Register the host subtree as a content surface. Place lenses as overlapping siblings, not descendants. |
| `<GlassMediaSurface live>` | Register the first `<video>`/`<canvas>`/`<img>` descendant as a media surface. Place lenses beside the wrapper. |
| `useGlass(ref, opts)` | Attach a lens to an existing element; returns the live `GlassHandle` (null before mount). |
| `useGlassDiagnostics(interval?)` | Read real counters and policy decisions for the nearest root (500 ms status cadence; `0` for one shot). |
| `useSurface(ref, opts)` | Register an existing element as a content surface. |
| `useMediaSurface(ref, opts)` | Register an existing media element as a media surface. |

The hooks are escape hatches for when you already own the element and its
markup. A realistic case is a **switch**: the track is a tiny surface, the thumb
is a lens that bends the track — colour transition and all — as it slides.

```tsx
import { useGlass, useSurface } from "@tomagranate/liquid-glass/react";

function Switch({ on, onChange }) {
  const track = useRef(null);
  const thumb = useRef(null);
  useSurface(track); // track colour bends under the thumb
  useGlass(thumb, { radius: 999, background: false }); // force track-surface routing on Chromium
  return (
    <div data-on={on} role="switch" onClick={() => onChange(!on)}>
      <span ref={track} className="track" />
      <div ref={thumb} className="thumb" />
    </div>
  );
}
```

The thumb needs no `track: "live"` and no manual calls — a CSS transition or
animation anywhere in a lens's subtree is detected and tracked automatically for
as long as it runs (see [auto-tracked motion](#rough-edges-handled)). Reach for
`geometryChanged()` (returned on the handle) only for instant programmatic jumps
without a transition, and `track: "live"` only for JS-driven per-frame motion.

## API reference

### `glass(el, options?) → GlassHandle`

`options` is a `GlassMaterial` plus the policy and routing fields below. Every field is
optional.

**`GlassMaterial`**

| Option | Default | Meaning |
| --- | --- | --- |
| `radius` | `16` | Corner radius, px or a `"NN%"` string. |
| `depth` | `14` | Refracting rim thickness, px. |
| `scale` | `90` | Displacement strength, px. |
| `blur` | `0.6` | Frost, px. |
| `chroma` | `0.4` | Chromatic aberration, 0..1. |
| `specular` | `0` | Filter specular highlight, 0..1. |
| `specularAngle` | `135` | Light direction, degrees. |
| `dpr` | `2` | Displacement-map supersampling. |
| `tint` | `rgba(255,255,255,0.06)` | CSS tint background. |
| `rimLight` | `0.6` | CSS bevel strength, 0..1.5. |
| `shadow` | `0 8px 30px rgba(0,0,0,0.25)` | CSS drop shadow. |

**`GlassOptions` extras**

| Option | Default | Meaning |
| --- | --- | --- |
| `preset` | `"regular"` | Material starting point: `"thin"`, `"regular"`, or `"prominent"`. Explicit material fields override the preset. |
| `quality` | `"balanced"` | `"performance"` caps DPR at 1 and disables chroma/specular; `"balanced"` caps DPR at 1.5 and adapts costly passes; `"fidelity"` permits DPR 2 within budget. |
| `fallback` | `"blur"` | Unsupported/over-budget appearance: native `"blur"`, tint-only `"tint"`, or `"none"`. |
| `onBackendChange` | — | Called only when the stable ordered backend set changes. |
| `surfaces` | `"auto"` | Refract every geometrically overlapping surface in the current scope, or an explicit same-scope `SurfaceHandle[]`. On Chromium, set `background: false` to bypass the higher-priority auto-backdrop tier. |
| `track` | `"auto"` | `"auto"` = event/observer-driven, auto-riding a shared rAF only while a CSS animation runs in the subtree; `"live"` = re-read geometry every frame (JS-animated lenses). |
| `background` | `"auto"` | The bent background copy behind uncovered lens area. `"auto"` selects Chromium's compositor backdrop tier when available; `false` disables the copy/backdrop and allows explicit content/media routing; a CSS string uses that background instead. |

**`GlassHandle`** exposes `readonly backends`, a stable ordered array containing
`"backdrop"`, `"background-copy"`, `"content-svg"`, `"media-webgl"`,
`"native"`, and/or `"none"`. The same value is mirrored as a comma-separated
`data-lg-backend` attribute for diagnostics and automated checks.

| Method | Effect |
| --- | --- |
| `update(patch)` | Patch material/options. Cheap for CSS-only props (tint, shadow, rimLight); rebuilds maps/filters only if the filter signature changed. Never re-creates the lens. |
| `geometryChanged()` | Re-sync after a programmatic move outside scroll/resize. |
| `refresh()` | Force a full re-sync (regenerate maps, rebuild filters, re-route). |
| `destroy()` | Restore the element completely (removes only nodes it created, restores every inline style it wrote). |

### `createSurface(el, options?) → SurfaceHandle`

Register a live DOM subtree as a content surface. `options.background` (`boolean
| string`) paints the page background behind the surface's content in a `.lgs-bg`
layer — `true` uses the auto-detected page background, a string is explicit CSS.
The lens must be an overlapping sibling of the surface. A lens nested inside
the surface, or containing it, is deliberately excluded so the surface filter
cannot bend the lens's own crisp content.

### `createMediaSurface(media, options?) → SurfaceHandle`

Register a `<video>`/`<canvas>`/`<img>`. `options.live` (`boolean`) re-uploads
the source every frame while a lens overlaps it. Keep the glass control as a
sibling overlay; nesting it in the media wrapper is excluded for the same
crisp-content reason. Set the lens's `background: false` when the example must
select the media backend on Chromium.

`SurfaceHandle` = `{ readonly element, refresh(), destroy() }`.

### `createGlassScope(options?) → GlassScope`

Create an isolated vanilla owner with scoped `glass`, `createSurface`,
`createMediaSurface`, `setBackground`, `getDiagnostics`, and `destroy` methods.
Top-level functions use a default singleton. Scope destruction releases every
lens and surface it owns.

Area thresholds are deliberately **provisional calibration hooks**: 3,000,000
Chromium, 750,000 Firefox, and 1,500,000 WebKit device pixels. `performance`
uses 50%; `fidelity` uses 2× except for WebKit's hard 2048 device-pixel filter
dimension. Override with `budgets`. Diagnostics report policy reasons,
effective DPR/chroma/specular, expanded filter width/height/area, and
lifecycle/work counters. SVG surface and background-copy costs include
displacement, blur, and chroma reach beyond the raw source bounds; compositor
backdrop and WebGL dimensions are not artificially expanded.

Chromium scopes also enforce an aggregate live-backdrop invariant. Visible
backdrop lenses are charged by physical pixel area × displacement passes. At
1,500,000 balanced units (3,000,000 for fidelity; performance is always lean),
the whole scope switches to a DPR-1, single-pass, no-specular chain. It restores
full quality only below 80% of the threshold, preventing boundary churn. A tier
change is one microtask-coalesced refresh; steady scrolling performs no policy
or rebuild work. `getDiagnostics().backdropWorkload` exposes `lenses`,
`devicePixelPassArea`, `tier`, and `reason` for production observability and
automated invariants. These thresholds are provisional and covered by the real
branded-browser performance gate.

All engines also have a separate aggregate painted-copy invariant. Each
visible copy is charged its expanded physical filter area × its
displacement/specular pass count. Real Safari 26.5 calibration found that one
balanced 240×176 copy
(~1.03M pixel-passes) remains usable, while eight copies still failed at
24.5fps even after reducing them to DPR 1 and one pass. WebKit scopes therefore
enter the configured native/tint fallback above 1,500,000 pixel-passes and
restore copied refraction below 70% of that threshold. Branded Chrome 149
testing sustained eight full-quality copies but collapsed at 32, so Chromium
uses a provisional 12,000,000 pixel-pass fallback ceiling. At 120 Hz, branded
Firefox keeps eight copies smooth only with a reduced DPR-1, single-pass chain;
it enters that lean tier above 6,000,000 pixel-passes and native/tint fallback
above 12,000,000. Both thresholds restore with 70% hysteresis so normal groups
retain copied refraction without boundary churn.
`getDiagnostics().backgroundCopyWorkload` exposes the
count, aggregate cost, `full` / `lean` / `native` tier, and the public
`aggregate-background-copy-lean-device-pixel-pass-budget` or
`aggregate-background-copy-device-pixel-pass-budget` reason. Transitions are
microtask-coalesced; offscreen and destroyed lenses do not contribute.

### `setBackground(bg: string | null)`

Set/override the implicit page background (any CSS background value), or pass
`null` to re-auto-detect from `document.body`. Propagates to every mounted lens
and surface background copy. The library never touches `document.body` itself, so
the pattern for a wallpaper switch is: set the real body background, then call
`setBackground(null)` to re-sync the copies.

### Low-level building blocks

Also exported for custom pipelines: `generateDisplacementMap` (with an
`amplitude` option), `buildGlassFilter` / `moveFilterLens` (the multi-lens SVG
filter), and `WebGLGlass` (the texture backend), plus the types `SubLens`,
`LensSpec`, `LensRect`, `LensMaterial`, `DisplacementMapOptions`,
`GlassFilterOptions`. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Rough edges handled

The library absorbs the things a refraction effect normally pushes onto you:

- **Background auto-detection + cover-fit.** The page background is read from
  `document.body`; when it's a `url()` image the natural size is measured and a
  `cover`/`center`-equivalent placement is computed per copy, offset to its
  viewport position. No `--` CSS variables to maintain, no body-style coupling.
- **Multi-lens shared filters.** N lenses over one content surface share ONE SVG
  filter (a neutral field with one `feImage` sub-lens each). Moving a lens is two
  attribute writes — O(1) per surface — with no map regen or filter rebuild.
- **Descendant exclusion.** A lens that contains a surface (or vice versa) never
  registers against it — filtering would bend the lens's own crisp children — so
  it refracts the background copy instead. Use a positioned parent with the
  surface and lens as overlapping sibling layers; use `background: false` when
  explicitly targeting that surface on Chromium.
- **Overlap composition.** Full cover hides the background copy. Partial cover
  uses one reusable even-odd SVG clip path; pure moves mutate only path geometry.
- **Auto-tracked CSS motion.** A lens joins the shared rAF ticker while a CSS
  transition/animation runs in its subtree and leaves it after two quiet frames,
  so sliding switch thumbs and pills need no manual tracking, and an idle page
  keeps the rAF (and its Safari click-latency cost) fully off.
- **Cross-engine budgets.** Provisional device-pixel budgets protect Chromium,
  Firefox's software displacement path, and WebKit's hard filter dimension.
- **Aggregate Chromium workload adaptation.** A scope automatically collapses
  many simultaneous compositor backdrop lenses to a one-pass chain, with
  hysteresis and one coalesced refresh at each tier crossing. Small groups keep
  full chroma; dense docks, grids, and particle-like layouts remain smooth.
- **Chromium zero-lag scrolling.** On Chromium — the one engine that renders SVG
  `url()` filters in `backdrop-filter` — a default (`background: "auto"`) lens is
  refracted by the compositor at composite time instead of a JS-repositioned
  copy, so its background tracks scrolling with no one-frame lag and does no
  per-scroll work. Safari and Firefox keep the cross-browser copy path (and its
  slight scroll lag). Automatic; nothing to configure.

## Limitations

- **Blur and chroma are per surface, not per lens** — a shared content-surface
  filter carries the *max* of the overlapping lenses' `blur`/`chroma`. Per-lens
  shape and displacement strength *are* independent (baked per lens into the
  map). This applies to the cross-browser copy/content path; on the Chromium
  backdrop tier each lens owns its filter, so blur and chroma are exact per lens.
- **Per-lens frost is out of scope** for v0.1.
- **Nested surfaces are discouraged.** They produce a development warning;
  bounded siblings have unambiguous filter ownership and budgets.

## Browser support

Tell the library what sits behind the glass and it chooses the fastest safe
route for each browser, falling back before the effect hurts the page.

| What you are refracting | Chrome | Safari | Firefox |
| --- | --- | --- | --- |
| Automatic glass | Live page | Wallpaper copy | Wallpaper copy |
| Live UI surface | Full effect | Full effect\* | Full effect\* |
| Video & canvas | Full effect | Full effect | Full effect |
| Fallback appearance | Blur or tint | Blur or tint | Blur or tint |

\* Keep registered UI areas bounded in Safari and Firefox. Large or dense areas
automatically become native blur/tint instead of breaking.

Pick the right kind of glass by what sits behind it. **Automatic glass**
(`<Glass>`) suits navigation, floating buttons, and wallpaper-backed cards;
Chrome bends the live page while Safari and Firefox use a matching background
copy. A **live UI surface** (`<GlassSurface>` + a `background: false` lens) is
the best cross-browser choice for controls, charts, and draggable lenses—keep it
bounded to a card or section. A **media surface** (`<GlassMediaSurface>`) is for
players, maps, games, and data visualizations, because browser filters cannot
read moving video or canvas. When an effect is oversized, dense, or over budget,
the component stays readable with native blur or tint.

## Browser strategy

| Engine | Default wallpaper/live page route | Bounded DOM surfaces | Video/canvas |
| --- | --- | --- | --- |
| Chromium | Compositor `backdrop-filter: url()` with aggregate lean-tier adaptation | SVG displacement within budget, then configured fallback | WebGL while visible and overlapping |
| Firefox | Painted background copy; scrolling may show one-frame alignment lag | SVG displacement can be software-rendered, so the conservative budget matters | WebGL while visible and overlapping |
| Safari | Painted copy for small workloads; aggregate copy workload switches dense groups to fallback | SVG displacement within WebKit size/work limits, then native blur or tint | WebGL while visible and overlapping |

This is one API with an honest backend contract, not a promise that every
engine renders identical pixels. Read `handle.backends`, the mirrored
`data-lg-backend` attribute, or `scope.getDiagnostics()` when the distinction
matters to your product. The bounded DOM and media columns describe lenses that
select those registered sources with `background: false`; a default Chromium
lens intentionally stays on the compositor backdrop route.

## Migrating from v0.0.2

v0.1 is a clean break. The old API is gone:

| Removed (v0.0.2) | Now (v0.1) |
| --- | --- |
| `applyGlass(el, opts)` | `glass(el, opts)` |
| `createGlassController` / `GlassController` | `glass()` returns a `GlassHandle` |
| `useGlass` returning 5 refs + nested `lq-*` markup | `<Glass>`, or `useGlass(ref, opts)` (one ref, no markup contract) |
| `useGlassTexture` | `createMediaSurface` / `<GlassMediaSurface>` / `useMediaSurface` |
| `alignTo` (hand-built copy for moving lenses) | `createSurface` — a moving lens bends the surface in place |
| `--lq-backdrop` / `--lq-cover-*` CSS vars, body-bg coupling | auto background detection; `setBackground()` to override |
| `.lq` / `.lq-refraction` / `.lq-backdrop` / `.lq-content` classes | `.lg` / `.lg-bg` / `.lg-sheen` (+ children); surfaces use `.lgs-surface` / `.lgs-bg` |

The low-level exports (`generateDisplacementMap`, `buildGlassFilter`,
`moveFilterLens`, `WebGLGlass`) survive with compatible semantics
(`buildGlassFilter` now takes `lenses: SubLens[]`).

## How it works

The effect is a copy of what's behind the glass, painted on its own layer and
bent by a rounded-rectangle displacement map — or, for live content, the SVG
filter is applied to the content itself so it bends in place. The full write-up —
the displacement map, surfaces × lenses, the multi-lens filter, the WebGL backend
and the Safari trade-offs — is in [ARCHITECTURE.md](ARCHITECTURE.md).

For a full worked example (nav, dock, control-center switches/sliders, video and
a WebGL shockwave), see the demo in [`examples/demo`](examples/demo).

## Develop

```sh
npm install
npm run dev        # the showcase demo → http://localhost:5180
npm run build      # build the package to dist/
npm run build:demo # production catalogue, resolved through package exports
npm run build:perf # production package-export benchmark fixture
npm run perf:all   # branded Chrome, Firefox, and real Safari W3C gate
npm run perf:all -- --quick # smaller local preflight
npm test           # vitest
npm run lint       # biome
npm run typecheck  # tsc --noEmit
```

Run `build:perf` after any `build` or `test:package` command because those clean
the root `dist/`. The branded-browser harness verifies the fixture and its
package-export provenance before opening a browser, and never rebuilds it
implicitly.
The macOS Safari job uses `safaridriver` against the same production fixture and
is a release gate; WebKit emulation is useful structurally but does not replace
that run.

## License

[MIT](LICENSE)
</content>
</invoke>
