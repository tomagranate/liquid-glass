# @tomagranate/liquid-glass

An Apple-style **liquid-glass** (refraction) effect for the web. The whole effect
rests on a single SVG filter primitive, **`feDisplacementMap`** — nothing is
sampled from underneath the glass, the content's own pixels are the ones moving —
so it's a plain `filter: url(#glass)` that works in **every** browser (Chromium,
Firefox, Safari), no flags. Framework-independent, with optional React bindings
and a WebGL texture backend for `<canvas>`/`<video>`.

<!-- Demo media — drop a recording/screenshot in assets/ and reference it here.
     See assets/README.md for what to capture. -->
![Liquid glass demo](assets/hero.gif)

```sh
npm install @tomagranate/liquid-glass
```

Peer deps: `react` and `react-dom` (>=18), only for the React bindings. The
vanilla SVG backend has no dependencies and works on any DOM.

## Quick start

### Vanilla (any framework, or none)

```ts
import { applyGlass } from "@tomagranate/liquid-glass";
import "@tomagranate/liquid-glass/styles.css";

const handle = applyGlass(document.querySelector("#card"), {
  radius: 18,
  chroma: 0.4,
});

handle.update({ chroma: 0.6 }); // patch + re-render
handle.destroy();               // tear down
```

`applyGlass` builds the layer structure inside the element and refracts a copy of
the page backdrop. The real element underneath stays selectable and clickable.

### React

Two bindings, one per source kind:

- **`useGlass`** drives the SVG engine — for DOM surfaces (buttons, cards,
  switches, sliders, toggles).
- **`useGlassTexture`** drives the WebGL backend — for a `<canvas>` or `<video>`.

```tsx
import { useGlass } from "@tomagranate/liquid-glass";
import "@tomagranate/liquid-glass/styles.css";

function GlassCard({ children }) {
  const g = useGlass({ radius: 24, depth: 14, chroma: 0.4 });
  return (
    <div ref={g.hostRef} className="lq">
      <div ref={g.refractionRef} className="lq-refraction">
        <div ref={g.backdropRef} className="lq-backdrop" />
      </div>
      <div ref={g.sheenRef} className="lq-sheen" />
      <div className="lq-content">{children}</div>
    </div>
  );
}
```

The component renders the layers; the hook owns the controller lifecycle (so
React stays in charge of the DOM). For a `<canvas>`/`<video>` surface use
`useGlassTexture({ getSource, width, height, lenses, live })` instead.

See [`examples/demo/src/glass`](examples/demo/src/glass) for styled Button,
Switch, Slider, Toggle Group, QR Code and Video Player built this way — copy and
restyle them; the package itself ships the engine and the React bindings, not
pre-styled widgets.

## Options

`applyGlass` (and `useGlass`) accept:

| Option | Default | What it does |
| --- | --- | --- |
| `radius` | `16` | Corner radius, px (or a `"NN%"` string). |
| `depth` | `14` | Refracting rim thickness, px. |
| `scale` | `90` | Displacement strength, px. |
| `blur` | `0.6` | Frost, px. |
| `chroma` | `0.4` | Chromatic aberration, 0..1. |
| `rimLight` | `0.6` | CSS bevel highlight, 0..1. |
| `specular` | `0` | SVG-filter specular, 0..1. |
| `tint` | `rgba(255,255,255,0.06)` | Glass tint. |
| `shadow` | `0 8px 30px rgba(0,0,0,0.25)` | Drop shadow. |
| `backdrop` | `null` | Explicit CSS background to refract (else `--lq-backdrop`, else body bg). |
| `alignTo` | `null` | Element/ref/fn → refraction-target mode for moving lenses. |

Also exported for custom pipelines: `createGlassController`,
`generateDisplacementMap`, `buildGlassFilter`, `moveFilterLens` (SVG), and
`WebGLGlass` (the texture backend).

## How it works

The effect is a copy of the page backdrop, painted on its own layer and bent by a
rounded-rectangle displacement map. The full write-up — the displacement map, the
two backends, alignment, and the performance trade-offs — is in
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

[MIT](LICENSE)
