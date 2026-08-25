# @tomagranate/liquid-glass

High-quality liquid glass for the web. The API names the content behind each
glass element. This makes browser differences clear before you ship.

The library has four explicit interfaces:

| Source behind the glass | React | Vanilla | Chrome | Safari and Firefox |
| --- | --- | --- | --- | --- |
| Arbitrary live page | `<GlassOverPage>` | `glassOverPage()` | Live refraction | Polished frost |
| Marked live DOM region | `<GlassOverRegion>` | `glassOverRegion()` | Live refraction | Live refraction within budget |
| Registered image, video, or canvas | `<GlassOverMedia>` | `glassOverMedia()` | WebGL2 refraction | WebGL2 refraction |
| Known CSS wallpaper | `<GlassOverWallpaper>` | `glassOverWallpaper()` | Painted refraction | Painted refraction within budget |

This split is deliberate. Safari and Firefox cannot refract arbitrary page
content with the Chromium compositor route. Page glass uses a stable frost on
those browsers. The library never presents a wallpaper copy as live page
refraction.

## Install

```sh
npm install @tomagranate/liquid-glass
```

Import the stylesheet once:

```ts
import "@tomagranate/liquid-glass/styles.css";
```

## React quick start

### Glass over the page

Use this for navigation, floating controls, and overlays.

```tsx
import { GlassOverPage } from "@tomagranate/liquid-glass/react";

export function Navigation() {
  return (
    <GlassOverPage as="nav" radius={999} preset="thin">
      <a href="/">Home</a>
    </GlassOverPage>
  );
}
```

Chrome refracts the live page. Safari and Firefox render polished frost.

### Glass over a live region

Use this when a bounded DOM region must refract in all supported browsers.
Keep the lens outside the marked region subtree. The elements can overlap with
CSS positioning.

```tsx
import {
  GlassOverRegion,
  GlassRegion,
} from "@tomagranate/liquid-glass/react";

export function ChartLens() {
  return (
    <div className="stage">
      <GlassRegion className="chart">Live chart content</GlassRegion>
      <GlassOverRegion className="lens" radius={24}>
        42.8%
      </GlassOverRegion>
    </div>
  );
}
```

Pass a handle when one lens must target one region:

```tsx
const region = useGlassRegion(regionRef);
useGlassOverRegion(lensRef, { region, radius: 24 });
```

### Glass over media

Use this for an image, video, or canvas. The media needs the same origin or
valid CORS headers.

```tsx
import {
  GlassMedia,
  GlassOverMedia,
} from "@tomagranate/liquid-glass/react";

export function Player() {
  return (
    <GlassMedia live className="player">
      <video src="/coast.mp4" muted loop playsInline />
      <GlassOverMedia as="button" radius="50%">
        Play
      </GlassOverMedia>
    </GlassMedia>
  );
}
```

Set `live` for video or animated canvas. Leave it off for static images.

### Glass over known wallpaper

Use this only when the CSS artwork is known and safe to paint again.

```tsx
import { GlassOverWallpaper } from "@tomagranate/liquid-glass/react";

<GlassOverWallpaper wallpaper="url(/brand-art.webp)" radius={28}>
  Brand card
</GlassOverWallpaper>;
```

## Vanilla quick start

```ts
import {
  createGlassMedia,
  createGlassRegion,
  glassOverMedia,
  glassOverPage,
  glassOverRegion,
  glassOverWallpaper,
} from "@tomagranate/liquid-glass";

const pageGlass = glassOverPage(document.querySelector("nav")!);

const region = createGlassRegion(document.querySelector(".chart")!);
const regionGlass = glassOverRegion(document.querySelector(".chart-lens")!, {
  region,
  radius: 24,
});

const media = createGlassMedia(document.querySelector("video")!, {
  live: true,
});
const mediaGlass = glassOverMedia(document.querySelector(".play")!, { media });

const artGlass = glassOverWallpaper(
  document.querySelector(".brand-card")!,
  "url(/brand-art.webp)",
);
```

Each function returns a `GlassHandle`:

```ts
handle.update({ tint: "rgba(255,255,255,.1)" });
handle.geometryChanged();
handle.refresh();
handle.destroy();
```

Call `geometryChanged()` after JavaScript moves a lens. CSS transitions and
normal scroll changes are tracked automatically.

## React API

