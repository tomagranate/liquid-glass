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
  type ElementType,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { glass } from "../core/glass.js";
import { createMediaSurface } from "../core/media.js";
import { createSurface } from "../core/surfaces.js";
import type {
  GlassHandle,
  GlassOptions,
  MediaSurfaceOptions,
  SurfaceHandle,
  SurfaceOptions,
} from "../core/types.js";

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
): GlassHandle | null {
  const [handle, setHandle] = useState<GlassHandle | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const handleRef = useRef<GlassHandle | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = glass(el, optsRef.current);
    handleRef.current = h;
    setHandle(h);
    return () => {
      h.destroy();
      handleRef.current = null;
      setHandle(null);
    };
    // Created once; option changes flow through the update effect below.
  }, [ref]);

  const key = glassOptionsKey(opts);
  useEffect(() => {
    handleRef.current?.update(optsRef.current);
  }, [key, opts.surfaces, opts.onBackendChange]);

  return handle;
}

/* ── components ───────────────────────────────────────────────────────────── */

export type GlassProps<As extends ElementType = "div"> = {
  as?: As;
  children?: ReactNode;
} & GlassOptions &
  Omit<ComponentPropsWithoutRef<As>, "as" | "children" | keyof GlassOptions>;

/**
 * A glass lens panel. Renders the host `<As>` (default `<div>`) carrying the
 * `lg` class, with `.lg-bg` and `.lg-sheen` layer children before `{children}`;
 * the core adopts those layers. Material/option props are peeled off and passed
 * to `glass()`; every other prop is spread onto the host.
 */
export function Glass<As extends ElementType = "div">(
  props: GlassProps<As>,
): ReactElement {
  const { as, children, className, ...rest } = props as GlassProps<As> & {
    as?: ElementType;
    className?: string;
    children?: ReactNode;
  };
  const ref = useRef<HTMLElement>(null);
  const { opts, dom } = splitGlassProps(rest as Record<string, unknown>);
  useGlassHandle(ref, opts);

  const Component = (as ?? "div") as ElementType;
  return (
    <Component ref={ref} className={cx("lg", className)} {...dom}>
      <div className="lg-bg" aria-hidden="true" />
      <div className="lg-sheen" aria-hidden="true" />
      {children}
    </Component>
  );
}

export type GlassSurfaceProps<As extends ElementType = "div"> = {
  as?: As;
  background?: boolean | string;
  routing?: SurfaceOptions["routing"];
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<As>, "as" | "children" | "background">;

/**
 * Register the host subtree as a content surface (`createSurface`) so lenses
 * refract its live content in place. The core creates/adopts `.lgs-bg`.
 */
export function GlassSurface<As extends ElementType = "div">(
  props: GlassSurfaceProps<As>,
): ReactElement {
  const { as, background, routing, children, className, ...rest } =
    props as GlassSurfaceProps<As> & {
      as?: ElementType;
      className?: string;
      children?: ReactNode;
    };
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = createSurface(el, { background, routing });
    return () => handle.destroy();
  }, [background, routing]);

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

export type GlassMediaSurfaceProps = {
  live?: boolean;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<"div">, "children">;

/**
 * Register the first `<video>`/`<canvas>`/`<img>` descendant of the host as a
 * media surface (`createMediaSurface`). Warns if none is found.
 */
export function GlassMediaSurface(props: GlassMediaSurfaceProps): ReactElement {
  const { live, children, ...rest } = props;
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const media = host.querySelector<
      HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
    >("video, canvas, img");
    if (!media) {
      console.warn(
        "GlassMediaSurface: no <video>, <canvas>, or <img> descendant to register.",
      );
      return;
    }
    const handle = createMediaSurface(media, { live });
    return () => handle.destroy();
  }, [live]);

  return (
    <div ref={ref} {...rest}>
      {children}
    </div>
  );
}

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

/**
 * Register `ref.current` as a content surface. Returns the {@link SurfaceHandle}
 * (null before mount); destroyed on unmount.
 */
export function useSurface(
  ref: RefObject<HTMLElement | null>,
  opts: SurfaceOptions = {},
): SurfaceHandle | null {
  const [handle, setHandle] = useState<SurfaceHandle | null>(null);
  const { background, routing } = opts;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = createSurface(el, { background, routing });
    setHandle(h);
    return () => {
      h.destroy();
      setHandle(null);
    };
  }, [ref, background, routing]);

  return handle;
}

/**
 * Register `ref.current` (a `<video>`/`<canvas>`/`<img>`) as a media surface.
 * Returns the {@link SurfaceHandle} (null before mount); destroyed on unmount.
 */
export function useMediaSurface(
  ref: RefObject<
    HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null
  >,
  opts: MediaSurfaceOptions = {},
): SurfaceHandle | null {
  const [handle, setHandle] = useState<SurfaceHandle | null>(null);
  const { live } = opts;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = createMediaSurface(el, { live });
    setHandle(h);
    return () => {
      h.destroy();
      setHandle(null);
    };
  }, [ref, live]);

  return handle;
}
