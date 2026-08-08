# Demo page redesign — six sections around the three kinds of glass

Status: proposed 2026-07-14 (review of the "product use cases" page, commit
ffb5bdf). Measurements at 1400×900: total scroll 11,727px = 13.0 viewports.

## Diagnosis

- The page never names the library's core model — the three refraction routes
  (wallpaper/backdrop glass, content-surface glass, media/WebGL glass). It's
  expressed as a compat table + four mode cards 1,600px deep.
- Several sections are maintainer fixtures, not showcase material: the 32-lens
  density grid, nested scope isolation, vanilla diagnostics counters, and the
  diagnostics panel (PatternsScene alone is 2,826px).
- Redundancy: lock screen + control center both show thumb-on-track lenses;
  video + canvas both show media surfaces; mode cards + catalogue both show
  fallbacks. Scene numbers are out of order (01, 03, 03, "How it works", 02…).
- Broken: `/coast.mp4` 404s, so the flagship video demo is a black rectangle.

## Target layout (~6 viewports)

1. **Hero — the page is the demo** (~1.0vh)
   Glass nav, headline, install command, wallpaper switcher, and the
   draggable lens moved up here so the first interaction is immediate.
   Drop the hero code block and the second CTA row.

2. **Three kinds of glass** (~1.5vh) — the conceptual centerpiece.
   Three interactive panes side by side; each pane = live mini-demo +
   one-line "use when" + ≤5-line snippet:
   - Wallpaper glass: `<Glass>` — nav/dock/buttons, zero config.
   - Content glass: `<GlassSurface>` + `<Glass background={false}>` — the
     relocated draggable-lens-over-chart demo; DOM stays selectable.
   - Media glass: `<GlassMediaSurface live>` — restored video with a glass
     play control; caption notes canvas works identically.

3. **Built from real controls** (~1.2vh) — ONE composed lock-screen vignette
   replacing Dock + Control Center + Lock Screen scenes: dock at the bottom,
   music widget + one notification, a switch/slider tile. One shared
   show-code toggle with the thumb-on-track pattern
   (`useSurface(track)` + `useGlass(thumb, {radius: 999, background: false})`).

4. **Mix your own material** (~1.0vh) — keep the playground, add a live
   copyable `<Glass …/>` snippet that mirrors the slider values.

5. **It knows when to quit** (~0.4vh) — a single strip, not a section:
   budgets/fallback sentence + link to README compat table.

6. **Footer** — install repeat, MIT, footage credit.

## Moves and deletions

- Delete: `ShowcaseIntro`, `CompatibilityScene` (+ ModeCards),
  `PatternsScene` (catalogue cards, density grid, scope/vanilla cases),
  `CanvasMediaScene`, `DiagnosticsPanel` (gate behind `?diagnostics` instead),
  `SceneHeader index` numbering.
- Relocate to README/docs: compat table, fallback semantics, density/scope
  fixtures (they remain valuable as Storybook/regression material).
- ~~Fix: add `coast.mp4` to `examples/demo/public/`~~ — obsolete: the file
  exists and serves fine; the "404" was `favicon.ico` and an aborted video
  range request.
- Rhythm: cap section padding ~96px (currently ~160px); alternate stage-first
  and copy-first sections.

## Snippet curriculum (order the APIs are introduced)

`<Glass>` → `<GlassSurface>` + lens → `<GlassMediaSurface>` →
`useSurface`/`useGlass` thumbs → `handle.update()` tuning. Nothing else
appears on the page.
