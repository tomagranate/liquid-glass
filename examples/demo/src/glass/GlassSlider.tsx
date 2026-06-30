import { type HTMLAttributes, useCallback, useEffect, useRef } from "react";
import type { GlassOptions } from "@tomagranate/liquid-glass";
import { useGlass } from "@tomagranate/liquid-glass";
import "./components.css";

export interface GlassSliderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  /** Per-instance glass material overrides for the thumb. */
  glass?: GlassOptions;
}

const THUMB_GLASS: GlassOptions = {
  radius: 999,
  depth: 7,
  scale: 22,
  chroma: 0.3,
  specular: 0.6,
  rimLight: 1,
  tint: "rgba(255,255,255,0.1)",
  shadow: "0 3px 10px rgba(0,0,0,0.32)",
};

/**
 * A glass slider. The thumb is a lens travelling along the track; its
 * `feDisplacementMap` refracts a copy of the track + colored fill beneath it
 * (refraction-target mode), so the fill bends through the thumb as it moves.
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
  const refSrcRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // Refract a tall, full-width source (not the thin track) so the thumb's rim
  // never samples past the colored copy into the dark page behind it.
  const g = useGlass({
    ...THUMB_GLASS,
    ...glass,
    alignTo: () => refSrcRef.current,
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
      {/* Invisible refraction source: full track width, tall enough to cover
          the thumb + displacement margin. The thumb refracts a copy of this. */}
      <div
        ref={refSrcRef}
        className="glassx-slider-refsrc"
        aria-hidden="true"
      />
      <div
        ref={g.hostRef}
        className="glassx-slider-thumb lq"
        style={{ left: `${pct}%` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          dragging.current = true;
        }}
      >
        <div ref={g.refractionRef} className="lq-refraction">
          <div ref={g.backdropRef} className="lq-backdrop glassx-track-copy">
            <div className="glassx-slider-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div ref={g.sheenRef} className="lq-sheen" />
      </div>
    </div>
  );
}

export default GlassSlider;
