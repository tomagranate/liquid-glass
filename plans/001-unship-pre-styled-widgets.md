# Plan 001: Ship only the engine + React kit; move pre-styled widgets to examples

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat ae5ad18..HEAD -- src/index.ts src/index.test.ts src/react examples/demo/src/App.jsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt / api-surface
- **Planned at**: commit `ae5ad18`, 2026-06-15

## Why this matters

The package currently ships five opinionated, pre-styled React widgets
(`GlassButton`, `GlassSwitch`, `GlassSlider`, `GlassToggleGroup`, `Magnifier`).
A glass *effect* library should ship the engine and the integration primitives,
not a styled component kit consumers must override. Shipping the widgets also
bloats the published CSS (`dist/index.css`) with `.glassx-*` styles every
consumer pays for. After this change the package exposes the framework-agnostic
SVG engine, the low-level WebGL renderers, and a small React kit (`GlassStage`
+ `useGlassLens`/`useGlassStage`) for building your own glass. The widgets
survive as copy-paste **reference implementations** in the demo.

The package boundary for this change was decided by the maintainer:
**keep the React kit (`GlassStage`, `useGlassStage`, `useGlassLens`); move only
the pre-styled widgets.** Do not move `GlassStage` or the hooks.

## Current state

Files and their roles:

- `src/index.ts` — public entry; exports widgets (lines 20–32), the React kit
  (lines 17–19), the WebGL renderers and the SVG engine.
- `src/index.test.ts` — asserts the public API shape; currently asserts the
  widgets are exported (lines 6–14, 21–28).
- `src/react/GlassButton.tsx`, `GlassSwitch.tsx`, `GlassSlider.tsx`,
  `GlassToggleGroup.tsx`, `Magnifier.tsx` — the five widgets to move.
- `src/react/components.css` — widget-only styles (`.glassx`, `.glassx-button`,
  `.glassx-toggle*`, `.glassx-switch*`, `.glassx-slider*`, `.magnifier-*`).
  Imported **only** by the five widgets. Moves with them.
- `src/react/GlassStage.tsx` (+ `stage.css`), `src/react/useGlassLens.ts` —
  the React kit. **Stays in the package. Do not move.**
- `src/react/stage.css` — kit styles, including the shared classes consumers
  use (`.glass-fg`, `.glass-lens-canvas`, `.glass-stage`, `.stage-bg`).
  **Stays.** This is why the widgets can move without breaking kit consumers.
- `examples/demo/src/App.jsx` — imports the widgets and the kit from the
  package name (lines 2–10). The demo resolves `@tomagranate/liquid-glass` to
  `src/index.ts` via a Vite alias (`examples/demo/vite.config.js`).
- `examples/demo/src/Benchmark.jsx` — imports `createGlassController` and
  `WebGLGlass` only (core; unaffected).

Verified: the only references to the five widget names anywhere in `src/` and
`examples/` are `src/index.ts`, `src/index.test.ts`, the widget files
themselves, and `examples/demo/src/App.jsx`. Nothing else imports them.

How the widgets import their dependencies today (all become package imports):

- `GlassButton.tsx` / `GlassSwitch.tsx` / `GlassSlider.tsx`:
  ```ts
  import type { LensMaterial } from "../core/types.js";
  import { useGlassLens } from "./useGlassLens.js";
  import "./components.css";
  ```
- `GlassToggleGroup.tsx`: same three imports (LensMaterial, useGlassLens,
  components.css).
- `Magnifier.tsx`:
  ```ts
  import { useGlassLens } from "./useGlassLens.js";
  import "./components.css";
  ```
  (no `LensMaterial` import)

Both `LensMaterial` and `useGlassLens` are re-exported from `src/index.ts`
(lines 19 and 58), so after the move the widgets import them from the package.

Repo conventions to match:
- The **package source** (`src/**`) uses explicit `.js` extensions even for
  `.ts`/`.tsx` files (e.g. `import { useGlassLens } from "./useGlassLens.js"`).
  tsup/esbuild bundles those, so keep that style for anything that stays in
  `src/`.
- The **demo's own relative imports** use the **real file extension**
  (`examples/demo/src/App.jsx` imports `"./Benchmark.jsx"`, `main.jsx` imports
  `"./App.jsx"`). The Vite *production* build (Rollup) does **not** map a
  relative `.js` import to a `.ts`/`.tsx` file — verified: `vite build` fails
  with `Could not resolve "./glass/index.js"`. So the new demo glass module and
  its consumers must reference real `.ts`/`.tsx` extensions, **not** `.js`.
