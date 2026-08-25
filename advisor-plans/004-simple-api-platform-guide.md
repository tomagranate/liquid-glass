# Plan 004: Ship the simple API and platform guide

> **Executor instructions**: Follow this plan step by step. Preserve a migration
> path for the current draft API. Run each verification command. Stop on a STOP
> condition. When done, update this plan's row in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 6f3b9742b9817aefc3d04386beb03e0f8cce7ebe..HEAD -- src/core/types.ts src/core/api.ts src/core/scope.ts src/index.ts src/react/index.tsx README.md ARCHITECTURE.md examples/demo scripts/test-package.mjs`
> Compare changed public symbols with this plan. Stop on a material mismatch.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: `advisor-plans/003-safe-semantic-routing.md`
- **Category**: migration, dx, docs
- **Planned at**: commit `6f3b974`, 2026-08-14

## Why this matters

The implementation can be honest and still feel simple. Give each source family
one named interface. Keep one automatic convenience interface. Move technical
controls out of the main path. Report visible effects with stable product terms.

## Current state

- `src/core/types.ts:27-90` combines material, quality, renderer routing, and
  geometry tracking in `GlassOptions`.
- `src/core/types.ts:92-104` exposes only backend arrays on `GlassHandle`.
- `src/index.ts:24-60` exports low-level renderer builders beside the main API.
- `src/react/index.tsx:88-108` maintains a manual list of all option prop names.
- `src/react/index.tsx:124-147` manually serializes most options.
- `README.md:87-113` requires `background: false` for content routing.
- `README.md:246-261` puts backend controls and backend names in the main API.
- `README.md:403-436` mixes features and implementations in its support matrix.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Unit tests | `npm run test:unit` | all tests pass |
| Browser tests | `npm run test:browser` | all supported tests pass |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Package test | `npm run test:package` | exit 0 |
| Demo build | `npm run build:demo` | exit 0 |
| Demo tour | `npm run test:demo:all` | 15 or more cases pass per browser |
| Performance | `npm run build:perf && npm run perf:all -- --quick=true` | all pass |

## Scope

**In scope**:

- `src/core/types.ts`
- `src/core/api.ts`
- `src/core/scope.ts`
- `src/core/glass.ts` for compatibility mapping only
- `src/index.ts`
- `src/index.test.ts`
- `src/react/index.tsx`
- `src/react/react.test.tsx`
- `README.md`
- `ARCHITECTURE.md`
- `plans/product-api-v0.1.md`
- `plans/product-api-v0.2.md`
- `examples/demo/**`
- `scripts/test-package.mjs`
- `tests/perf/backend-policy.js`
- `advisor-plans/README.md`

**Out of scope**:

- New renderers
- New threshold values
- Changes to measured profile logic
- A React context redesign
- Merge or release publication

## Git workflow

- Continue on `tomagranate/liquid-glass-v1` and draft PR #5.
- Use conventional commits. Examples: `feat: add semantic glass status`,
  `refactor: simplify glass source options`, `docs: explain platform effects`.
- Keep PR #5 draft until every gate passes and the operator reviews the matrix.
- Do not merge.

## Steps

### Step 1: Add the stable public types

Implement the approved types from `plans/product-api-v0.2.md`:

- `GlassUseCase`;
- `GlassEffect`;
- `GlassFidelity`;
- `GlassFallbackReason`;
- `GlassStatus`;
- `GlassCapabilities`.

Add `readonly status` to `GlassHandle`. Add `onStatusChange`. Keep backend names
only in diagnostics. If compatibility requires `backends`, mark it deprecated
and remove it from the quick-start guide.

Expose `getGlassCapabilities()` from the main API. Report capabilities by named
use case. It must not claim that a dynamic workload will pass its budget.

**Verify**:
`npm run typecheck && npm run test:unit -- src/index.test.ts`
→ public type and export tests pass.

### Step 2: Add one named interface per use case

Make the vanilla API support these examples:

```ts
glass(element);
glassOverPage(element);
glassOverRegion(element, { region });
glassOverMedia(element, { media });
glassOverWallpaper(element, cssWallpaper);
```

Use these exact contracts:

- `glass` is the safe automatic convenience interface.
- `glassOverPage` requests an arbitrary live page. It documents frost on Safari
  and Firefox.
- `glassOverRegion` selects only marked page regions. Its optional `region`
  accepts only `GlassRegionHandle` values.
- `glassOverMedia` selects only registered image, video, or canvas sources. Its
  optional `media` accepts only `GlassMediaHandle` values.
- `glassOverWallpaper` requires known CSS artwork and is the only copied route.

Split `SurfaceHandle` into `GlassRegionHandle` and `GlassMediaHandle`. TypeScript
must reject the wrong handle type at each interface. Prefer
`createGlassRegion()` over `createSurface()` in the new API. Keep a deprecated
alias only when compatibility requires it.

Remove `background: false` from public examples. Remove `surfaces` from the
primary options. Do not expose `dpr` or `track` in the primary option table.

Use one of these compatibility choices, in priority order:

1. If v0.1 has not shipped, make a clean draft-branch break and document it.
2. If clients use the draft, accept old options through a deprecated adapter for
   one minor release.

The adapter must warn once in development. It must map to the semantic request.
It must not keep automatic painted-copy behavior.

**Verify**:
`rg -n "background: false|background=\{false\}" README.md examples/demo src/react`
→ no public example match.

### Step 3: Update React without duplicating policy

Add matching React components. Do not add React-only routing logic:

