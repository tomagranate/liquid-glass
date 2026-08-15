/**
 * React bindings for @tomagranate/liquid-glass.
 *
 * All SSR-safe: components render only the host element plus their library
 * layer children; controllers attach in `useLayoutEffect` (no `window` access
 * at render). There are no refs to wire and no class-name contract — the core
 * detects and adopts the `.lg-bg` / `.lg-sheen` layers this module renders.
 */
import {
  type ComponentPropsWithoutRef,
  createContext,
  type ElementType,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  createGlassMedia,
  createGlassRegion,
  glass,
  glassOverMedia,
  glassOverPage,
  glassOverRegion,
  glassOverWallpaper,
} from "../core/api.js";
import { createGlassScope, defaultGlassScope } from "../core/scope.js";
import type {
  GlassAppearanceOptions,
  GlassDiagnostics,
  GlassHandle,
  GlassMediaHandle,
  GlassOptions,
  GlassOverMediaOptions,
  GlassOverRegionOptions,
  GlassRegionHandle,
  GlassScope,
  GlassScopeOptions,
  GlassSourceHandle,
  MediaSurfaceOptions,
  SurfaceOptions,
} from "../core/types.js";

const GlassScopeContext = createContext<GlassScope | null>(null);

export interface GlassRootProps extends GlassScopeOptions {
  children?: ReactNode;
}

/** Isolated routing owner. Nested roots and portals retain context identity. */
export function GlassRoot({
  children,
  ...options
}: GlassRootProps): ReactElement {
  const scopeRef = useRef<GlassScope | null>(null);
  const generation = useRef(0);
  scopeRef.current ??= createGlassScope(options);
  useEffect(() => {
    const current = ++generation.current;
    return () => {
      queueMicrotask(() => {
        if (generation.current === current) scopeRef.current?.destroy();
      });
    };
  }, []);
  return (
    <GlassScopeContext.Provider value={scopeRef.current}>
      {children}
    </GlassScopeContext.Provider>
  );
}

/**
 * Poll the current root's public diagnostics snapshot. The default cadence is
 * deliberately slow enough for a compact status UI; pass `0` for a one-shot
 * snapshot and use a dedicated benchmark harness for frame-level telemetry.
 */
export function useGlassDiagnostics(interval = 500): GlassDiagnostics {
  const scoped = useContext(GlassScopeContext);
  const scope = scoped ?? defaultGlassScope;
  const [diagnostics, setDiagnostics] = useState(() => scope.getDiagnostics());

  useEffect(() => {
    if (interval <= 0) return;
    const timer = window.setInterval(
      () => setDiagnostics(scope.getDiagnostics()),
      interval,
    );
    return () => window.clearInterval(timer);
  }, [interval, scope]);

  return diagnostics;
}

/* ── option / DOM prop separation ─────────────────────────────────────────── */

/** Keys of {@link GlassOptions} — everything else on `<Glass>` is a DOM prop. */
const GLASS_OPTION_KEYS = new Set<string>([
  "radius",
  "depth",
  "scale",
  "blur",
  "chroma",
  "specular",
  "specularAngle",
  "dpr",
  "tint",
  "rimLight",
  "shadow",
  "surfaces",
  "track",
  "background",
  "preset",
  "quality",
  "fallback",
  "onBackendChange",
]);

/** Split a props bag into the glass options and the remaining host DOM props. */
function splitGlassProps(props: Record<string, unknown>): {
  opts: GlassOptions;
  dom: Record<string, unknown>;
} {
  const opts: Record<string, unknown> = {};
  const dom: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (GLASS_OPTION_KEYS.has(key)) opts[key] = props[key];
    else dom[key] = props[key];
  }
  return { opts: opts as GlassOptions, dom };
}

/**
 * Serializable material/option key. `surfaces` is an array compared by identity
 * (tracked separately as an effect dep), so it is deliberately excluded here.
 */
function glassOptionsKey(o: GlassOptions): string {
  return JSON.stringify([
    o.radius,
    o.depth,
    o.scale,
    o.blur,
    o.chroma,
    o.specular,
    o.specularAngle,
    o.dpr,
    o.tint,
    o.rimLight,
    o.shadow,
    o.track,
    o.background,
    o.preset,
    o.quality,
    o.fallback,
  ]);
}

