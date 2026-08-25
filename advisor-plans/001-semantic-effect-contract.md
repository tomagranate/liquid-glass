# Plan 001: Define the semantic effect contract

> **Executor instructions**: Follow this plan step by step. Run every
> verification command. Confirm the expected result before the next step. Stop
> if a STOP condition occurs. When done, update this plan's row in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 6f3b9742b9817aefc3d04386beb03e0f8cce7ebe..HEAD -- README.md ARCHITECTURE.md plans/product-api-v0.1.md src/core/types.ts src/core/glass.ts`
> If an in-scope fact changed, compare the current code with this plan. Stop on
> a material mismatch.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `6f3b974`, 2026-08-14

## Why this matters

The current API mixes product intent with renderer control. It also describes
unequal browser output as a full effect. Define a stable contract before more
runtime work starts. The contract must put quality first and keep safe defaults.

## Current state

- `src/core/types.ts:27-50` exposes eleven material fields. It includes `dpr`,
  which is an implementation control.
- `src/core/types.ts:52-65` names renderer backends and quality policies.
- `src/core/types.ts:70-90` exposes `surfaces`, `track`, and overloaded
  `background` routing.
- `src/core/types.ts:92-104` exposes backend names as the main handle status.
- `README.md:10-14` calls the API zero-configuration. It then requires
  `background: false` to select registered surfaces.
- `README.md:403-411` calls content and media output a full effect. The text only
  qualifies content size.
- `ARCHITECTURE.md:140-153` explains the hard platform limit. Only Chromium can
  run an SVG URL filter on the live backdrop.

Current option shape:

```ts
// src/core/types.ts:70-90
export interface GlassOptions extends GlassMaterial {
  preset?: GlassPreset;
  quality?: GlassQuality;
  fallback?: GlassFallback;
  onBackendChange?: (backends: readonly GlassBackend[]) => void;
  surfaces?: "auto" | SurfaceHandle[];
  track?: "auto" | "live";
  background?: "auto" | false | string;
}
```

The new contract must use these stable product terms:

- **Use case**: `auto`, `page`, `region`, `media`, or `wallpaper`.
- **Effect**: `refract`, `frost`, `tint`, or `none`.
- **Source**: `page`, `region`, `media`, `wallpaper`, or `none`.
- **Fidelity**: `full`, `reduced`, or `fallback`.
- **Reason**: a stable cause such as `unsupported`, `over-budget`,
  `source-unavailable`, `webgl-unavailable`, or `offscreen`.
- **Backend**: an internal implementation detail. Keep it in diagnostics.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Inspect | `git status --short` | only intended files appear |
| Format | `npm run lint` | exit 0 |
| Links | `rg -n "product-api-v0.2" README.md ARCHITECTURE.md plans` | intended references only |

## Scope

**In scope**:

- `plans/product-api-v0.2.md` (create)
- `advisor-plans/README.md`

**Out of scope**:

- All files under `src/`
- All tests and fixtures
- Public API implementation
- Performance thresholds
- README and architecture migration

## Git workflow

- Continue on `tomagranate/liquid-glass-v1` and draft PR #5.
- Use one documentation commit: `docs: define semantic glass capabilities`.
- Do not merge the PR.
- Do not change PR draft state in this plan.

## Steps

### Step 1: Write the product rules

Create `plans/product-api-v0.2.md`. State the goal order exactly:

1. High visual quality.
2. Good page performance.
3. Simple API use.
4. Cross-platform parity.
5. Clear platform discrimination where parity is impossible.

Add these rules:

- Quality means no blank output, black output, seams, self-refraction, or soft
  foreground content.
- Performance limits can reduce refraction. They must not reduce readability.
- `glass(element)` must never select a known unsafe dense-copy strategy.
- Parity covers component geometry, material chrome, fallback meaning, and
  status. It does not require equal pixel displacement.
- The API describes requested effects and sources. It does not select backends.
- A runtime status reports the effect that the user can see.
- A capability query reports static platform limits before mounting.

**Verify**:
`rg -n "High visual quality|known unsafe|does not require equal pixel|capability" plans/product-api-v0.2.md`
→ each rule has one match.

### Step 2: Define separate use-case interfaces

Put this target shape in the spec. Names can change only after review. Keep the
source handles distinct so TypeScript rejects a region handle passed to a media
interface.

```ts
type GlassUseCase = "auto" | "page" | "region" | "media" | "wallpaper";
type GlassEffect = "refract" | "frost" | "tint" | "none";
type GlassFidelity = "full" | "reduced" | "fallback";

interface GlassStatus {
  useCase: GlassUseCase;
  effect: GlassEffect;
  fidelity: GlassFidelity;
  sources: readonly ("page" | "region" | "media" | "wallpaper")[];
  reason?: GlassFallbackReason;
}

interface GlassRegionHandle extends SurfaceHandle {
  readonly kind: "region";
}

interface GlassMediaHandle extends SurfaceHandle {
  readonly kind: "media";
}
```

