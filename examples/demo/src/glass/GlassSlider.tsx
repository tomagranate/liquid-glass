import {
  type HTMLAttributes,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import type { GlassAppearanceOptions } from "@tomagranate/liquid-glass";
import {
  useGlassOverRegion,
  useGlassRegion,
} from "@tomagranate/liquid-glass/react";
import "./components.css";

export interface GlassSliderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  /** Per-instance glass material overrides for the thumb. */
  glass?: GlassAppearanceOptions;
}

const THUMB_GLASS: GlassAppearanceOptions = {
  radius: 999,
  depth: 6,
  scale: 15,
  chroma: 0.25,
  specular: 0.6,
  rimLight: 1,
  tint: "rgba(255,255,255,0.14)",
  shadow: "0 3px 10px rgba(0,0,0,0.32)",
};

/**
 * A glass slider. The track (fill + rail) is a content surface; the thumb is a
 * glass lens riding over it, so the filled bar bends in place under the thumb
 * as it slides. The thumb jumps with the value (no CSS transition), so the
 * value effect nudges `geometryChanged()` after each change.
 */
export function GlassSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  glass,
  className = "",
  ...rest
}: GlassSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  useGlassRegion(trackRef);
  const handle = useGlassOverRegion(thumbRef, {
    ...THUMB_GLASS,
    ...glass,
  });

  const pct = ((value - min) / (max - min)) * 100;

  // The thumb repositions instantly with the value; tell the lens it moved.
  useLayoutEffect(() => {
    handle?.geometryChanged();
  }, [pct, handle]);

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
      className={`glassx glassx-slider ${className}`}
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
      <div
        ref={thumbRef}
        className="glassx-slider-thumb"
        style={{ left: `${pct}%` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          dragging.current = true;
        }}
      />
    </div>
  );
}

export default GlassSlider;