/** Join truthy class-name parts. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ── shared lens lifecycle ────────────────────────────────────────────────── */

/**
 * Own a {@link GlassHandle} for `ref.current`: create once on mount, patch via
 * `handle.update()` on material change (never re-create), destroy on unmount.
 * Shared by {@link Glass} and {@link useGlass}.
 */
function useGlassHandle(
  ref: RefObject<HTMLElement | null>,
  opts: GlassOptions,
  request: GlassRequest = { useCase: "auto" },
): GlassHandle | null {
  const scope = useContext(GlassScopeContext);
  const [handle, setHandle] = useState<GlassHandle | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const handleRef = useRef<GlassHandle | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = createRequestedGlass(scope, el, optsRef.current, request);
    handleRef.current = h;
    setHandle(h);
    return () => {
      h.destroy();
      handleRef.current = null;
      setHandle(null);
    };
    // Created once; option changes flow through the update effect below.
  }, [
    ref,
    scope,
    request.useCase,
    request.region,
    request.media,
    request.wallpaper,
  ]);

  const key = glassOptionsKey(opts);
  useEffect(() => {
    handleRef.current?.update(optsRef.current);
  }, [key, opts.surfaces, opts.onBackendChange]);

  return handle;
}

type GlassRequest = {
  useCase: "auto" | "page" | "region" | "media" | "wallpaper";
  region?: GlassRegionHandle | readonly GlassRegionHandle[];
  media?: GlassMediaHandle | readonly GlassMediaHandle[];
  wallpaper?: string;
};

function createRequestedGlass(
  scope: GlassScope | null,
  element: HTMLElement,
  options: GlassOptions,
  request: GlassRequest,
): GlassHandle {
  if (request.useCase === "page") {
    return scope
      ? scope.glassOverPage(element, options)
      : glassOverPage(element, options);
  }
  if (request.useCase === "region") {
    const named = { ...options, region: request.region };
    return scope
      ? scope.glassOverRegion(element, named)
      : glassOverRegion(element, named);
  }
  if (request.useCase === "media") {
    const named = { ...options, media: request.media };
    return scope
      ? scope.glassOverMedia(element, named)
      : glassOverMedia(element, named);
  }
  if (request.useCase === "wallpaper") {
    const wallpaper = request.wallpaper ?? "none";
    return scope
      ? scope.glassOverWallpaper(element, wallpaper, options)
      : glassOverWallpaper(element, wallpaper, options);
  }
  return scope ? scope.glass(element, options) : glass(element, options);
}

/* ── components ───────────────────────────────────────────────────────────── */

export type GlassProps<As extends ElementType = "div"> = {
  as?: As;
  children?: ReactNode;
} & GlassOptions &
  Omit<ComponentPropsWithoutRef<As>, "as" | "children" | keyof GlassOptions>;

type ExplicitGlassProps<As extends ElementType> = Omit<
  GlassProps<As>,
  "surfaces" | "background"
>;

export type GlassOverPageProps<As extends ElementType = "div"> =
  ExplicitGlassProps<As>;

export type GlassOverRegionProps<As extends ElementType = "div"> =
  ExplicitGlassProps<As> & {
    region?: GlassRegionHandle | readonly GlassRegionHandle[];
  };

export type GlassOverMediaProps<As extends ElementType = "div"> =
  ExplicitGlassProps<As> & {
    media?: GlassMediaHandle | readonly GlassMediaHandle[];
  };

export type GlassOverWallpaperProps<As extends ElementType = "div"> =
  ExplicitGlassProps<As> & {
    wallpaper: string;
  };

/**
 * A glass lens panel. Renders the host `<As>` (default `<div>`) carrying the
 * `lg` class, with `.lg-bg` and `.lg-sheen` layer children before `{children}`;
 * the core adopts those layers. Material/option props are peeled off and passed
 * to `glass()`; every other prop is spread onto the host.
 */
export function Glass<As extends ElementType = "div">(
  props: GlassProps<As>,
): ReactElement {
  return useGlassElement(props, { useCase: "auto" });
}

