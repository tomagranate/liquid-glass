# Apply spike learnings, remove the spike, tier the engines

**Status:** executed 2026-07-03. Successor to milestone 0 of
[surface-lens-redesign.md](./surface-lens-redesign.md); unblocks milestones 1–2.
The spike findings were preserved in `ARCHITECTURE.md`, the harness was removed,
and the exact real-Safari cap remains a conservative `~2048` device-px release
gate value until `scripts/safari-check` records a project baseline.

## Context

The milestone-0 spike found and root-caused every real-Safari failure mode.
All of them afflict exactly one cell of the matrix — content surfaces × Safari
— and each has a proven countermeasure. The spike (examples/spike) has done
its job; this plan folds the learnings into the library rules, defines
per-engine tiers so each platform runs only what it's good at, and deletes
the spike.

## Confirmed learnings → library rules

Each of these was proven in real Safari via the spike (evidence:
`examples/spike/compat-matrix.md`, to be preserved — see Docs below).

1. **Composite every filtered element.** `filter: url()` chains containing
   `feImage` blank the element on non-composited layers in real Safari.
   Library stylesheet puts `transform: translateZ(0)` on every filtered
   surface/layer. Never rely on `will-change: filter` (does not promote in
   Safari — plausibly the entire v0.0.2 Safari breakage).
2. **Minimal filter regions, all engines.** Replace the default
   `-30%…160%` region with a region computed from displacement reach
   (element bounds + `scale` px + blur radius). Cheaper everywhere; on
   Safari it multiplies the usable surface size (budget formula below).
3. **Safari move path = mutation + epsilon flush.** feImage x/y placement is
   correct at build; bare mutations render flakily. After `moveFilterLens`,
   alternate the CSS filter string (`url(#f)` ↔ `url(#f) brightness(1.0001)`),
   coalesced to one flush per rAF. **Safari-gated** (UA detect; no feature
   detect exists) — Chromium/Firefox handle mutation natively and the flush
   actively de-optimizes them. During interactive drags on Safari, drop
   `chroma` to 0 and restore on release (3 displacement passes → 1).
4. **A surface must not be its own scroll container.** Safari anchors the
   filter to the scroll layer's content (maps ride along with scrolled
   content). Surfaces wrap a scroller, never are one:
   `surface[filter] > scroller > content`. Dev warning when `overflow` on a
   surface element is scrollable. (Verify the wrapper structure in the
   close-out reads below.)
5. **Safari size budget.** Enforce `size × regionScale × dpr ≤ cap` per
   content surface. Cap measured in the close-out reads (hypothesis ~2048
   device px; conservative default until measured). Exceeding it routes the
   surface to the degrade tier (below) + dev warning. Chromium/Firefox:
   no budget (verified through 2000² in CI).
6. **Playwright WebKit is structural-only.** It renders everything real
   Safari breaks. Keep webkit vitest instances for structural coverage;
   correctness gate for Safari is a `safaridriver` screenshot script +
   the per-release manual checklist.
7. Per-lens frost stays documented out (unchanged decision).

## Engine tiers (backend router policy)

One API; the router picks per-engine implementations. Detection: WebKit UA
check with a documented `tier` override on `GlassProvider`/`glass()`.

| Backend | Chromium / Firefox | Safari |
|---|---|---|
| Background (clone) | Full fidelity | **Full fidelity** — lens-sized static filters (~200–400px, under any budget), movement via `background-position`, no filter mutation. |
| Media (WebGL) | Full fidelity | **Full fidelity** — no SVG filters involved. |
| Content (filter-on-DOM) | Full refraction, native mutation moves | **Conditional**: allowed when within the size budget; static lens+surface pairs run as-is; moving lenses use the epsilon flush path. Anything over budget → **native degrade**: `backdrop-filter: blur() saturate()` + tint/rim/sheen per lens. Fast, native, and closest to Apple's own glass on Apple's browser. |

The degrade is per-surface-registration, automatic, and visually coherent
(same panel chrome; only the refraction of live content is simplified).

## Spike close-out reads (do BEFORE deletion — the spike is the instrument)

One short real-Safari session (~30 min):
1. Size ladder, tight vs wide region rungs → pin the cap; record the number.
2. Wrapper-around-scroller A/B → confirm rule 4's fix.
3. Re-run the manual checklist once with compositing forced (compat variant
   knobs should now all render — confirms no second-order variant issues).

## Removal + docs

- **Preserve findings:** condense `examples/spike/compat-matrix.md` (results,
  root causes, budget formula, move strategy, checklist) into an
  ARCHITECTURE.md appendix "Safari: constraints and countermeasures".
- **Delete** `examples/spike/` entirely (harness, safari-ab, map-ab.png,
  `__screenshots__`), the spike entries in `vitest.config.ts` include list,
  and the spike path in the `test:browser` script.
- **Keep** the webkit + firefox vitest instances and the
  `playwright install chromium firefox webkit` pretest — they gate the
  library's own browser tests from milestone 2 on. Port the spike's per-tile
  lens-region pixel-diff helper into the library test utils when
  `core/filter.ts` lands (it becomes the template for backend tests).
- Add `scripts/safari-check` (safaridriver + screenshot pixel-diff of the
  demo fixtures) as the real-Safari gate, run per release.
- Update `plans/surface-lens-redesign.md`: milestone 0 closed (link here);
  milestone 2 inherits rules 1–5 as hard requirements; milestone 3's
  background backend notes rule "immune on Safari"; README/ARCHITECTURE
  rewrite scope unchanged.

## Optional quick win (independent of v0.1)

`v0.0.3` patch release for the current library: change `.lq-refraction`'s
`will-change: filter` to `transform: translateZ(0); will-change: transform`
(+ minimal filter region). Likely fixes the originally reported v0.0.2 Safari
breakage for existing users in one line, at zero risk to the redesign.

## Order of work

- [ ] Close-out reads (spike still present): deferred to `scripts/safari-check`
  because the exact cap was not pinned before deleting the harness.
- [x] ARCHITECTURE.md appendix + plan updates.
- [x] Delete spike, trim vitest/test scripts; verify `npm run test` green.
- [ ] Optional v0.0.3 patch release.
- [x] Resume milestone 1 of the redesign with rules 1–5 and the tier table as
   acceptance criteria for milestones 2–4.