- The moved widget files stay `.tsx` (Vite/esbuild compiles them). Two-space
  indent, biome-formatted.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Lint | `npm run lint` | exit 0 (biome) |
| Typecheck | `npm run typecheck` | exit 0 (tsc --noEmit) |
| Tests | `npm test` | exit 0, all pass |
| Build package | `npm run build` | exit 0, emits `dist/` |
| Build demo | `npm run build:demo` | exit 0 (vite build) |

## Scope

**In scope** (the only files you should modify, create, move or delete):
- `src/index.ts` (edit — remove widget exports)
- `src/index.test.ts` (edit — update API assertions)
- `src/react/GlassButton.tsx` → `examples/demo/src/glass/GlassButton.tsx` (move + edit imports)
- `src/react/GlassSwitch.tsx` → `examples/demo/src/glass/GlassSwitch.tsx` (move + edit imports)
- `src/react/GlassSlider.tsx` → `examples/demo/src/glass/GlassSlider.tsx` (move + edit imports)
- `src/react/GlassToggleGroup.tsx` → `examples/demo/src/glass/GlassToggleGroup.tsx` (move + edit imports)
- `src/react/Magnifier.tsx` → `examples/demo/src/glass/Magnifier.tsx` (move + edit imports)
- `src/react/components.css` → `examples/demo/src/glass/components.css` (move, unchanged content)
- `examples/demo/src/glass/index.ts` (create — barrel)
- `examples/demo/src/App.jsx` (edit — import widgets from `./glass`)
- `plans/README.md` (status update)

**Out of scope** (do NOT touch):
- `src/react/GlassStage.tsx`, `src/react/useGlassLens.ts`, `src/react/stage.css`
  — the React kit stays shipped.
- `src/core/**` — the engine is unchanged.
- `package.json` — peer deps (`react`, `react-dom`) stay; the kit still needs
  them. `tsup.config.ts` — no change needed; `dist/index.css` is rebuilt from
  whatever CSS the new `src/index.ts` graph imports.
- `examples/demo/src/Benchmark.jsx` — its imports are core-only.

## Git workflow

- Branch: `advisor/001-unship-widgets`
- Use `git mv` for the six moved files so history is preserved.
- Commit per logical step. Message style matches the repo's conventional
  commits (see `git log`: `chore:`, `feat:`). Example:
  `refactor: move pre-styled glass widgets to examples`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create the demo glass module and move the widget files into it

Create directory `examples/demo/src/glass/`. `git mv` the six files:

```
git mv src/react/GlassButton.tsx      examples/demo/src/glass/GlassButton.tsx
git mv src/react/GlassSwitch.tsx      examples/demo/src/glass/GlassSwitch.tsx
git mv src/react/GlassSlider.tsx      examples/demo/src/glass/GlassSlider.tsx
git mv src/react/GlassToggleGroup.tsx examples/demo/src/glass/GlassToggleGroup.tsx
git mv src/react/Magnifier.tsx        examples/demo/src/glass/Magnifier.tsx
git mv src/react/components.css        examples/demo/src/glass/components.css
```

**Verify**: `ls examples/demo/src/glass` → lists the 5 `.tsx` files +
`components.css`. `ls src/react` → no longer lists those files (should show
only `GlassStage.tsx`, `useGlassLens.ts`, `stage.css`, `components.css`-gone).

### Step 2: Repoint imports inside each moved widget to the package

In each moved `.tsx` file, the import of `LensMaterial` and `useGlassLens` must
come from the published package name instead of relative core/kit paths. Leave
`import "./components.css";` exactly as-is (the CSS is co-located).

- In `GlassButton.tsx`, `GlassSwitch.tsx`, `GlassSlider.tsx`,
  `GlassToggleGroup.tsx`, replace:
  ```ts
  import type { LensMaterial } from "../core/types.js";
  import { useGlassLens } from "./useGlassLens.js";
  ```
  with:
  ```ts
  import type { LensMaterial } from "@tomagranate/liquid-glass";
  import { useGlassLens } from "@tomagranate/liquid-glass";
  ```
- In `Magnifier.tsx`, replace:
  ```ts
  import { useGlassLens } from "./useGlassLens.js";
  ```
  with:
  ```ts
  import { useGlassLens } from "@tomagranate/liquid-glass";
  ```

Do not change any other line in these files.

