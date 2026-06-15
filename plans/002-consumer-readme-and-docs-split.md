# Plan 002: Refocus the README on install + usage; move deep docs to ARCHITECTURE.md; wire in demo media

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat ae5ad18..HEAD -- README.md src/index.ts`
> If `src/index.ts` differs from Plan 001's expected post-state (engine + React
> kit only, no widgets), STOP — this plan assumes Plan 001 has landed.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-unship-pre-styled-widgets.md
- **Category**: docs
- **Planned at**: commit `ae5ad18`, 2026-06-15

## Why this matters

The current `README.md` is 364 lines — it reads as an architecture essay and a
marketing piece (two-backend deep dive, the "key idea / why it works in
Firefox", layer diagrams, displacement-map internals, a benchmark table, the
Aave comparison). A consumer landing on npm wants three things fast: what it is,
how to install it, how to use it. The deep material is valuable but belongs in
its own doc. This plan splits the README into a tight consumer-facing entry and
an `ARCHITECTURE.md` that absorbs the internals, **reflects the new package
surface from Plan 001** (engine + React kit; widgets are examples), repositions
`applyGlass` (SVG) as the recommended default per the maintainer's intent, and
wires in screenshots/GIFs of the effect working.

Maintainer intent to encode in the framing: for most sites and apps the
**SVG `applyGlass` path is the better default** — cross-browser, keeps content
interactive, cheap for a handful of controls. The WebGL React kit is the right
tool for many lenses over an animated/procedural backdrop (and glass refracting
glass). Lead with `applyGlass`; present the kit as the richer, specialized
option.

## Current state

- `README.md` (364 lines) — single long doc. Key sections currently present
  (find them by their headings):
  - intro + `npm install` + "Quick start" (imports the now-removed widgets —
    **stale after Plan 001**)
  - a `useGlassLens` example and an `applyGlass` example
  - "Develop" (npm scripts)
  - "Two backends"
  - "Which backend, and \"does it react to live content?\"" (the table)
  - "The key idea (and why it works in Firefox)" + "Layers" + "Two ways to feed
    the glass" + "Displacement map"
  - "API" (core `applyGlass` options; React WebGL field; the DOM snapshot note;
    vanilla SVG backend)
  - "The magnifying-glass tool"
  - "Performance & scalability: SVG filter vs WebGL" + "Benchmark" + table +
    "Recommendation"
  - "Project layout"
- After Plan 001 the published surface is: `applyGlass`, `createGlassController`,
  `generateDisplacementMap`, `buildGlassFilter`, `GlassFieldGL`,
  `GlassCompositor`, `WebGLGlass`, `GlassStage`, `useGlassStage`, `useGlassLens`,
  plus types. The pre-styled widgets live in `examples/demo/src/glass/`.
- `applyGlass` defaults (verified in `src/core/liquid-glass.ts:380-394`):
  `radius:16, depth:14, scale:90, blur:0.6, chroma:0.4, rimLight:0.6,
  tint:"rgba(255,255,255,0.06)", shadow:"0 8px 30px rgba(0,0,0,0.25)",
  backdrop:null, alignTo:null` (also `specular:0, specularAngle:135, dpr:2`).
- There is no `assets/` directory and no committed screenshots/GIFs anywhere.
- The demo runs with `npm run dev` → http://localhost:5180.

Convention: prose is wrapped ~80 cols (matches biome `lineWidth: 80` and the
existing README). Keep that.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `npm run lint` | exit 0 (biome lints `*.json`, `src`, `examples`; not `*.md`) |
| Run demo (manual) | `npm run dev` | serves http://localhost:5180 |
| Link check (manual) | open `README.md` rendered | no broken internal links |

Note: biome does not format Markdown here, so there is no automated README
gate. The verification below is grep/file-existence based plus a manual render.

## Suggested executor toolkit

- The `run` skill (if available) can launch the demo for capturing **static
  screenshots**. **Animated GIFs require manual screen recording** and cannot be
  produced by the executor — see Step 4, which is explicitly a human follow-up.

## Scope

**In scope**:
- `README.md` (rewrite — shorter, consumer-focused)
- `ARCHITECTURE.md` (create — absorbs the deep sections)
- `assets/README.md` (create — capture checklist for the media)
- `plans/README.md` (status update)

**Out of scope** (do NOT touch):
- Any file under `src/`, `examples/`, or config (`package.json`, `tsup.config.ts`,
  etc.). This is a docs-only plan.
- Do NOT generate, download, or fabricate image/GIF binaries. Image *references*
  go in the docs; the actual media is captured manually (Step 4).

## Git workflow

- Branch: `advisor/002-readme-docs-split`
- Commit messages match repo conventional commits, e.g.
  `docs: refocus README on install + usage; add ARCHITECTURE.md`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create ARCHITECTURE.md by moving the deep sections out of the README

Create `ARCHITECTURE.md`. Move (cut from the README, paste here — preserve the
existing prose; do not rewrite from scratch) these sections, in this order:

1. A one-line intro: `# Architecture` + a sentence that this documents how the
   effect works and how to choose a backend; link back with
   `See the [README](README.md) for install and usage.`
