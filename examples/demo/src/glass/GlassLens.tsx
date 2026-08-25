import { type HTMLAttributes, useRef, useState } from "react";
import type { GlassAppearanceOptions } from "@tomagranate/liquid-glass";
import { useGlassOverPage } from "@tomagranate/liquid-glass/react";
import "./components.css";

export interface GlassLensProps extends HTMLAttributes<HTMLDivElement> {
  /** Diameter, px. */
  size?: number;
  /** Per-instance glass material overrides. */
  glass?: GlassAppearanceOptions;
  /** Hint label shown until the first drag. */
  hint?: string;
}

const LENS_GLASS: GlassAppearanceOptions = {
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
 * A free-floating page lens. The drag handler calls `geometryChanged()` after
 * each pointer move.
 */
export function GlassLens({
  size = 200,
  glass,
  hint = "Drag me",
  className = "",
  style,
  ...rest
}: GlassLensProps) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useGlassOverPage(ref, { ...LENS_GLASS, ...glass });
  const [dragged, setDragged] = useState(false);
  const pos = useRef({ x: 0, y: 0 });
  const grab = useRef<{ id: number; dx: number; dy: number } | null>(null);

  return (
    <div
      ref={ref}
      className={`glassx glassx-lens ${className}`}
      style={{ width: size, height: size, ...style }}
      onPointerDown={(e) => {
        const el = ref.current;
        if (!el) return;
        el.setPointerCapture(e.pointerId);
        grab.current = {
          id: e.pointerId,
          dx: e.clientX - pos.current.x,
          dy: e.clientY - pos.current.y,
        };
        setDragged(true);
      }}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el || grab.current?.id !== e.pointerId) return;
        pos.current = {
          x: e.clientX - grab.current.dx,
          y: e.clientY - grab.current.dy,
        };
        el.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
        handle?.geometryChanged();
      }}
      onPointerUp={() => {
        grab.current = null;
      }}
      onPointerCancel={() => {
        grab.current = null;
      }}
      {...rest}
    >
      <span className="glassx-lens-hint" data-dragged={dragged}>
        {hint}
      </span>
    </div>
  );
}

export default GlassLens;
