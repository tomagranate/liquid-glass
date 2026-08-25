# Real-browser performance gate

This fixture is a production Vite build that imports only
`@tomagranate/liquid-glass` package exports after `npm run build`. It must never
gain a `src/` alias. The retained Vitest/Playwright suite is fast structural
coverage; this lane exclusively uses branded W3C WebDriver sessions.

Run `npm run build && npm run build:perf`, then one of `npm run perf:chrome`,
`perf:firefox`, `perf:safari`, or `perf:all`. Add `-- --quick=true` for the
90-frame, three-repetition PR profile. Full runs collect at least 600 rAF frames
over five repetitions, with two warmups and alternating control/effect order.

Build order is significant: `npm run build` (including the build inside
`npm run test:package`) cleans the root `dist/` directory. Therefore
`npm run build:perf` must be the final root-dist build before a benchmark. The
benchmark preflights `dist/perf/index.html`, every referenced asset, and the
package-export source-map provenance before launching WebDriver. It fails
immediately with the exact rebuild command when the fixture is missing or stale;
it never auto-builds, and still writes the normal failure artifacts.

Chrome and Firefox use Selenium Manager unless
`LIQUID_GLASS_CHROMEDRIVER`/`LIQUID_GLASS_GECKODRIVER` override the driver.
Browser binary overrides are `LIQUID_GLASS_CHROME_BINARY` and
`LIQUID_GLASS_FIREFOX_BINARY`. Safari always uses `/usr/bin/safaridriver`; no
Playwright WebKit fallback exists.

Local Safari requires Safari Settings → Developer → **Allow remote automation**.
If hosted `macos-15` cannot enable it through `sudo safaridriver --enable`, the
job must fail and move to a preconfigured self-hosted Mac—never relabel WebKit.

## Production demo tour

`npm run test:demo:all` builds the package and demo, serves
`examples/demo/dist`, then visits every stable `data-demo-case` with the same
branded ChromeDriver, geckodriver, and native SafariDriver sessions. The tour
asserts backend diagnostics, named keyboard/pointer controls, exactly 32 density
lenses, startup/page errors, reduced-motion CSS, duplicate IDs, accessible
control names, input names, and mobile horizontal overflow. Case screenshots,
a mobile screenshot, console output, browser identity, and the result summary
are written to `artifacts/demo-tour/<browser>`.

To tour one already-built production demo without rebuilding:

```sh
node scripts/browser-demo-tour.mjs --browser=chrome
node scripts/browser-demo-tour.mjs --browser=firefox
node scripts/browser-demo-tour.mjs --browser=safari
```

Safari uses the same render-scheduling preflight as the performance gate. Its
automation window must remain visible on an unlocked macOS console; `caffeinate`
prevents sleep but does not fake focus or replace Safari with another engine.

Every run writes raw samples, summaries, environment identity, console/driver
logs, screenshots, and ROI proofs under `artifacts/performance/<browser>`, even
on failure. Threshold JSON is versioned and provisional. Baselines never update
silently: `npm run perf:update-baselines -- --approve=true --browser=... --summary=...`
only records provenance; numeric threshold edits remain explicit review changes.

## Scroll fidelity and current 32-lens finding

Scroll scenarios use the production architecture: a fixed/bounded filtered
surface wraps an actual overflow scroller and fixed backdrop lenses live outside
it. Background-copy lenses live in the scrolling content where their viewport
relationship genuinely changes. The fixture records scroll distance and manual
geometry notifications; every scroll scenario hard-fails unless distance is
positive and `manualGeometryChanged` is exactly zero. Only scenarios that
actually move lens boxes in JavaScript call `geometryChanged()`.

An earlier transform-based fixture result was rejected because it injected 32
manual geometry syncs per frame only into the effect case. After correction, a
three-repetition branded Chrome run showed a healthy 120fps control but a
32-backdrop median near 99fps with a 0.202 calibrated drop ratio, so the
unchanged gate correctly stayed red.

The production implementation now applies the scope's aggregate physical
pixel-pass budget to that exact fixture. The controlled experiment and final
policy both select the documented performance chain (DPR 1, one displacement
pass, no live specular) once the 32-lens workload crosses the balanced threshold.
On the same branded Chrome run, the effect measured p50 8.3ms, p95 8.4ms, p99
9.4ms, max 9.5ms, 119.98fps and zero calibrated drop; control p95 was 9.2ms at
120.03fps. The unchanged threshold passed. Smaller 1- and 8-lens scenarios stay
eligible for full quality and remain separate regression gates.

## Safari painted-copy calibration

The background-copy gates intentionally use the final production copy path.
On real Safari 26.5, one balanced copy passed at p95 23ms and 46.35fps. Eight
balanced copies collapsed to p95 182ms and 5.84fps. A controlled public
`quality: "performance"` run (DPR 1, chroma/specular off) improved eight copies
to p95 43ms and 24.49fps but still failed with a 0.989 drop ratio. This rules out
pass reduction as a sufficient dense-copy policy.

Production therefore keeps WebKit copies below a provisional 1,500,000
physical pixel-pass aggregate and selects the configured native/tint fallback
above it. The threshold retains one full-quality fixture copy (~1.03M) while
8/32-copy cases degrade before timing. Chrome and Firefox have no aggregate
copy cap. The 70% exit boundary, coalesced refresh, backend transition, filter
pass removal/restoration, and diagnostics reason have structural coverage; the
unchanged real Safari gates validate the resulting behavior.
