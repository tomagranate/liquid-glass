# Liquid Glass implementation plans

Generated with the `improve` skill on 2026-08-14. Execute these plans in order.
Each executor must read the full plan before work starts. Update the status row
when the plan is complete.

## Recommended direction

Keep the current lens and surface design. Do not restart the project.

Change the product contract from renderer selection to clear use-case selection:

- `glass(element)` gives a safe material on every engine.
- `glassOverPage(element)` asks for an arbitrary live page. Chromium refracts it.
  Safari and Firefox use polished frost.
- `glassOverRegion(element, { region })` asks for bounded live DOM refraction.
- `glassOverMedia(element, { media })` asks for image, video, or canvas refraction.
- `glassOverWallpaper(element, css)` asks for known CSS artwork refraction.
- `glass(element)` remains the safe automatic convenience interface.

This design keeps the best parts of the branch. It also removes a false parity
promise. Parity will cover the API, shape, chrome, status, and fallback behavior.
It will not promise equal pixels from unequal browser features.

Each explicit interface has one source family. It never silently changes to a
different source family. It can reduce fidelity or use its documented fallback.

The `glassOver…` form states the visible relationship. `page` means anything
behind the lens. `region` means a marked live DOM area. `media` means an image,
video, or canvas. `wallpaper` means known CSS artwork that the library can paint
again. Keep `backdrop`, `background-copy`, and `content-svg` as internal renderer
terms only.

## Proposed interface map

| User intent | Vanilla | React | Safari and Firefox |
| --- | --- | --- | --- |
| Safe automatic glass | `glass(el)` | `<Glass>` | Best safe registered source, else frost |
| Arbitrary live page | `glassOverPage(el)` | `<GlassOverPage>` | Frost; no live displacement |
| Marked live page region | `glassOverRegion(el, { region })` | `<GlassOverRegion>` | Budgeted SVG refraction |
| Image, video, canvas | `glassOverMedia(el, { media })` | `<GlassOverMedia>` | WebGL2 refraction |
| Known CSS wallpaper | `glassOverWallpaper(el, css)` | `<GlassOverWallpaper>` | Strictly budgeted copied refraction |

## Execution order and status

| Plan | Title | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| 001 | Define the semantic effect contract | P1 | M | — | TODO |
| 002 | Build quality and performance decision gates | P1 | L | 001 | TODO |
| 003 | Implement safe semantic routing | P1 | L | 001, 002 | TODO |
| 004 | Ship the simple API and platform guide | P2 | L | 003 | TODO |

## Dependency notes

- Plan 002 uses the effect levels and platform matrix from Plan 001.
- Plan 003 uses measured limits from Plan 002. Do not guess new limits.
- Plan 004 exposes the stable router from Plan 003. Do not expose a draft router.

## Evidence behind the direction

- The public options expose `surfaces`, `track`, `background`, `dpr`, and backend
  names. See `src/core/types.ts:27-104`.
- Chromium selects the compositor route before it checks registered surfaces.
  See `src/core/glass.ts:322-329` and `src/core/glass.ts:565-600`.
- Safari and Firefox use a per-lens painted background copy by default. See
  `src/core/glass.ts:790-836` and `src/core/glass.ts:1032-1162`.
- The copy policy uses pixel-pass area. It does not use a separate lens-count
  limit. See `src/core/runtime.ts:81-107` and `src/core/runtime.ts:249-297`.
- Content surfaces already share one SVG filter. See `src/core/surfaces.ts:1-10`
  and `src/core/surfaces.ts:266-340`.
- Media surfaces already use one instanced WebGL draw. See `src/core/media.ts:1-9`
  and `src/core/liquid-glass-webgl.ts:244-258`.
- The final PR run passed standard CI and failed the real-browser gate. The run
  is https://github.com/tomagranate/liquid-glass/actions/runs/31827616264.

The final run found these important failures:

| Engine | Scenario | Measured failure |
| --- | --- | --- |
| Chrome | backdrop, 32 lenses | p95 99.40 ms; drop ratio 0.966 |
| Chrome | copied background, 8 lenses | p95 68.50 ms; drop ratio 0.730 |
| Chrome | copied background, 32 lenses | p95 283.30 ms; drop ratio 0.955 |
| Firefox | copied background, 32 lenses | p95 83.36 ms; drop ratio 0.978 |
| Safari | backdrop fixture, 32 lenses | p95 37.00 ms; drop ratio 0.371 |
| Safari | copied background, 8 lenses | p95 48.00 ms; drop ratio 0.989 |
| Safari | copied background, 32 lenses | p95 83.00 ms; drop ratio 0.989 |

The present aggregate limits do not protect these cases. Do not make the gate
green by relaxing thresholds.

## Findings considered and rejected

- **Restart the branch:** rejected. The content-surface, media, cleanup, test,
  and browser automation work remains useful.
- **Use WebGL for every page:** rejected. WebGL cannot read arbitrary live DOM
  pixels. A texture source must exist first.
- **Keep painted copies as automatic parity:** rejected. Dense copies fail all
  three engines. Safari and Firefox also have one-frame scroll alignment lag.
- **Promise equal pixels on every engine:** rejected. Only Chromium supports an
  SVG URL filter on a live backdrop.
- **Relax the performance thresholds:** rejected. The current failures are large
  and visible. A threshold change would hide a product defect.
- **Remove advanced control:** rejected. Keep it under diagnostics or an
  advanced API. Do not make renderer mechanics the primary API.