/** Glass over the arbitrary live page. Safari and Firefox use the fallback. */
export function GlassOverPage<As extends ElementType = "div">(
  props: GlassOverPageProps<As>,
): ReactElement {
  return useGlassElement(props as GlassProps<As>, { useCase: "page" });
}

/** Glass over marked live DOM regions. */
export function GlassOverRegion<As extends ElementType = "div">(
  props: GlassOverRegionProps<As>,
): ReactElement {
  const { region, ...rest } = props;
  return useGlassElement(rest as unknown as GlassProps<As>, {
    useCase: "region",
    region,
  });
}

/** Glass over registered image, video, or canvas media. */
export function GlassOverMedia<As extends ElementType = "div">(
  props: GlassOverMediaProps<As>,
): ReactElement {
  const { media, ...rest } = props;
  return useGlassElement(rest as GlassProps<As>, { useCase: "media", media });
}

/** Glass over known CSS artwork that the library can paint again. */
export function GlassOverWallpaper<As extends ElementType = "div">(
  props: GlassOverWallpaperProps<As>,
): ReactElement {
  const { wallpaper, ...rest } = props;
  return useGlassElement(rest as unknown as GlassProps<As>, {
    useCase: "wallpaper",
    wallpaper,
  });
}

function useGlassElement<As extends ElementType>(
  props: GlassProps<As>,
  request: GlassRequest,
): ReactElement {
  const { as, children, className, ...rest } = props as GlassProps<As> & {
    as?: ElementType;
    className?: string;
    children?: ReactNode;
  };
  const ref = useRef<HTMLElement>(null);
  const { opts, dom } = splitGlassProps(rest as Record<string, unknown>);
  useGlassHandle(ref, opts, request);

  const Component = (as ?? "div") as ElementType;
  return (
    <Component ref={ref} className={cx("lg", className)} {...dom}>
      <div className="lg-bg" aria-hidden="true" />
      <div className="lg-sheen" aria-hidden="true" />
      {children}
    </Component>
  );
}

export type GlassRegionProps<As extends ElementType = "div"> = {
  as?: As;
  background?: boolean | string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<As>, "as" | "children" | "background">;

/**
 * Register the host subtree as a content surface (`createSurface`) so lenses
 * refract its live content in place. The core creates/adopts `.lgs-bg`.
 */
export function GlassRegion<As extends ElementType = "div">(
  props: GlassRegionProps<As>,
): ReactElement {
  const { as, background, children, className, ...rest } =
    props as GlassRegionProps<As> & {
      as?: ElementType;
      className?: string;
      children?: ReactNode;
    };
  const ref = useRef<HTMLElement>(null);
  const scope = useContext(GlassScopeContext);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = scope
      ? scope.createGlassRegion(el, { background })
      : createGlassRegion(el, { background });
    return () => handle.destroy();
  }, [background, scope]);

  const Component = (as ?? "div") as ElementType;
  return (
    <Component
      ref={ref}
      className={cx("lgs-surface", className)}
      {...(rest as Record<string, unknown>)}
    >
      {children}
    </Component>
  );
}

/** @deprecated Use {@link GlassRegion}. */
export const GlassSurface = GlassRegion;
/** @deprecated Use {@link GlassRegionProps}. */
export type GlassSurfaceProps<As extends ElementType = "div"> =
  GlassRegionProps<As>;

export type GlassMediaProps = {
  live?: boolean;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<"div">, "children">;

/**
 * Register the first `<video>`/`<canvas>`/`<img>` descendant of the host as a
 * media surface (`createMediaSurface`). Warns if none is found.
 */
export function GlassMedia(props: GlassMediaProps): ReactElement {
  const { live, children, ...rest } = props;
  const ref = useRef<HTMLDivElement>(null);
  const scope = useContext(GlassScopeContext);

  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const media = host.querySelector<
      HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
    >("video, canvas, img");
    if (!media) {
      console.warn(
        "GlassMedia: no <video>, <canvas>, or <img> descendant to register.",
      );
      return;
    }
    const handle = scope
      ? scope.createGlassMedia(media, { live })
      : createGlassMedia(media, { live });
    return () => handle.destroy();
  }, [live, scope]);

  return (
    <div ref={ref} {...rest}>
      {children}
    </div>
  );
}