**Verify**:
`grep -rn "\.\./core/types" examples/demo/src/glass` → no matches.
`grep -rn "\./useGlassLens" examples/demo/src/glass` → no matches.
`grep -rln "@tomagranate/liquid-glass" examples/demo/src/glass` → lists all 5 widget files.

### Step 3: Add a barrel for the demo widgets

Create `examples/demo/src/glass/index.ts`. Use **real `.tsx` extensions** (the
Vite production build does not map `.js` → `.tsx` for these demo files):

```ts
export { GlassButton } from "./GlassButton.tsx";
export { GlassSwitch } from "./GlassSwitch.tsx";
export { GlassSlider } from "./GlassSlider.tsx";
export { GlassToggleGroup } from "./GlassToggleGroup.tsx";
export { Magnifier } from "./Magnifier.tsx";
```

**Verify**: `cat examples/demo/src/glass/index.ts` shows the five re-exports.

### Step 4: Update the demo to import widgets from the local module

In `examples/demo/src/App.jsx`, the current import (lines 2–10) pulls everything
from the package:

```jsx
import {
  GlassStage,
  GlassButton,
  GlassToggleGroup,
  GlassSwitch,
  GlassSlider,
  Magnifier,
  useGlassLens,
} from "@tomagranate/liquid-glass";
```

Replace it with two imports — kit from the package, widgets from `./glass`.
Use the **real `.ts` extension** for the local barrel:

```jsx
import { GlassStage, useGlassLens } from "@tomagranate/liquid-glass";
import {
  GlassButton,
  GlassToggleGroup,
  GlassSwitch,
  GlassSlider,
  Magnifier,
} from "./glass/index.ts";
```

Leave the rest of `App.jsx` unchanged.

**Do NOT run `npm run build:demo` yet.** The demo resolves the package alias
`@tomagranate/liquid-glass` → `src/index.ts`, which still imports the now-moved
widget files (`./react/GlassButton.js`, …) until Step 5. The demo build cannot
pass until Step 5 removes those imports. The build:demo verification runs in the
final gate (Step 7), after Steps 5 and 6.

**Verify (cheap, no build)**:
`grep -n "./glass/index.ts" examples/demo/src/App.jsx` → one match;
`grep -n "@tomagranate/liquid-glass" examples/demo/src/App.jsx` → one match
(kit only: `GlassStage`, `useGlassLens`).

### Step 5: Remove the widget exports from the package entry

Replace the entire contents of `src/index.ts` with:

```ts
/**
 * @tomagranate/liquid-glass
 *
 * A liquid-glass (Apple-style refraction) effect for the web.
 *
 * - Vanilla SVG-filter backend ({@link applyGlass}): framework-independent,
 *   cross-browser, refracts a copy of the backdrop. The recommended default
 *   for most sites and apps.
 * - React kit: wrap your app in {@link GlassStage} and turn any element into a
 *   lens with {@link useGlassLens}. Import the stylesheet once:
 *   `import "@tomagranate/liquid-glass/styles.css"`.
 * - Low-level WebGL renderers ({@link GlassFieldGL}, {@link GlassCompositor},
 *   {@link WebGLGlass}) for custom pipelines and texture sources.
 *
 * Pre-styled components (button, switch, slider, toggle, magnifier) are not
 * shipped — see `examples/demo/src/glass` for reference implementations you can
 * copy and restyle.
 */

// ── React kit: WebGL stage + lens hook ──────────────────────────────────────
export { GlassStage, useGlassStage } from "./react/GlassStage.js";
export type { GlassStageApi } from "./react/GlassStage.js";
export { useGlassLens } from "./react/useGlassLens.js";

// ── Core: WebGL renderers ───────────────────────────────────────────────────
export { GlassFieldGL } from "./core/glass-field.js";
export type { GlassFieldOptions } from "./core/glass-field.js";
export { GlassCompositor } from "./core/glass-compositor.js";
export type { DomPlacement } from "./core/glass-compositor.js";
export { WebGLGlass } from "./core/liquid-glass-webgl.js";

// ── Core: vanilla SVG-filter backend ────────────────────────────────────────
export {
  applyGlass,
  createGlassController,
  generateDisplacementMap,
  buildGlassFilter,
} from "./core/liquid-glass.js";
export type {
  GlassOptions,
  GlassController,
  GlassLayers,
  AlignTo,
  DisplacementMapOptions,
  GlassFilterOptions,
} from "./core/liquid-glass.js";

// ── Shared types ────────────────────────────────────────────────────────────
export type { LensMaterial, LensRect, LensSpec } from "./core/types.js";
```

