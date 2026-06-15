# @tomagranate/liquid-glass

A liquid-glass (Apple-style refraction) effect for the web — a
framework-independent SVG-filter engine, plus an optional React kit and
low-level WebGL renderers. A clean-room recreation of
[Aave's liquid-glass effect](https://aave.com/design/building-glass-for-the-web).

![Liquid glass demo](assets/hero.gif)

```sh
npm install @tomagranate/liquid-glass
```

Requires no build flags. The SVG backend works in Chromium, Firefox and Safari;
the React kit and WebGL renderers require WebGL2.

## Quick start

### Vanilla (any framework) — recommended for most sites

`applyGlass` turns any element into glass with an SVG displacement filter. It is
cross-browser, keeps the page selectable and clickable, and needs no WebGL — the
right default for a handful of glass surfaces over normal page content.

```ts
import { applyGlass } from "@tomagranate/liquid-glass";
import "@tomagranate/liquid-glass/styles.css";

const handle = applyGlass(document.querySelector(".card"), {
  radius: 16,    // corner radius, px
  depth: 14,     // refracting rim thickness, px
  scale: 90,     // displacement strength, px
  chroma: 0.4,   // chromatic aberration, 0..1
  rimLight: 0.6, // bevel highlight, 0..1
});

handle.update({ chroma: 0.6 }); // patch + re-render
handle.destroy();               // tear down
```

### React kit — many lenses over an animated scene

For an animated/procedural backdrop with many lenses (and glass that refracts
glass), wrap your app in `<GlassStage>` and turn any element into a lens with
`useGlassLens`:

```tsx
import { GlassStage, useGlassLens } from "@tomagranate/liquid-glass";
import "@tomagranate/liquid-glass/styles.css";
import { useRef } from "react";

function GlassCard({ children }) {
  const ref = useRef(null);
  const canvasRef = useGlassLens(ref, { radius: 24, depth: 14, chroma: 0.4 });
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <canvas ref={canvasRef} className="glass-lens-canvas" aria-hidden />
      <div className="glass-fg">{children}</div>
    </div>
  );
}

export function App() {
  return (
    <GlassStage>
      <GlassCard>Hello</GlassCard>
    </GlassStage>
  );
}
```

### Pre-built components

This package ships the **engine**, not opinionated UI. Ready-to-copy glass
components — button, switch, slider, toggle group and a draggable magnifier —
live in [`examples/demo/src/glass`](examples/demo/src/glass). Copy what you need
and restyle it.

![Glass components](assets/components.png)

## `applyGlass` options

| Option | Default | What it does |
| --- | --- | --- |
| `radius` | `16` | Corner radius, px (or `"50%"`). |
| `depth` | `14` | Refracting rim thickness, px. |
| `scale` | `90` | Displacement strength, px. |
| `blur` | `0.6` | Frost, px. |
| `chroma` | `0.4` | Chromatic aberration, 0..1. |
| `rimLight` | `0.6` | CSS bevel highlight, 0..1. |
| `tint` | `rgba(255,255,255,0.06)` | Glass tint. |
| `shadow` | `0 8px 30px rgba(0,0,0,0.25)` | Drop shadow. |
| `backdrop` | `null` | Explicit CSS background to refract (else `--lq-backdrop`, else body bg). |
| `alignTo` | `null` | Element/ref/fn → refraction-target mode for moving lenses. |

`applyGlass` returns a handle: `handle.update(patch)` re-renders with new
options; `handle.destroy()` removes the effect.

Also exported for custom pipelines: `createGlassController`,
`generateDisplacementMap`, `buildGlassFilter` (SVG), and the WebGL renderers
`GlassFieldGL`, `GlassCompositor`, `WebGLGlass`.

## How it works

Displacement maps, the two backends, the "does it react to live content?"
question, and SVG-vs-WebGL benchmarks are documented in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Develop

```sh
npm install
npm run dev        # the showcase demo → http://localhost:5180
npm run build      # build the package to dist/
npm test           # vitest
npm run lint       # biome
npm run typecheck  # tsc --noEmit
```

## License

MIT