/** @deprecated Use {@link GlassMedia}. */
export const GlassMediaSurface = GlassMedia;
/** @deprecated Use {@link GlassMediaProps}. */
export type GlassMediaSurfaceProps = GlassMediaProps;

/* ── hooks (escape hatches: one external ref, no markup contract) ──────────── */

/**
 * Attach a glass lens to `ref.current`. Returns the live {@link GlassHandle}
 * (null before mount) so callers can invoke `geometryChanged()` during drags.
 * Options patch through `handle.update()`; the lens is never re-created for a
 * material change.
 */
export function useGlass(
  ref: RefObject<HTMLElement | null>,
  opts: GlassOptions = {},
): GlassHandle | null {
  return useGlassHandle(ref, opts);
}

/** Attach glass that explicitly targets the arbitrary live page. */
export function useGlassOverPage(
  ref: RefObject<HTMLElement | null>,
  opts: GlassAppearanceOptions = {},
): GlassSourceHandle | null {
  return useGlassHandle(ref, opts, {
    useCase: "page",
  }) as GlassSourceHandle | null;
}

/** Attach glass that explicitly targets marked live DOM regions. */
export function useGlassOverRegion(
  ref: RefObject<HTMLElement | null>,
  opts: GlassOverRegionOptions = {},
): GlassSourceHandle | null {
  const { region, ...appearance } = opts;
  return useGlassHandle(ref, appearance, {
    useCase: "region",
    region,
  }) as GlassSourceHandle | null;
}

/** Attach glass that explicitly targets registered media. */
export function useGlassOverMedia(
  ref: RefObject<HTMLElement | null>,
  opts: GlassOverMediaOptions = {},
): GlassSourceHandle | null {
  const { media, ...appearance } = opts;
  return useGlassHandle(ref, appearance, {
    useCase: "media",
    media,
  }) as GlassSourceHandle | null;
}

/** Attach glass over known CSS artwork. */
export function useGlassOverWallpaper(
  ref: RefObject<HTMLElement | null>,
  wallpaper: string,
  opts: GlassAppearanceOptions = {},
): GlassSourceHandle | null {
  return useGlassHandle(ref, opts, {
    useCase: "wallpaper",
    wallpaper,
  }) as GlassSourceHandle | null;
}

/**
 * Register `ref.current` as a content surface. Returns the {@link SurfaceHandle}
 * (null before mount); destroyed on unmount.
 */
export function useGlassRegion(
  ref: RefObject<HTMLElement | null>,
  opts: SurfaceOptions = {},
): GlassRegionHandle | null {
  const scope = useContext(GlassScopeContext);
  const [handle, setHandle] = useState<GlassRegionHandle | null>(null);
  const { background } = opts;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = scope
      ? scope.createGlassRegion(el, { background })
      : createGlassRegion(el, { background });
    setHandle(h);
    return () => {
      h.destroy();
      setHandle(null);
    };
  }, [ref, background, scope]);

  return handle;
}

/** @deprecated Use {@link useGlassRegion}. */
export function useSurface(
  ref: RefObject<HTMLElement | null>,
  opts: SurfaceOptions = {},
): GlassRegionHandle | null {
  return useGlassRegion(ref, opts);
}

/**
 * Register `ref.current` (a `<video>`/`<canvas>`/`<img>`) as a media surface.
 * Returns the {@link SurfaceHandle} (null before mount); destroyed on unmount.
 */
export function useGlassMedia(
  ref: RefObject<
    HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null
  >,
  opts: MediaSurfaceOptions = {},
): GlassMediaHandle | null {
  const scope = useContext(GlassScopeContext);
  const [handle, setHandle] = useState<GlassMediaHandle | null>(null);
  const { live } = opts;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = scope
      ? scope.createGlassMedia(el, { live })
      : createGlassMedia(el, { live });
    setHandle(h);
    return () => {
      h.destroy();
      setHandle(null);
    };
  }, [ref, live, scope]);

  return handle;
}

/** @deprecated Use {@link useGlassMedia}. */
export function useMediaSurface(
  ref: RefObject<
    HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null
  >,
  opts: MediaSurfaceOptions = {},
): GlassMediaHandle | null {
  return useGlassMedia(ref, opts);
}
