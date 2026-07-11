# Real-browser performance gate

This fixture is a production Vite build that imports only
`@tomagranate/liquid-glass` package exports after `npm run build`. It must never
gain a `src/` alias. The retained Vitest/Playwright suite is fast structural
coverage; this lane exclusively uses branded W3C WebDriver sessions.

Run `npm run build && npm run build:perf`, then one of `npm run perf:chrome`,
`perf:firefox`, `perf:safari`, or `perf:all`. Add `-- --quick=true` for the
90-frame, three-repetition PR profile. Full runs collect at least 600 rAF frames
over five repetitions, with two warmups and alternating control/effect order.

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
