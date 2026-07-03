import {
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from "react";
import type { GlassOptions } from "@tomagranate/liquid-glass";
import { useGlass } from "@tomagranate/liquid-glass";
import { GlassCopyContext } from "./flat.ts";
import { useCopyWallpaper } from "./useCopyWallpaper.ts";
import "./components.css";

export interface GlassLensProps extends HTMLAttributes<HTMLDivElement> {
  /** Diameter, px. */
  size?: number;
  /** Per-instance glass material overrides. */
  glass?: GlassOptions;
  /** Hint label shown until the first drag. */
  hint?: string;
  /**
   * Content refraction: accessor for the page-content element the lens bends.
   * The engine keeps the {@link copy} aligned over it (refraction-target mode),
   * so real DOM content — headlines included — bends through the lens.
   * Without it the lens falls back to refracting the wallpaper (clone mode).
   */
  alignTo?: () => HTMLElement | null;
  /** A flat, inert copy of that element's content (see `GlassCopyContext`). */
  copy?: ReactNode;
}

const LENS_GLASS: GlassOptions = {
  radius: "50%",
  depth: 36,
  scale: 130,
  blur: 0,
  chroma: 0.7,
  specular: 0.5,
  rimLight: 1.1,
  tint: "rgba(255,255,255,0.03)",
  shadow: "0 30px 70px rgba(0,0,0,0.4)",
};

/**
 * A free-floating circular lens you can drag anywhere. With `alignTo` + `copy`
 * it refracts the real page content (the engine realigns the copy every frame,
 * so drag and scroll registration come for free); otherwise it bends the
 * wallpaper and the drag handler realigns the clone-mode backdrop itself.
 */
export function GlassLens(props: GlassLensProps) {
  const flat = useContext(GlassCopyContext);
  return flat ? <FlatLens {...props} /> : <LensImpl {...props} />;
}

/* Invisible same-size placeholder: keeps copy layout identical to the real
   page (the lens participates in flow on narrow viewports) without recursing
   into another content copy. */
function FlatLens({
  size = 180,
  glass: _glass,
  hint: _hint,
  alignTo: _alignTo,
  copy: _copy,
  className = "",
  style,
  ...rest
}: GlassLensProps) {
  return (
    <div
      className={`glassx glassx-lens lq ${className}`}
      style={{ width: size, height: size, visibility: "hidden", ...style }}
      {...rest}
    />
  );
}

function LensImpl({
  size = 180,
  glass,
  hint = "Drag me",
  alignTo,
  copy,
  className = "",
  style,
  ...rest
}: GlassLensProps) {
  const g = useGlass({ ...LENS_GLASS, ...glass, alignTo });
  const wallpaperRef = useCopyWallpaper(alignTo);
  const [dragged, setDragged] = useState(false);
  const pos = useRef({ x: 0, y: 0 });
  const grab = useRef<{ id: number; dx: number; dy: number } | null>(null);

  return (
    <div
      ref={g.hostRef}
      className={`glassx glassx-lens lq ${className}`}
      style={{ width: size, height: size, ...style }}
      // The backdrop copy is huge; never let find-in-page or programmatic
      // scrolling shift it inside the overflow-hidden host.
      onScroll={(e) => {
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
      onPointerDown={(e) => {
        const host = g.hostRef.current;
        if (!host) return;
        host.setPointerCapture(e.pointerId);
        grab.current = {
          id: e.pointerId,
          dx: e.clientX - pos.current.x,
          dy: e.clientY - pos.current.y,
        };
        setDragged(true);
      }}
      onPointerMove={(e) => {
        const host = g.hostRef.current;
        if (!host || grab.current?.id !== e.pointerId) return;
        pos.current = {
          x: e.clientX - grab.current.dx,
          y: e.clientY - grab.current.dy,
        };
        host.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
        // Clone mode only realigns on scroll/resize; alignTo mode ticks every
        // frame on its own.
        if (!alignTo) g.controllerRef.current?._reposition(true);
      }}
      onPointerUp={() => {
        grab.current = null;
      }}
      onPointerCancel={() => {
        grab.current = null;
      }}
      {...rest}
    >
      <div ref={g.refractionRef} className="lq-refraction">
        <div ref={g.backdropRef} className="lq-backdrop">
          {alignTo ? (
            <>
              <div ref={wallpaperRef} className="copy-wallpaper" />
              {copy}
            </>
          ) : null}
        </div>
      </div>
      <div ref={g.sheenRef} className="lq-sheen" />
      <span className="lq-content glassx-lens-hint" data-dragged={dragged}>
        {hint}
      </span>
    </div>
  );
}

export default GlassLens;
