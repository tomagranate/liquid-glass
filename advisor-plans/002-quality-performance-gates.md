# Plan 002: Build quality and performance decision gates

> **Executor instructions**: Follow this plan step by step. Run each verification
> command. Do not select production limits from one run. Stop if a STOP condition
> occurs. When done, update this plan's row in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 6f3b9742b9817aefc3d04386beb03e0f8cce7ebe..HEAD -- tests/perf scripts/browser-perf.mjs scripts/browser-perf-all.mjs scripts/lib/perf-analysis.mjs examples/demo .github/workflows`
> Compare changed files with this plan. Stop on a material mismatch.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `advisor-plans/001-semantic-effect-contract.md`
- **Category**: tests, perf
- **Planned at**: commit `6f3b974`, 2026-08-14

## Why this matters

The branch has a strong browser harness. Its current scenarios do not locate the
safe transition point. The mount gate also combines cold start with one noisy
sample. Build decision gates that protect visual quality and page performance.

## Current state

- `tests/perf/scenarios.json:1-14` tests counts 1, 8, and 32.
- `tests/perf/main.js:39-43` only parses counts 1, 8, and 32.
- `tests/perf/main.js:156-160` records one mount-to-second-paint value.
- `scripts/lib/perf-analysis.mjs:34-48` compares paired steady-state p95 and
  dropped frames.
- `scripts/lib/perf-analysis.mjs:51-63` has a separate interaction check.
- `tests/perf/thresholds/*.json:12` uses one 250 ms mount limit.
- `scripts/browser-perf.mjs:197-218` already captures control/effect images and
  checks the lens region for visible output.
- `tests/perf/README.md:85-100` records that pass reduction did not save eight
  Safari copies.

The final PR run is
https://github.com/tomagranate/liquid-glass/actions/runs/31827616264. It failed
large backdrop groups, copied backgrounds, some media work, and mount samples.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Build package | `npm run build` | exit 0 |
| Build fixture | `npm run build:perf` | exit 0 |
| Harness tests | `npm run test:perf-harness` | all tests pass |
| Quick browsers | `npm run perf:all -- --quick=true` | all accepted scenarios pass |
| Full browsers | `npm run perf:all` | all accepted scenarios pass |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope**:

- `tests/perf/scenarios.json`
- `tests/perf/main.js`
- `tests/perf/style.css`
- `tests/perf/backend-policy.js`
- `tests/perf/thresholds/chrome.json`
- `tests/perf/thresholds/firefox.json`
- `tests/perf/thresholds/safari.json`
- `tests/perf/README.md`
- `scripts/browser-perf.mjs`
- `scripts/browser-perf-all.mjs`
- `scripts/lib/perf-analysis.mjs`
- `scripts/lib/perf-analysis.test.mjs`
- `scripts/lib/png-proof.mjs`
- `scripts/lib/png-proof.test.mjs`
- `artifacts/performance/` only as ignored run output
- `advisor-plans/README.md`

**Out of scope**:

- Production files under `src/`
- Public API changes
- README product claims
- Lower performance limits that only make existing output pass

## Git workflow

- Continue on `tomagranate/liquid-glass-v1` and draft PR #5.
- Use commits such as `test: define renderer quality gates` and
  `test: calibrate browser workload profiles`.
- Keep raw artifacts out of Git unless the repository already tracks that exact
  artifact class.
- Do not merge or mark the PR ready.

## Steps

### Step 1: Add a complete workload ladder

Add counts 2, 4, and 16 for backdrop and copied-background scroll scenarios.
Keep 1, 8, and 32. Update `countFrom` so it accepts each declared count without
a fixed regular expression.

Add at least these families:

- `backdrop-scroll-{1,2,4,8,16,32}`;
- `background-copy-scroll-{1,2,4,8,16,32}`;
- `content-static-{1,2,4,8,16}` on one bounded shared surface;
- `content-motion-{1,2,4,8,16}` on one bounded shared surface;
- `media-live-{1,2,4,8,16}`;
- one mixed realistic control group.

Do not use production source aliases. Keep the fixture on package exports.

**Verify**:
`node -e 'const s=require("./tests/perf/scenarios.json"); for (const n of [1,2,4,8,16,32]) for (const p of ["backdrop-scroll-","background-copy-scroll-"]) if (!s.includes(p+n)) process.exit(1)'`
→ exit 0.