| API | Purpose |
| --- | --- |
| `<GlassOverPage>` | Glass over arbitrary page content. |
| `<GlassRegion>` | Mark a live DOM region as a source. |
| `<GlassOverRegion>` | Glass over marked live DOM regions. |
| `<GlassMedia>` | Register the first image, video, or canvas child. |
| `<GlassOverMedia>` | Glass over registered media. |
| `<GlassOverWallpaper wallpaper="…">` | Glass over known CSS artwork. |
| `useGlassOverPage(ref, options)` | Attach page glass to an existing element. |
| `useGlassRegion(ref, options)` | Register an existing DOM region. |
| `useGlassOverRegion(ref, options)` | Attach region glass to an existing element. |
| `useGlassMedia(ref, options)` | Register existing media. |
| `useGlassOverMedia(ref, options)` | Attach media glass to an existing element. |
| `useGlassOverWallpaper(ref, wallpaper, options)` | Attach wallpaper glass to an existing element. |
| `<GlassRoot>` | Create an isolated scope with shared defaults and budgets. |
| `useGlassDiagnostics()` | Read stable runtime counters and policy decisions. |

All lens components accept normal DOM props and these material options:

```ts
type GlassAppearanceOptions = {
  radius?: number | string;
  depth?: number;
  scale?: number;
  blur?: number;
  chroma?: number;
  specular?: number;
  specularAngle?: number;
  dpr?: number;
  tint?: string;
  rimLight?: number;
  shadow?: string;
  preset?: "thin" | "regular" | "prominent";
  quality?: "performance" | "balanced" | "fidelity";
  fallback?: "blur" | "tint" | "none";
  track?: "auto" | "live";
  onBackendChange?: (backends: readonly GlassBackend[]) => void;
};
```

## Vanilla API

| API | Purpose |
| --- | --- |
| `glassOverPage(element, options?)` | Create page glass. |
| `createGlassRegion(element, options?)` | Mark a live DOM region. |
| `glassOverRegion(element, options?)` | Create region glass. |
| `createGlassMedia(media, options?)` | Register image, video, or canvas media. |
| `glassOverMedia(element, options?)` | Create media glass. |
| `glassOverWallpaper(element, wallpaper, options?)` | Create wallpaper glass. |
| `createGlassScope(options?)` | Create an isolated owner for sources and lenses. |
| `setBackground(cssOrNull)` | Set known CSS artwork for the compatibility API. |

`glass(element, options?)` remains as the automatic compatibility interface.
It selects overlapping registered sources. It uses page glass when Chrome can
support it. Otherwise, it uses frost. It does not copy an unmarked page.

The old source names remain as deprecated aliases:

| Deprecated | Replacement |
| --- | --- |
| `createSurface` | `createGlassRegion` |
| `createMediaSurface` | `createGlassMedia` |
| `<GlassSurface>` | `<GlassRegion>` |
| `<GlassMediaSurface>` | `<GlassMedia>` |
| `useSurface` | `useGlassRegion` |
| `useMediaSurface` | `useGlassMedia` |

## Quality and performance

The runtime selects a backend for each lens. It also enforces aggregate area
budgets. Large or dense effects reduce detail before they use a fallback.

- `performance` uses less filter detail.
- `balanced` is the default.
- `fidelity` keeps more detail when the budget permits it.
- `fallback="blur"` keeps a readable frosted material.
- `fallback="tint"` keeps only the tint film.
- `fallback="none"` removes the effect when refraction cannot run.

Keep marked regions bounded. Pause media while it is off-screen. Prefer page
glass when exact refraction is not required on Safari and Firefox.

## Browser support

| Interface | Chrome | Safari | Firefox |
| --- | --- | --- | --- |
| Page | Live compositor refraction | Native frost | Native frost |
| Region | SVG refraction | SVG refraction within budget | SVG refraction within budget |
| Media | WebGL2 | WebGL2 | WebGL2 |
| Wallpaper | Painted copy | Painted copy within budget | Painted copy within budget |

The native fallback keeps tint, edge light, radius, and shadow. It does not
claim refraction where the browser cannot provide it.

## Limits

- A region lens cannot be inside the region that it refracts. Use overlapping
  siblings.
- Media needs WebGL2 and readable source pixels.
- Region and wallpaper effects have stricter budgets on Safari and Firefox.
- A transformed ancestor can change browser compositing behavior.
- Very small elements skip refraction.

## Development

```sh
npm install
npm run dev
npm run typecheck
npm run lint
npm run test:unit
npm run test:browser
npm run test:package
```

Use `npm run test:demo:all` for the cross-browser demo tour.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for backend details.

## License

MIT
