# Plan 003: Implement safe semantic routing

> **Executor instructions**: Follow this plan in order. Copy measured values from
> Plan 002. Do not invent performance limits. Run each verification command. Stop
> on a STOP condition. When done, update this plan's row in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 6f3b9742b9817aefc3d04386beb03e0f8cce7ebe..HEAD -- src/core/glass.ts src/core/runtime.ts src/core/policy.ts src/core/surfaces.ts src/core/media.ts src/core/types.ts src/core/*.test.ts`
> Compare changed symbols with this plan. Stop on a material mismatch.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `advisor-plans/001-semantic-effect-contract.md`, `advisor-plans/002-quality-performance-gates.md`
- **Category**: perf, tech-debt
- **Planned at**: commit `6f3b974`, 2026-08-14

## Why this matters

The current router selects a renderer before it expresses a stable user-visible
effect. Its default can also admit too many painted copies. Add one pure semantic
resolver. Then make every renderer follow its result.

## Current state

- `src/core/glass.ts:327-329` makes Chromium backdrop eligibility depend on the
  overloaded `background` option.
- `src/core/glass.ts:504-533` resolves candidate surfaces from `surfaces`.
- `src/core/glass.ts:565-600` applies the backdrop decision before surface work.
- `src/core/glass.ts:790-836` turns any uncovered non-Chromium case into paint.
- `src/core/runtime.ts:81-107` has aggregate area limits.
- `src/core/runtime.ts:269-297` greedily admits copies by area only.
- `src/core/policy.ts:56-197` is a pure single-backend policy function.
- `src/core/surfaces.ts:266-340` already gives content surfaces one shared filter.
- `src/core/media.ts:251-276` already stops media loops when inactive.

The reusable core is sound. Keep it:

- Chromium live backdrop renderer;
- shared content-surface SVG renderer;
- instanced media WebGL renderer;
- native frost, tint, and none fallbacks.