### Step 2: Split the four gates

Keep separate results for:

1. visual quality;
2. steady-state frames;
3. interaction response;
4. mount cost.

Replace the one mount sample with paired effect/control mount runs. Use at least
five samples in quick mode and ten samples in full mode. Report median and p95
effect-minus-control deltas. Do not reuse frame samples for mount results.

Add pure analysis functions and unit tests before browser integration. Tests
must cover empty input, sorted input, outliers, a passing pair, and a failing
pair.

**Verify**:
`npm run test:perf-harness`
→ all tests pass, including new mount analysis tests.

### Step 3: Strengthen the visual gate

Extend the present ROI proof. Add fixed scenes for:

- light textured content;
- dark textured content;
- small text behind the lens;
- sharp foreground text inside the lens;
- a partial surface overlap seam;
- the `frost` fallback.

For each scene, prove these machine-readable facts:

- output is not blank or black;
- the refracted ROI differs from control by a minimum amount;
- pixels outside the lens stay within a small change limit;
- foreground text stays sharper than the refracted background;
- a partial overlap has no bright or transparent seam.

Use the current `pngjs` utilities. Keep approved per-engine images and numeric
limits versioned. Require `--approve=true` for any baseline update. Record the
browser version and commit with each update.

**Verify**:
`npm run test:perf-harness`
→ all new PNG proof tests pass.

### Step 4: Compare implementation strategies

Use fixture-only implementations. Do not change `src/` in this step. Compare:

- current per-lens copied background;
- one shared bounded wallpaper surface with multiple sub-lenses;
- polished native frost with no displacement.

Test static and scrolled content. Test the full count ladder. The shared surface
experiment must use a bounded region. Do not assume a full-page Safari filter is
safe.

Record for each engine and strategy:

- visual gate result;
- p95 and drop ratio;
- interaction p95 and worst;
- paired mount median and p95;
- exact status or backend;
- lens count and device pixel-pass area.

Write the result table in `tests/perf/README.md`. Mark a strategy viable only if
all four gates pass in two full runs.

**Verify**:
`npm run build && npm run build:perf && npm run perf:all`
→ two saved full-run summaries exist for each browser and strategy.

### Step 5: Define measured profiles

Add a versioned profile for each engine and effect family. Each profile must use
both a lens-count limit and a pixel-pass limit. Add a motion class if motion
changes the safe limit.

Do not put the limits into production code in this plan. Record them in the
threshold JSON and `tests/perf/README.md`. Use the last passing rung below the
first failing rung. Do not interpolate from one run.

If no copied-background rung passes twice, mark copied refraction unsupported for
that engine. If only one copy passes, set the measured maximum to one.

**Verify**:
`rg -n "maxLensCount|maxDevicePixelPassArea|motion" tests/perf/thresholds tests/perf/README.md`
→ each engine has an explicit profile.

## Test plan

- Unit-test new mount, profile, and visual analysis functions.
- Run two full branded-browser samples after quick development runs.
- Keep negative timing and blank-output self-tests.
- Keep the real SafariDriver requirement. Do not substitute Playwright WebKit.

## Done criteria

- [ ] Counts 1, 2, 4, 8, 16, and 32 exist for the two key scroll families.
- [ ] Visual, steady-state, interaction, and mount gates are separate.
- [ ] Mount uses paired repeated samples.
- [ ] Visual proof covers quality and containment, not only non-blank output.
- [ ] Per-lens copy, shared bounded copy, and frost have measured results.
- [ ] Every profile uses count and pixel-pass limits.
- [ ] Two full branded-browser runs support each accepted limit.
- [ ] `npm run test:perf-harness` and `npm run lint` exit 0.
- [ ] No production file under `src/` changed.
- [ ] The status row in `advisor-plans/README.md` is `DONE`.

## STOP conditions

Stop and report if:

- Native Safari automation is unavailable.
- A full run cannot keep the browser visible and render frames.
- Two full runs disagree on the first safe rung.
- The visual proof cannot distinguish a correct effect from a blank effect.
- A strategy requires a production code change to test.
- A proposed fix only changes a threshold.

## Maintenance notes

Keep profile provenance. Browser and GPU changes can move limits. Recalibrate
before a major browser release, but do not change effect semantics.
