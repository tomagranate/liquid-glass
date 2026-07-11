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