Define these separate interfaces:

```ts
glass(element, options?);
glassOverPage(element, options?);
glassOverRegion(element, options?: GlassOverRegionOptions);
glassOverMedia(element, options?: GlassOverMediaOptions);
glassOverWallpaper(element, cssWallpaper, options?);
```

`GlassOverRegionOptions.region` accepts only one or more `GlassRegionHandle`
values. `GlassOverMediaOptions.media` accepts only one or more
`GlassMediaHandle` values. If the selector is absent, the named interface
selects only overlapping registered sources of its own kind.

Define equivalent React interfaces:

```tsx
<Glass />
<GlassOverPage />
<GlassOverRegion region={region} /> // region is optional
<GlassOverMedia media={media} />    // media is optional
<GlassOverWallpaper wallpaper={cssWallpaper} />
```

Define these interface rules:

- `glass` is the only automatic interface. It uses safe registered overlapping
  sources first. It can use a Chromium live page. It otherwise uses frost.
- `glassOverPage` requests only the arbitrary live page. It never creates a
  painted copy. Chromium can refract. Safari and Firefox use frost.
- `glassOverRegion` selects only marked live page regions. An optional
  `GlassRegionHandle` restricts the set. It uses bounded SVG refraction or its
  documented fallback.
- `glassOverMedia` selects only registered image, video, or canvas sources. An
  optional `GlassMediaHandle` restricts the set. It uses WebGL2 refraction or its
  documented fallback.
- `glassOverWallpaper` is the only interface that can select a painted copy. It
  accepts reproducible CSS artwork as a required argument.
- An explicit interface never changes to a different source family. It can only
  reduce fidelity or use its configured fallback.
- `background` no longer accepts `false` or `"auto"`.
- Keep `track` and raw material fields in an `advanced` namespace or a separate
  advanced entry point. Do not put them in the primary quick-start table.
- Keep `GlassBackend` and detailed policy reasons under diagnostics.

**Verify**:
`rg -n "GlassUseCase|GlassStatus|glassOverPage|glassOverRegion|glassOverMedia|glassOverWallpaper|advanced|GlassBackend" plans/product-api-v0.2.md`
→ all required contract sections appear.

### Step 3: Define the platform matrix

Add this minimum matrix. Use effect names, not backend names.

| Explicit interface | Chromium | Safari | Firefox |
| --- | --- | --- | --- |
| `glassOverPage` | full or reduced live refraction | frost | frost |
| `glassOverRegion` | budgeted SVG refraction | budgeted SVG refraction | budgeted SVG refraction |
| `glassOverMedia` | refraction with WebGL2 | refraction with WebGL2 | refraction with WebGL2 |
| `glassOverWallpaper` | budgeted copied refraction | budgeted copied refraction | budgeted copied refraction |
| Any unsupported or over-budget case | frost, tint, or none | frost, tint, or none | frost, tint, or none |

State that `budgeted refraction` can become `reduced` or `fallback`. State that
the exact limits come from Plan 002.

**Verify**:
`rg -n "glassOverPage|glassOverRegion|glassOverMedia|glassOverWallpaper|exact limits" plans/product-api-v0.2.md`
→ all rows and the limit note appear.

### Step 4: Record rejected designs

Add a decision section. Reject these designs with one reason each:

- universal WebGL for live DOM;
- automatic per-lens painted copies;
- identical pixel output on all engines;
- user-facing backend names as the main status;
- a rewrite of the surface and lens core.

**Verify**:
`rg -n "universal WebGL|painted copies|identical pixel|backend names|rewrite" plans/product-api-v0.2.md`
→ five decisions appear.

## Test plan

This plan changes documentation only. Review the new spec against the current
types and architecture. Run `npm run lint`. It must exit 0.

## Done criteria

- [ ] `plans/product-api-v0.2.md` contains the goal order.
- [ ] The spec defines effect, source, fidelity, and reason.
- [ ] The spec defines separate automatic, page, region, media, and wallpaper
  interfaces.
- [ ] Content and media handles have distinct public types.
- [ ] The spec includes the platform matrix.
- [ ] The spec makes copied wallpaper refraction explicit.
- [ ] The spec keeps renderer names in diagnostics.
- [ ] `npm run lint` exits 0.
- [ ] No source or test file changed.
- [ ] The status row in `advisor-plans/README.md` is `DONE`.

## STOP conditions

Stop and report if:

- A reviewer rejects the semantic effect model.
- A reviewer requires identical pixel output on all engines.
- A requested contract needs live DOM pixels in WebGL without a texture source.
- Any current public API must remain unchanged for a released v0.1 client.

## Maintenance notes

The product spec is the decision source for Plans 002 to 004. Later threshold
changes must not change the meaning of `effect`, `source`, or `fidelity`.
