import { type HTMLAttributes, useCallback, useEffect, useRef } from "react";
import type { LensMaterial } from "../core/types.js";
import { useGlassLens } from "./useGlassLens.js";
import "./components.css";

export interface GlassSliderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  /** Per-instance glass material overrides for the thumb. */
  glass?: LensMaterial;
}

/**
 * A glass slider. The thumb is a lens travelling along the track, refracting the
 * live background beneath it; the value stays readable through the glass.
 */
export function GlassSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  glass,
  ...rest
}: GlassSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);

  const canvasRef = useGlassLens(thumbRef, {
    radius: 9999,
    depth: 9,
    scale: 42,
    chroma: 0.3,
    specular: 0.6,
    rimLight: 1,
    ...glass,
  });

  const pct = ((value - min) / (max - min)) * 100;

  const setFromX = useCallback(
    (clientX: number) => {
      const t = trackRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      let v = min + f * (max - min);
      v = Math.round(v / step) * step;
      onChange?.(Math.min(max, Math.max(min, v)));
    },
    [min, max, step, onChange],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (dragging.current) setFromX(e.clientX);
    };
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [setFromX]);

  return (
    <div
      className="glassx glassx-slider"
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowDown")
          onChange?.(Math.max(min, value - step));
        if (e.key === "ArrowRight" || e.key === "ArrowUp")
          onChange?.(Math.min(max, value + step));
      }}
      {...rest}
    >
      <div
        ref={trackRef}
        className="glassx-slider-track"
        onPointerDown={(e) => {
          dragging.current = true;
          setFromX(e.clientX);
        }}
      >
        <div className="glassx-slider-fill" style={{ width: `${pct}%` }} />
      </div>
      <span
        ref={thumbRef}
        className="glassx-slider-thumb"
        style={{ left: `${pct}%` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          dragging.current = true;
        }}
      >
        <canvas
          ref={canvasRef}
          className="glass-lens-canvas"
          aria-hidden="true"
        />
      </span>
    </div>
  );
}

export default GlassSlider;
