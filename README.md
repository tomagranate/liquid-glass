# @tomagranate/liquid-glass

An Apple-style **liquid-glass** (refraction) effect for the web. The whole effect
rests on a single SVG filter primitive, **`feDisplacementMap`** — nothing is
sampled from underneath the glass, the content's own pixels are the ones moving —
so it's a plain `filter: url(#glass)` that works in **every** browser (Chromium,
Firefox, Safari), no flags. Framework-independent, with optional React bindings
and a WebGL backend for `<canvas>`/`<video>`.

One call per glass panel — **`glass(el)`** (or **`<Glass>`** in React) — works
with **zero configuration** over any page, and gets *better* when the page
registers surfaces: lenses then refract live scrolling content and playing video
in place, not just the wallpaper.

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
surfaces only for the parts you want to bend live.

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

### B — Nav over live scrolling content

Register the scroller's content as a **content surface**; any lens over it bends
the live pixels in place as they scroll — no duplicate copy of the page.

```ts
import { glass, createSurface } from "@tomagranate/liquid-glass";

createSurface(document.querySelector("main")); // content bends in place
glass(document.querySelector("nav"), { radius: 999, blur: 2 });
```

```tsx
import { Glass, GlassSurface } from "@tomagranate/liquid-glass/react";

<>
  <GlassSurface background>
    <main>{page}</main>
  </GlassSurface>
  {/* The nav lives outside the surface, so it refracts what scrolls beneath. */}
  <Glass as="nav" radius={999} blur={2}>
    {links}
  </Glass>
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
glass(document.querySelector(".play"), { radius: "50%", chroma: 0.7 });
```

```tsx
import { Glass, GlassMediaSurface } from "@tomagranate/liquid-glass/react";

<GlassMediaSurface live>
  <video src="/coast.mp4" muted loop playsInline />
  <Glass as="button" radius="50%">
    {playIcon}
  </Glass>
</GlassMediaSurface>;
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
| `<GlassSurface background>` | Register the subtree as a content surface. |
| `<GlassMediaSurface live>` | Register the first `<video>`/`<canvas>`/`<img>` descendant as a media surface. |
| `useGlass(ref, opts)` | Attach a lens to an existing element; returns the live `GlassHandle` (null before mount). |
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
  useGlass(thumb, { radius: 999 }); // the CSS slide is tracked automatically
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
| `surfaces` | `"auto"` | Refract every geometrically overlapping surface in the current scope, or an explicit same-scope `SurfaceHandle[]`. |
| `track` | `"auto"` | `"auto"` = event/observer-driven, auto-riding a shared rAF only while a CSS animation runs in the subtree; `"live"` = re-read geometry every frame (JS-animated lenses). |
| `background` | `"auto"` | The bent background copy behind uncovered lens area. `"auto"` paints it unless a surface fully covers the lens; `false` never paints; a CSS string uses that instead of the page background. |

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

### `createMediaSurface(media, options?) → SurfaceHandle`

Register a `<video>`/`<canvas>`/`<img>`. `options.live` (`boolean`) re-uploads
the source every frame while a lens overlaps it.

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
  it refracts the background copy instead.
- **Overlap composition.** Full cover hides the background copy. Partial cover
  uses one reusable even-odd SVG clip path; pure moves mutate only path geometry.
- **Auto-tracked CSS motion.** A lens joins the shared rAF ticker while a CSS
  transition/animation runs in its subtree and leaves it after two quiet frames,
  so sliding switch thumbs and pills need no manual tracking, and an idle page
  keeps the rAF (and its Safari click-latency cost) fully off.
- **Cross-engine budgets.** Provisional device-pixel budgets protect Chromium,
  Firefox's software displacement path, and WebKit's hard filter dimension.
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
npm run build:perf # production package-export benchmark fixture
npm run perf:all   # branded Chrome, Firefox, Safari W3C performance gate
npm run build      # build the package to dist/
npm test           # vitest
npm run lint       # biome
npm run typecheck  # tsc --noEmit
```

## License

[MIT](LICENSE)
</content>
</invoke>