**Verify**: `grep -nE "GlassButton|GlassSwitch|GlassSlider|GlassToggleGroup|Magnifier" src/index.ts`
→ no matches.

### Step 6: Update the public-API test

Replace the entire contents of `src/index.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  applyGlass,
  buildGlassFilter,
  createGlassController,
  GlassCompositor,
  GlassFieldGL,
  GlassStage,
  generateDisplacementMap,
  useGlassLens,
  useGlassStage,
  WebGLGlass,
} from "./index.js";

describe("public API", () => {
  it("exports the React kit", () => {
    expect(GlassStage).toBeTypeOf("function");
    expect(useGlassLens).toBeTypeOf("function");
    expect(useGlassStage).toBeTypeOf("function");
  });

  it("exports the core engine (SVG + WebGL renderers)", () => {
    expect(applyGlass).toBeTypeOf("function");
    expect(createGlassController).toBeTypeOf("function");
    expect(generateDisplacementMap).toBeTypeOf("function");
    expect(buildGlassFilter).toBeTypeOf("function");
    expect(GlassFieldGL).toBeTypeOf("function");
    expect(GlassCompositor).toBeTypeOf("function");
    expect(WebGLGlass).toBeTypeOf("function");
  });
});
```

**Verify**: `npm test` → exit 0, all pass.

### Step 7: Full verification gate

Run the whole gate in order; each must pass:

```
npm run lint
npm run typecheck
npm test
npm run build
npm run build:demo
```

Then confirm the widget CSS left the shipped bundle and the kit CSS stayed:

- `grep -c "glassx-button" dist/index.css` → `0`
- `grep -c "glass-lens-canvas" dist/index.css` → `1` or more

## Test plan

- No new test files. `src/index.test.ts` is updated (Step 6) to assert the new
  surface: the kit (`GlassStage`, `useGlassLens`, `useGlassStage`) and the
  engine (`applyGlass`, `createGlassController`, `generateDisplacementMap`,
  `buildGlassFilter`, `GlassFieldGL`, `GlassCompositor`, `WebGLGlass`).
- `src/core/liquid-glass.test.ts` is unrelated and must keep passing untouched.
- Verification: `npm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run build:demo` exits 0
- [ ] `grep -rnE "GlassButton|GlassSwitch|GlassSlider|GlassToggleGroup|Magnifier" src/` returns no matches
- [ ] `ls examples/demo/src/glass/` lists `GlassButton.tsx GlassSlider.tsx GlassSwitch.tsx GlassToggleGroup.tsx Magnifier.tsx components.css index.ts`
- [ ] `grep -c "glassx-button" dist/index.css` → `0`
- [ ] `grep -c "glass-lens-canvas" dist/index.css` → ≥ `1`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 001 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows any in-scope file changed since `ae5ad18` and the live
  code no longer matches the "Current state" excerpts.
- In the Step 7 gate, `npm run build:demo` fails to resolve the demo's local
  glass module (`./glass/index.ts`) or the `.tsx` widget files **even though**
  you used real `.ts`/`.tsx` extensions as instructed — that would mean the
  resolution model changed again; report the exact error rather than guessing at
  extensionless or `resolve.extensions` config changes.
- After Step 5, `dist/index.css` is missing `.glass-fg` / `.glass-lens-canvas`
  (kit classes) — that would mean `stage.css` is not being bundled and
  consumers of the kit would break.
- Any step's verification fails twice after a reasonable fix attempt.
- You find a reference to a moved widget outside the in-scope file list.

## Maintenance notes

- The moved widgets live under `examples/demo/` and are therefore **no longer
  typechecked** by `npm run typecheck` (tsconfig `include` is `["src"]`); they
  are still biome-linted (biome includes `examples/**`) and compiled by
  `npm run build:demo`. This is an accepted trade-off for reference code. If you
  later want them typechecked, add a demo-scoped tsconfig — out of scope here.
- `package.json` keeps `react`/`react-dom` peer deps because the shipped React
  kit needs them. Do not drop them.
- A reviewer should confirm: published surface no longer includes the widgets
  (check `dist/index.d.ts` after build has no `GlassButtonProps` etc.), and the
  demo still renders all controls via the local `./glass` module.
- README still documents the old widgets and an outdated quick-start — that is
  fixed in Plan 002, which depends on this one.
