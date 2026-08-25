# Product API v0.2 — explicit source relationships

## Status

This specification replaces the v0.1 surface-first public API. The internal
backends can keep their current names.

## Product priorities

Use this order when requirements conflict:

1. High visual quality.
2. Good page performance.
3. A simple API.
4. Cross-platform parity.
5. Clear browser differences when parity is impossible.

## Public model

A consumer selects what sits behind the glass. Each interface stays within one
source family.

| Relationship | React | Vanilla | Registration |
| --- | --- | --- | --- |
| Glass over arbitrary page content | `<GlassOverPage>` | `glassOverPage()` | None |
| Glass over a marked DOM region | `<GlassOverRegion>` | `glassOverRegion()` | `<GlassRegion>` / `createGlassRegion()` |
| Glass over image, video, or canvas | `<GlassOverMedia>` | `glassOverMedia()` | `<GlassMedia>` / `createGlassMedia()` |
| Glass over known CSS artwork | `<GlassOverWallpaper>` | `glassOverWallpaper()` | CSS string on the lens call |

`<Glass>` and `glass()` remain as automatic compatibility interfaces. They do
not define the main product model.

## Platform contract

| Relationship | Chrome | Safari | Firefox |
| --- | --- | --- | --- |
| Page | Live compositor refraction | Native frost | Native frost |
| Region | Live SVG refraction | Live SVG refraction within budget | Live SVG refraction within budget |
| Media | WebGL2 refraction | WebGL2 refraction | WebGL2 refraction |
| Wallpaper | Painted SVG refraction | Painted SVG refraction within budget | Painted SVG refraction within budget |

The page interface must not copy arbitrary page content. A missing or unsafe
source must use `blur`, `tint`, or `none` fallback behavior.

## Core API

```ts
glassOverPage(element, options?): GlassHandle;

const region = createGlassRegion(element, options?);
glassOverRegion(element, { region?, ...appearance }): GlassHandle;

const media = createGlassMedia(mediaElement, options?);
glassOverMedia(element, { media?, ...appearance }): GlassHandle;

glassOverWallpaper(element, wallpaperCss, options?): GlassHandle;
```

A named region or media lens can omit its handle. The runtime then selects
overlapping registered sources of the same type in the current scope.

## React API

```tsx
<GlassOverPage />

<GlassRegion>{content}</GlassRegion>
<GlassOverRegion />

<GlassMedia live>{media}</GlassMedia>
<GlassOverMedia />

<GlassOverWallpaper wallpaper="url(/art.webp)" />
```

The hook forms use the same names:

```ts
useGlassOverPage(ref, options?);
useGlassRegion(ref, options?);
useGlassOverRegion(ref, options?);
useGlassMedia(ref, options?);
useGlassOverMedia(ref, options?);
useGlassOverWallpaper(ref, wallpaperCss, options?);
```

## Compatibility

Keep these aliases for the next release cycle:

| Deprecated | Replacement |
| --- | --- |
| `createSurface` | `createGlassRegion` |
| `createMediaSurface` | `createGlassMedia` |
| `<GlassSurface>` | `<GlassRegion>` |
| `<GlassMediaSurface>` | `<GlassMedia>` |
| `useSurface` | `useGlassRegion` |
| `useMediaSurface` | `useGlassMedia` |

The old `surfaces` and `background` routing options remain available only on
the compatibility interface.

## Validation requirements

- Named interfaces must never switch to a different source family.
- Page glass must use frost on Safari and Firefox.
- Region and media handles must have distinct TypeScript types.
- Source registration must work inside isolated scopes.
- Existing compatibility tests must pass.
- Package tests must verify all new exports.
- Demo tours must pass in Chrome, Safari, and Firefox.