Treat the per-lens painted copy as an explicit wallpaper renderer. It is no
longer the automatic Safari and Firefox parity route.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Unit tests | `npm run test:unit` | all tests pass |
| Browser tests | `npm run test:browser` | all supported tests pass |
| Harness tests | `npm run test:perf-harness` | all tests pass |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build && npm run build:perf` | exit 0 |
| Real browsers | `npm run perf:all -- --quick=true` | all scenarios pass |

## Scope

**In scope**:

- `src/core/capabilities.ts` (create)
- `src/core/capabilities.test.ts` (create)
- `src/core/glass.ts`
- `src/core/runtime.ts`
- `src/core/runtime.test.ts`
- `src/core/policy.ts`
- `src/core/policy.test.ts`
- `src/core/surfaces.ts`
- `src/core/surfaces.test.ts`
- `src/core/media.ts`
- `src/core/media.test.ts`
- `src/core/types.ts` for internal status types only
- `src/core/glass.test.ts`
- `src/core/glass.browser.test.ts`
- `tests/perf/backend-policy.js`
- `advisor-plans/README.md`

**Out of scope**:

- Final public option migration
- React prop migration
- README and demo rewrite
- New DOM capture or rasterization
- Universal WebGL
- Relaxed browser thresholds

## Git workflow

- Continue on `tomagranate/liquid-glass-v1` and draft PR #5.
- Use logical commits. Examples: `refactor: add semantic glass resolver`,
  `perf: stop automatic painted copies`, `test: cover capability transitions`.
- Do not merge or mark the PR ready.
- Do not force-push without operator approval.

## Steps

### Step 1: Add a pure capability resolver

Create `src/core/capabilities.ts`. It must have no DOM writes. Give it explicit
inputs for:

- requested use case: auto, page, region, media, or wallpaper;
- available overlapping sources;
- engine and detected features;
- visibility and motion class;
- lens count;
- pixel-pass area;
- requested quality and fallback;
- measured renderer profile from Plan 002.

Return a semantic result:

```ts
interface GlassResolution {
  useCase: "auto" | "page" | "region" | "media" | "wallpaper";
  effect: "refract" | "frost" | "tint" | "none";
  fidelity: "full" | "reduced" | "fallback";
  sources: readonly GlassSourceKind[];
  renderers: readonly GlassBackend[];
  reason?: GlassFallbackReason;
}
```

The rules must be deterministic. The same input returns the same result. Backend
order must not change the effect meaning. An explicit use case must never resolve
to a different source family.

**Verify**:
`npm run test:unit -- src/core/capabilities.test.ts`
→ tests cover every source, engine, fidelity, and fallback combination.

### Step 2: Apply safe automatic defaults

Change `src/core/glass.ts` so each use case follows these rules:

- `auto` uses an overlapping registered source when it is viable. It can use a
  Chromium live page. It otherwise uses frost.
- `page` uses live page refraction on Chromium and frost elsewhere.
- `region` uses only the named marked page region.
- `media` uses only the named media source.
- `wallpaper` uses only the supplied reproducible CSS artwork.
- Do not create a painted copy for `auto` or `page`.
- Use a painted copy only for the explicit `wallpaper` use case.
- Keep foreground children crisp and interactive.
- Keep partial overlap composition only when two accepted refractive sources
  truly contribute.

During this plan, use an internal adapter for the old options. Final public
types change in Plan 004.

**Verify**:
`npm run test:unit -- src/core/glass.test.ts && npm run test:browser`
→ automatic Safari and Firefox cases report frost; explicit wallpaper cases can
report copied refraction within measured limits.

### Step 3: Replace area-only admission

Update `src/core/runtime.ts`. Use the measured profile from Plan 002. A renderer
must pass both checks:

- current or projected lens count;
- current or projected pixel-pass area.

If Plan 002 found a motion-specific limit, include motion class. Preserve
hysteresis. Make admission deterministic. Do not let insertion order give a
random user-visible mixture. Prefer one scope-wide fidelity tier for equal
requests. If partial admission remains necessary, document and test its stable
priority rule.

Expose semantic reason codes. Keep detailed backend reasons in diagnostics.

**Verify**:
`npm run test:unit -- src/core/runtime.test.ts src/core/policy.test.ts`
→ boundary, hysteresis, equal-cost order, count-only failure, and area-only
failure tests pass.

### Step 4: Keep strong renderers and honest fallbacks

Do not replace the shared content or media implementation. Add only the status
and policy hooks that the resolver needs.

For content surfaces:

- keep one filter per surface;
- keep bounded filter regions;
- keep the Safari mutation flush;
- report `reduced` when shared maxima or quality cuts change output;
- report `fallback` when the surface cannot run safely.

For media surfaces:

- keep one instanced draw;
- keep visibility and attachment loop guards;
- report `webgl-unavailable` on context creation failure;
- use the configured frost, tint, or none fallback.

**Verify**:
`npm run test:unit -- src/core/surfaces.test.ts src/core/media.test.ts`
→ existing lifecycle tests and new semantic status tests pass.

### Step 5: Verify browser transitions

Add browser tests for:

- automatic unregistered lens on all engines;
- explicit page use case on all engines;
- registered bounded region;
- registered media with and without WebGL2;
- explicit copied wallpaper below and above both profile limits;
- offscreen removal from workload;
- transition from full to reduced to fallback and back;
- stable reason and status notifications;
- no per-frame work after teardown.

Then run the real-browser quick gate. If it fails, change runtime behavior. Do
not change threshold numbers in this plan.

**Verify**:
`npm run build && npm run build:perf && npm run perf:all -- --quick=true`
→ Chrome, Firefox, and Safari pass.

## Test plan

- Make `capabilities.test.ts` a complete pure decision table.
- Preserve all existing policy, runtime, surface, media, and cleanup tests.
- Use browser tests for actual renderer support and pixel output.
- Use the branded gate for final performance behavior.

## Done criteria

- [ ] One pure resolver owns semantic effect selection.
- [ ] Every explicit use case stays within its source family.
- [ ] Automatic Safari and Firefox lenses do not create painted copies.
- [ ] Explicit copied wallpaper obeys count and area limits.
- [ ] Content surfaces still share one filter.
- [ ] Media surfaces still use one instanced renderer.
- [ ] Every degradation has a stable semantic reason.
- [ ] Unit, browser, harness, typecheck, lint, and build commands pass.
- [ ] The branded quick gate passes without threshold relaxation.
- [ ] The status row in `advisor-plans/README.md` is `DONE`.

## STOP conditions

Stop and report if:

- Plan 002 has no approved measured profiles.
- Automatic Safari or Firefox output still creates a painted copy.
- The resolver needs DOM writes or imports a renderer.
- A renderer change breaks crisp foreground interaction.
- The fix requires live DOM capture into WebGL.
- A browser gate needs a looser threshold to pass.

## Maintenance notes

Reviewers must focus on resolver purity, deterministic admission, and transition
stability. New renderers must map into the existing semantic effect levels.