2. "The key idea (and why it works in Firefox)" (incl. the Aave quote)
3. "Layers"
4. "Two ways to feed the glass"
5. "Displacement map"
6. "Two backends"
7. "Which backend, and \"does it react to live content?\"" (the table)
8. The React WebGL-field / DOM-snapshot explanation currently under "API"
   (the "#### The DOM snapshot (and its honest cost)" material)
9. "The magnifying-glass tool"
10. "Performance & scalability: SVG filter vs WebGL" + "Benchmark" (table) +
    "Recommendation"
11. "Project layout"

Update any code references in moved text that named the removed widgets so they
point at `examples/demo/src/glass/` instead of the package.

**Verify**: `test -f ARCHITECTURE.md && grep -c "Benchmark" ARCHITECTURE.md` →
file exists, ≥ 1.

### Step 2: Replace README.md with the consumer-focused version

Overwrite `README.md` with the following. The `applyGlass` options table uses
the verified defaults from `src/core/liquid-glass.ts`; do not change the numbers.

````markdown
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
````

**Verify**:
- `wc -l README.md` → fewer than 150 lines.
- `grep -c "GlassButton" README.md` → `0` (no removed-widget package imports).
- `grep -c "assets/hero.gif" README.md` → `1`.
- `grep -c "ARCHITECTURE.md" README.md` → ≥ `1`.

### Step 3: Add the assets capture checklist

Create `assets/README.md` describing exactly what media the README references
and how to capture it (so a human can produce it consistently):

```markdown
# Demo media

Referenced by the top-level README. Capture from the live demo
(`npm run dev` → http://localhost:5180).

- `hero.gif` — the showcase stage with the animated gradient and the magnifier
  being dragged across the controls. ~6–10s loop, ≤ 1280px wide, optimized.
- `components.png` — a clean still of the button / toggle / switch / slider row.

Capture tips: record at 2× / retina, then downscale; keep GIFs under ~3 MB
(or use an MP4/WebM and reference it instead). Commit the files into this
`assets/` directory with the exact names above.
```

**Verify**: `test -f assets/README.md` → exists.

### Step 4: Capture the media — MANUAL (human follow-up)

This step cannot be done by the executor model. Flag it clearly in the PR
description and `plans/README.md`:

> README references `assets/hero.gif` and `assets/components.png`, which do not
> yet exist. Capture them per `assets/README.md` (run `npm run dev`, record the
> stage + magnifier, screenshot the controls row) and commit them. Until then
> the README shows two broken image links.

Do **not** fabricate, download, or substitute placeholder images. Leaving the
references in place with the checklist is the intended end state for the
executor.

### Step 5: Final verification

```
npm run lint
```

(Docs-only change; lint must still pass since biome includes `examples/**` and
JSON — confirm nothing under `src/`/`examples/` was touched.) Then re-run the
greps from Step 2's Verify block.

## Test plan

No code tests. Verification is documentation-shaped:
- README is < 150 lines, contains the install command, both quick-start paths,
  the options table, and a link to `ARCHITECTURE.md`.
- `ARCHITECTURE.md` exists and contains the moved deep sections (benchmark
  table, two-backends, displacement map, key-idea/Firefox, project layout).
- No package import of a removed widget remains in the README.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `test -f ARCHITECTURE.md` and `grep -c "Benchmark" ARCHITECTURE.md` ≥ 1
- [ ] `wc -l README.md` < 150
- [ ] `grep -c "GlassButton" README.md` → `0`
- [ ] `grep -c "assets/hero.gif" README.md` → `1`
- [ ] `grep -c "ARCHITECTURE.md" README.md` ≥ 1
- [ ] `test -f assets/README.md`
- [ ] `git status` shows only `README.md`, `ARCHITECTURE.md`, `assets/README.md`,
      `plans/README.md` changed/created — nothing under `src/` or `examples/`
- [ ] `npm run lint` exits 0
- [ ] `plans/README.md` status row for 002 updated (and notes the manual media
      follow-up from Step 4)

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `src/index.ts` does not match Plan 001's post-state
  (this plan assumes 001 landed; the README quick-start must match the real
  exported surface).
- A section named in Step 1 cannot be found in the current README (the README
  has drifted from the "Current state" inventory) — report which sections are
  missing rather than guessing the new structure.
- You are tempted to create binary image files to satisfy the image links —
  STOP; that is Step 4's manual work, not yours.

## Maintenance notes

- Keep the `applyGlass` options table in sync with `DEFAULTS` in
  `src/core/liquid-glass.ts` (`:380`). If a default changes, update both.
- When the React kit gains/loses exports, update the "Quick start" and the
  "Also exported" line; deep API detail stays in `ARCHITECTURE.md`.
- A reviewer should check the README renders with working internal links
  (`ARCHITECTURE.md`, `examples/demo/src/glass`) and that the two image paths
  match whatever the human committed in Step 4.
- Consider referencing an MP4/WebM instead of a GIF if `hero.gif` exceeds a few
  MB — GitHub renders committed videos inline in Markdown via `<video>` or a
  direct link.
