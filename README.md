# @tomagranate/liquid-glass

A liquid-glass (Apple-style refraction) effect for the web — React components
backed by a WebGL renderer, plus a framework-independent SVG-filter engine. A
clean-room recreation of [Aave's liquid-glass effect](https://aave.com/design/building-glass-for-the-web).

```sh
npm install @tomagranate/liquid-glass
```

Peer deps: `react` and `react-dom` (>=18). Requires WebGL2 for the React
components; the vanilla SVG backend works everywhere.

## Quick start

Wrap your app in `<GlassStage>`, import the stylesheet once, and drop in the
components. The stage renders an animated background and every control refracts
it (and the page content) live.

```tsx
import {
  GlassStage,
  GlassButton,
  GlassSwitch,
  GlassSlider,
  GlassToggleGroup,
  Magnifier,
} from "@tomagranate/liquid-glass";
import "@tomagranate/liquid-glass/styles.css";

export function App() {
  const [view, setView] = useState("week");
  return (
    <GlassStage>
      <GlassButton onClick={...}>Get started</GlassButton>
      <GlassSwitch checked={on} onChange={setOn} />
      <GlassSlider value={n} onChange={setN} min={0} max={100} />
      <GlassToggleGroup
        value={view}
        onChange={setView}
        options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }]}
      />
      <Magnifier />
    </GlassStage>
  );
}
```

Turn any element into a lens with the `useGlassLens` hook:

```tsx
import { useGlassLens } from "@tomagranate/liquid-glass";

function GlassCard({ children }) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useGlassLens(ref, { radius: 24, depth: 14, chroma: 0.4 });
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <canvas ref={canvasRef} className="glass-lens-canvas" />
      <div className="glass-fg">{children}</div>
    </div>
  );
}
```

No React? The framework-independent SVG backend works on any DOM:

```ts
import { applyGlass } from "@tomagranate/liquid-glass";
const handle = applyGlass(element, { radius: 16, chroma: 0.4 });
handle.update({ chroma: 0.6 });
handle.destroy();
```

## Develop

```sh
npm install
npm run dev        # the showcase demo → http://localhost:5180
npm run build      # build the package to dist/
npm test           # vitest
npm run lint       # biome
npm run typecheck  # tsc --noEmit
```

## Two backends

- **WebGL field** (`GlassStage` + components) — one procedurally animated
  background plus every control as a lens; lenses refract the live background,
  a DOM snapshot, and each other. Cross-browser (WebGL2), scales flat in the
  number of lenses.
- **SVG filter** (`applyGlass`) — framework-independent, refracts a copy of a
  known surface or backdrop; keeps the page selectable/clickable. Works in
  Chromium, Firefox and Safari with no flags.

## Which backend, and "does it react to live content?"

The thing that decides everything is **where the source pixels come from** — not
the renderer. There's no cheap, cross-browser way to refract *arbitrary live
DOM* beneath an element (`backdrop-filter: url()` would do it but is
Chromium-only; everything else needs a copy or a snapshot). So:

| What's beneath the glass | Backend | Reacts to updates? |
| --- | --- | --- |
| A procedural/animated scene (this demo's gradient) | **WebGL field** — evaluate it in the shader | **Yes, every frame, free** |
| A known surface (track, card, hero image) | SVG filter + a data-driven copy (`refractionTarget`) | Yes — the copy re-renders with state |
| A texture (image / `<canvas>` / `<video>`) | `WebGLGlass` | Yes (re-upload per frame for video) |
| Arbitrary, unknown live DOM | snapshot → WebGL/SVG, or `backdrop-filter` (Chromium only) | Only on re-snapshot / automatic in Chromium |

The demo answers the "constantly changing background" case directly: the
background is `bg(uv, t)` in GLSL, every component is a lens sampling that same
function, so they all refract the live, animated gradient with zero per-frame
CPU work. See **Performance & scalability** below for why WebGL is the right call
once you have many lenses.

## The key idea (and why it works in Firefox)

Most web "liquid glass" demos use `backdrop-filter: url(#filter)`. That only
works in Chromium — Firefox supports `backdrop-filter` but **not** SVG-filter
references inside it. Aave's effect (and this one) sidesteps that entirely.
Quoting their write-up:

> "feDisplacementMap takes two inputs, the painted content and a map we
> generate … **Nothing is sampled from underneath the glass. The content's own
> pixels are the ones moving.**"

So the refraction is a plain **`filter: url(#glass)`** — supported in every
browser — applied to a **copy of what sits behind the glass**, painted on its
own layer and bent by a displacement map. The real page underneath is never
touched, so it stays selectable and clickable.

### Layers

```
.lq                 the glass element (overflow:hidden, rounded, isolates)
 ├─ .lq-refraction  has `filter: url(#glass)`; bends its child
 │   └─ .lq-backdrop a copy of the backdrop, offset to line up with the real
 │                   thing behind the glass, pixel for pixel
 ├─ .lq-sheen       CSS tint + rim light + hairline border + drop shadow
 └─ .lq-content     your real, interactive content, on top
```

### Two ways to feed the glass

- **Backdrop-clone** (default): the copy *is* the page background, read from the
  `--lq-backdrop` CSS variable (or the body background) and kept aligned to the
  viewport. Use for standalone surfaces — cards, buttons.
- **Refraction target** (`alignTo` + `refraction`): the caller supplies a copy
  of the specific content beneath the lens — a slider's fill, a switch's track,
  a highlighted pill — and the core keeps that copy glued over the real element
  as the lens moves. This is Aave's `refractionTarget`, used for moving lenses.

### Displacement map

A small PNG drawn on a `<canvas>`. R/G encode how far each pixel bends in x/y
(128 = no shift); B carries an optional specular value. The lens is a
rounded-rectangle **signed-distance field**: bending is concentrated in a rim of
thickness `depth` and fades to zero toward the centre — a clear middle with a
refractive bevel, like real curved glass. Bend direction follows the SDF
gradient, so straight edges bend cleanly inward and corners bend radially.

The map is regenerated only when the glass changes **shape**. When it merely
**moves** (a slider thumb, a toggle indicator) only the backdrop copy's offset
shifts — cheap, so motion stays at frame rate. Each regeneration uses a fresh
filter id to defeat Safari's filter-output cache.

A few more passes finish the look: optional **chromatic aberration** (the
displacement run three times at slightly different scales, recombined per
channel, for a red/blue rim fringe), an optional filter **specular**, and a CSS
**rim light** for the bevel highlight.

## API

### Core — `src/core/liquid-glass.js`

```js
import { applyGlass } from "./src/core/liquid-glass.js";

const handle = applyGlass(element, {
  radius: 16,        // corner radius, px (or "50%")
  depth: 14,         // refracting rim thickness, px
  scale: 90,         // displacement strength, px
  blur: 0.6,         // frost, px
  chroma: 0.4,       // chromatic aberration, 0..1
  rimLight: 0.6,     // CSS bevel highlight, 0..1
  tint: "rgba(255,255,255,0.06)",
  shadow: "0 8px 30px rgba(0,0,0,0.25)",
  backdrop: null,    // explicit CSS background, else --lq-backdrop / body bg
  alignTo: null,     // element/ref/fn → switches to refraction-target mode
});

handle.update({ chroma: 0.6 }); // patch + re-render
handle.destroy();
```

`applyGlass` builds the layers for you (vanilla). For framework integration use
`createGlassController(host, { refraction, backdrop, sheen }, options)` with your
own markup. Also exported: `generateDisplacementMap` and `buildGlassFilter`.

### React — WebGL field (the live, animated default)

Wrap the app in `<GlassStage>`. It renders the animated gradient background on a
shared WebGL canvas, then runs a **layered compositor** (`glass-compositor.js`):

1. the gradient is drawn into a "scene" texture;
2. a **snapshot of the page DOM** (text, tracks, components — see below) is
   composited on top of it, so lenses refract the real content too;
3. lenses are drawn **bottom-to-top in z-order**; each one samples the
   scene-so-far at displaced coordinates (so it refracts the gradient, the DOM,
   *and* any lens already beneath it), then is composited back into the scene;
4. each lens's disc is blitted into that element's own cheap **2D `<canvas>`
   child**.

Four properties fall out of this:

- **Glass moves with the DOM.** Each lens canvas lives in its element's subtree
  (`position: absolute`, not a fixed overlay), so it rides the page compositor —
  staying glued on scroll, **overscroll** and transforms with no rect-chasing.
- **Overlap works.** Overlapping lenses stack by DOM z-order; the bottom one is
  fully rendered where it isn't covered.
- **Glass refracts glass.** Because lenses are composited in order, an upper lens
  genuinely bends the lower one (drag the magnifier over a button). Order is a
  `z` lens param (default 0; the magnifier uses a high value).
- **Glass refracts real content.** The DOM snapshot in the scene means a lens
  bends the text, slider/switch tracks and other components beneath it — not just
  the gradient.

2D canvases aren't context-limited, so this uses just two WebGL contexts no
matter how many lenses there are. (The fully-instanced single-pass path still
exists in `glass-field.js` / `WebGLGlass` and is what the benchmark exercises.)

#### The DOM snapshot (and its honest cost)

WebGL can't read the page's pixels directly, so to refract live DOM we rasterise
the content with [`html-to-image`](https://github.com/bubkoo/html-to-image) into
a texture and composite it into the scene. It's **refreshed on mount, resize and
content mutation** (debounced) and offset by scroll — it is *not* re-rasterised
every frame. So: the gradient is perfectly live; the DOM refraction is as current
as the last snapshot (a slider's fill refracts a beat behind while you drag, then
catches up). Rasterisation inherits html-to-image's limits (same-origin images,
most but not all CSS, fonts must be loaded). This is the unavoidable price of
refracting arbitrary live DOM on the web — the alternative, `backdrop-filter:
url()`, is truly live but Chromium-only.

Components register themselves — hosts are transparent, the glass is on the lens
canvas, and labels marked `.glass-fg` ride above it.

```tsx
import {
  GlassStage,
  GlassButton, GlassToggleGroup, GlassSwitch, GlassSlider, Magnifier,
  useGlassLens,   // turn any element into a lens
} from "@tomagranate/liquid-glass";

<GlassStage>
  <GlassButton glass={{ chroma: 0.5 }}>Get started</GlassButton>
  <GlassToggleGroup value={v} onChange={setV} options={[{value:"a",label:"A"}]} />
  <GlassSwitch checked={on} onChange={setOn} />
  <GlassSlider value={n} onChange={setN} min={0} max={100} />
  <Magnifier />            {/* a circle of glass that follows the cursor */}
</GlassStage>

// any element → a lens. The hook returns a ref for the element's own lens
// canvas (a child, so it moves with the element on the compositor).
function MyGlass() {
  const ref = useRef(null);
  const canvasRef = useGlassLens(ref, { radius: 28, depth: 16, scale: 70, chroma: 0.4 });
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <canvas ref={canvasRef} className="glass-lens-canvas" />
      <span className="glass-fg">label</span>
    </div>
  );
}
```

Every lens samples the same animated background, so a constantly-changing
gradient (or any procedural scene you put in `glass-field.ts`'s `bg()`) shows up
refracting through all of them, live.

### Vanilla SVG backend (`applyGlass`)

For non-React (or any DOM you want kept on the page compositor, selectable and
clickable), `applyGlass(element, options)` wires the cross-browser SVG-filter
effect and returns a controller with `update(patch)` / `refresh()` / `destroy()`.
Also exported: `createGlassController`, `generateDisplacementMap`,
`buildGlassFilter`.

## The magnifying-glass tool

`<Magnifier>` is a circle of glass that follows the cursor when activated. In the
WebGL field it's simply one more lens — it refracts the live animated background
as you drag it. It does **not** magnify; it only bends the pixels, like real
glass. Press Esc to dismiss.

(To refract arbitrary *DOM* under the lens — text, cards — you'd render that DOM
into the field's source, e.g. via a snapshot; the field itself only knows the
procedural background. See the table at the top.)

## Performance & scalability: SVG filter vs WebGL

Short answer: **there is no single "most performant" backend — it depends on what
you're refracting.** Use the SVG filter for live DOM, and WebGL for textures.

### Why

`feDisplacementMap` is cheap; the *source pixels* are the cost.

- **Live DOM** (text, cards, the switch/slider/toggle lenses): the SVG filter is
  the right tool and the one Aave ships. It composites on the page's own
  compositor, so content stays selectable, scrollable and clickable. You can't
  feed live DOM to WebGL without rasterising it to a texture first, and that
  snapshot is the expensive part — so WebGL doesn't help here, it just adds a
  snapshot and loses interactivity. For a normal UI (a handful of glass
  controls) the SVG filter is plenty fast.
- **Textures** (images, `<canvas>`, `<video>`, or a pre-rendered scene): WebGL
  wins decisively. One renderer, one texture, every lens is one instance of a
  single draw call, and the displacement is computed analytically in the shader
  (no per-frame PNG, resize is free). This is exactly what Aave uses for their
  QR-code and video-player surfaces.

The cost scales with **lens count × lens area** for the SVG path (each lens is a
separate filter region / compositor pass), but stays flat for WebGL.

### Benchmark

`examples/demo/src/Benchmark.jsx` animates N identical lenses over the same image
with both backends and measures frame time. Open it from the **⚡ Benchmark**
button in the demo (`npm run dev`).
Apple M4 Max, Metal, 120 Hz display, 150 px lenses:

| lenses | SVG fps | WebGL fps | SVG p95 (ms) | WebGL p95 (ms) |
| -----: | ------: | --------: | -----------: | -------------: |
|     10 |      61 |   **120** |           17 |        **9.0** |
|     30 |      28 |   **120** |           34 |        **9.0** |
|     60 |      15 |   **120** |           75 |        **9.0** |
|    100 |       9 |   **120** |          150 |        **9.2** |

WebGL pins the refresh-rate cap regardless of count; the SVG path degrades
roughly linearly once several large lenses animate at once.

### Recommendation

- The React components (`GlassStage`) use the WebGL field — best for many lenses
  and an animated/procedural backdrop.
- For a single glass surface over plain DOM that must stay selectable/clickable
  and cross-browser with zero WebGL, use the vanilla `applyGlass` SVG backend.
- For media you already have as a texture (image/`<canvas>`/`<video>`), drive
  `WebGLGlass` directly.

## Project layout

```
src/
  core/glass-compositor.ts    WebGL2 layered compositor (glass refracts glass + DOM)
  core/glass-field.ts         WebGL2 field: animated gradient + instanced lenses
  core/liquid-glass-webgl.ts  WebGL2 backend for texture sources (image/canvas/video)
  core/liquid-glass.ts        framework-independent SVG-filter engine
  core/types.ts               shared lens types
  react/                      GlassStage + useGlassLens + components + Magnifier
  index.ts                    public entry
examples/demo/                Vite showcase app + Benchmark (SVG vs WebGL)
.github/workflows/            CI (lint/typecheck/test/build) + npm release
```
