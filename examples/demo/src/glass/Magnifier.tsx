import { useEffect, useRef, useState } from "react";
import { useGlassLens } from "@tomagranate/liquid-glass";
import "./components.css";

export interface MagnifierProps {
  /** lens diameter, px */
  size?: number;
}

/**
 * A magnifying-glass tool: a circle of glass that follows the cursor and
 * refracts the live page (background + content), as one more lens in the shared
 * WebGL field. It does not magnify — it bends the pixels like real glass.
 * Renders its own toggle button; press Escape to dismiss.
 */
export function Magnifier({ size = 200 }: MagnifierProps) {
  const [active, setActive] = useState(false);
  const lensRef = useRef<HTMLDivElement>(null);
  const r = size / 2;

  const canvasRef = useGlassLens(
    lensRef,
    {
      radius: 9999,
      depth: r * 0.5,
      scale: 60,
      chroma: 0.5,
      specular: 0.6,
      rimLight: 1,
      z: 9999, // composite on top of all other lenses
    },
    active,
  );

  useEffect(() => {
    if (!active) return;
    const place = (x: number, y: number) => {
      const el = lensRef.current;
      if (el) el.style.transform = `translate(${x - r}px, ${y - r}px)`;
    };
    place(window.innerWidth / 2, window.innerHeight / 2);
    const move = (e: PointerEvent) => place(e.clientX, e.clientY);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("keydown", key);
    };
  }, [active, r]);

  return (
    <>
      <button
        type="button"
        className="magnifier-toggle"
        aria-pressed={active}
        onClick={() => setActive((a) => !a)}
      >
        {active ? "✕ Put it down" : "🔍 Magnifying glass"}
      </button>
      {active && (
        <div
          ref={lensRef}
          className="magnifier-lens"
          style={{ width: size, height: size }}
        >
          <canvas
            ref={canvasRef}
            className="glass-lens-canvas"
            aria-hidden="true"
          />
        </div>
      )}
    </>
  );
}

export default Magnifier;
