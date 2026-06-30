# Architecture

How the liquid-glass effect works and how the two backends are built. See the
[README](README.md) for installation and usage.

## The key idea (and why it works in every browser)

Most web "liquid glass" demos use `backdrop-filter: url(#filter)`, which only
works in Chromium. This library sidesteps that entirely.

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

## Layers

`applyGlass` (and the `useGlass` React binding) build this structure inside the
host element:

```
.lq                 the glass element (overflow:hidden, rounded, isolates)
 ├─ .lq-refraction  has `filter: url(#glass)`; bends its child
 │   └─ .lq-backdrop a copy of what's behind the glass, kept aligned to reality
 ├─ .lq-sheen       CSS tint + rim light + hairline border + drop shadow
 └─ .lq-content     your real, interactive content, on top
```

The real element underneath stays selectable and clickable — only the
`.lq-backdrop` copy is refracted, and it has `pointer-events: none`.

## Two ways to feed the glass

- **Backdrop-clone** (default): the copy *is* the page background, read from the
  `--lq-backdrop` CSS variable (or the body background) and kept aligned to the
  viewport. Use for standalone surfaces — cards, buttons. The copy is a small box
  (element size plus a sampling margin), never a viewport-sized layer, so the
  filter's source graphic stays cheap for the compositor.
- **Refraction target** (`alignTo`): the caller supplies a copy of the specific
  content beneath the lens — a slider's fill, a switch's track, a highlighted
  pill — and the core keeps that copy glued over the real element as the lens
  moves. This is what drives the moving thumbs/indicators in the switch, slider
  and toggle group.

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
  gradient on `.lq-sheen`), independent of the filter so colour/opacity tweaks
  cost nothing to re-render.

## Alignment and performance

A backdrop copy must stay registered with whatever it refracts:

- **Clone mode** follows the page, so it only needs realigning on scroll/resize.
- **Refraction-target mode** (`alignTo`) tracks an element that can move on its
  own, so those controllers are realigned every animation frame.

Only `alignTo` controllers ride the shared `requestAnimationFrame` ticker;
clone-mode controllers stay off it and listen for scroll/resize instead. This
matters: a perpetual rAF doing a `getBoundingClientRect` (a forced layout read)
per controller per frame makes Safari's pre-click compositing flush slow enough
to noticeably delay click handling. Keeping clone-mode controllers off the ticker
avoids that.

CSS-only props (`backdrop`, `tint`, `rimLight`, `shadow`) are deliberately
excluded from the map/filter rebuild signature, so a colour or opacity change
(e.g. a switch toggling on/off) restyles without any canvas, PNG or filter work.

## The WebGL texture backend

For a surface that's already a texture — an image, a `<canvas>`, a `<video>`, or
any `TexImageSource` — an SVG filter can't read the pixels. `WebGLGlass`
refracts it instead. Displacement is computed analytically in a fragment shader
(the same rounded-rect SDF as the PNG map, evaluated per fragment), and every
lens is one instance of a single instanced draw call, so cost is flat in the
number of lenses.

```ts
const r = new WebGLGlass(canvas);
r.setSource(imageOrCanvasOrVideo);
r.resize(width, height);
r.setLenses([{ x, y, w, h, radius, depth, scale, chroma, specular }]);
r.render();
```

In React, `useGlassTexture({ getSource, width, height, lenses, live })` wires
this up: with `live: true` it re-uploads a playing video every frame; a static
source (a QR canvas) is uploaded once and re-rendered when the lenses change.

### Which backend?

- **SVG (`applyGlass` / `useGlass`)** — the default for normal page content:
  cards, buttons, switches, sliders, toggles. Cross-browser, keeps content
  interactive, cheap for a handful of surfaces.
- **WebGL (`WebGLGlass` / `useGlassTexture`)** — for surfaces an SVG filter
  can't read (canvas, video) or many lenses over an animated/procedural backdrop.
  Requires WebGL2.

## Project layout

```
src/
  core/liquid-glass.ts        SVG `feDisplacementMap` engine (the core)
  core/liquid-glass.css       structural styles for the glass layers
  core/liquid-glass-webgl.ts  WebGL2 backend for texture sources (image/canvas/video)
  core/types.ts               shared lens types
  react/useGlass.ts           React binding over the SVG engine
  react/useGlassTexture.ts    React binding over WebGLGlass (canvas/video)
  index.ts                    public entry
examples/demo/                Vite showcase app (styled component references)
.github/workflows/            CI (lint/typecheck/test/build) + npm release
```