```tsx
<Glass />
<GlassOverPage />
<GlassOverRegion />
<GlassOverMedia />
<GlassOverWallpaper wallpaper={cssWallpaper} />
```

`GlassOverRegion` and `GlassOverMedia` select overlapping registered sources of
their own kind when their selector is absent. Their optional `region` and
`media` props restrict that set. Prefer `useGlassRegion` and `useGlassMedia` as
the handle-producing hooks. Keep deprecated hook aliases only when compatibility
requires them.

Update `<Glass>` and `useGlass` to pass semantic requests to the core.

Prefer a shared option-key helper from core over another growing manual list.
Keep SSR safety. Keep stable mount ownership. Test option updates without lens
recreation.

Update automatic declarative use so this works without renderer flags:

```tsx
<div className="glass-stage">
  <GlassSurface className="live-card">...</GlassSurface>
  <GlassOverRegion className="card-lens">Open</GlassOverRegion>
</div>
```

Only `<Glass>` can choose a source family. Each named component must stay within
its source family. `status` must state the use case and visible effect.

**Verify**:
`npm run test:unit -- src/react/react.test.tsx && npm run typecheck`
→ SSR, mount, update, source, and status tests pass.

### Step 4: Separate the advanced entry point

Keep low-level exports available, but move them to a documented advanced
subpath if package compatibility permits. Candidates include map generation,
filter builders, `WebGLGlass`, raw budgets, tracking, and detailed backends.

The package root must focus on:

- `glass`;
- `glassOverPage`, `glassOverRegion`, `glassOverMedia`, and
  `glassOverWallpaper`;
- surface registration;
- scope creation;
- presets and semantic options;
- status and capability types.

Update `package.json` exports only if package tests prove ESM, CommonJS, types,
React, CSS, and advanced imports.

**Verify**:
`npm run test:package`
→ all package import modes pass.

### Step 5: Rewrite the support guide

Update README and architecture text. Lead with visible effects. Put renderer
details later.

Use this matrix:

| Interface | Chromium | Safari | Firefox |
| --- | --- | --- | --- |
| `glass` | Best safe source | Best safe source | Best safe source |
| `glassOverPage` | Live refraction | Frost fallback | Frost fallback |
| `glassOverRegion` | Budgeted SVG refraction | Budgeted SVG refraction | Budgeted SVG refraction |
| `glassOverMedia` | WebGL2 refraction | WebGL2 refraction | WebGL2 refraction |
| `glassOverWallpaper` | Strictly budgeted copy | Strictly budgeted copy | Strictly budgeted copy |

Add one short section for each fallback reason. Show how to inspect
`handle.status` and `getGlassCapabilities()`. State that `fidelity: "reduced"`
still refracts. State that `fidelity: "fallback"` does not.

Correct or remove old claims about full effects and current provisional copy
limits. Keep exact measured limits in the performance guide, not the quick start.

**Verify**:
`rg -n "glassOverPage|glassOverRegion|glassOverMedia|glassOverWallpaper|frost fallback|handle.status|getGlassCapabilities|fidelity" README.md ARCHITECTURE.md`
→ all required terms appear.

### Step 6: Make the demo a feature curriculum

Order stable demo cases by user intent:

1. automatic `glass`;
2. explicit `glassOverPage` and its platform fallback;
3. bounded `glassOverRegion`;
4. `glassOverMedia`;
5. explicit `glassOverWallpaper`;
6. reduced fidelity;
7. each fallback reason;
8. hooks and live updates;
9. density and cleanup diagnostics.

Show `effect`, `fidelity`, `sources`, and `reason` in each case. Hide backend
names under an advanced diagnostics disclosure.

Keep keyboard, pointer, reduced-motion, duplicate-ID, input-name, and mobile
overflow checks from the current demo tour.

**Verify**:
`npm run build && npm run build:demo && npm run test:demo:all`
→ every Chrome, Firefox, and Safari demo case passes.

### Step 7: Run the full release checks

Run all standard checks. Build the performance fixture last because other build
commands can clean root output.

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run test:browser
npm run test:perf-harness
npm run test:package
npm run build:demo
npm run build:perf
npm run perf:all -- --quick=true
```

**Verify**: every command exits 0. Keep PR #5 draft for operator review.

## Test plan

- Add compile-time public API examples.
- Test semantic status changes without handle recreation.
- Test old option mapping only if compatibility is required.
- Test every package export mode.
- Tour every public feature in branded Chrome, Firefox, and Safari.
- Run the quick performance gate after the final build.

## Done criteria

- [ ] The five named vanilla interfaces compile and run.
- [ ] The five matching React components compile and run.
- [ ] Content and media source types cannot be interchanged.
- [ ] `background: false` is absent from public examples.
- [ ] Status uses effect, fidelity, sources, and reason.
- [ ] Capabilities state static platform limits.
- [ ] Backend names are diagnostics, not the primary contract.
- [ ] README has an honest feature matrix.
- [ ] Demo cases show semantic status.
- [ ] All listed release commands pass.
- [ ] PR #5 remains draft and unmerged.
- [ ] The status row in `advisor-plans/README.md` is `DONE`.

## STOP conditions

Stop and report if:

- Plan 003 does not have a stable semantic resolver.
- A released client requires an incompatible option with no migration path.
- React needs separate routing logic from core.
- Package export changes break ESM or CommonJS consumers.
- README needs to claim an effect that fails its browser gate.
- Any step requires merging or publishing.

## Maintenance notes

Review the feature matrix with each major browser change. Keep semantic status
stable even if renderer names, thresholds, or browser detection change.
