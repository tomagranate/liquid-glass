import {
  type HTMLAttributes,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { GlassOptions } from "@tomagranate/liquid-glass";
import { useGlass } from "@tomagranate/liquid-glass";
import { GlassCopyContext } from "./flat.ts";
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
  depth: 6,
  scale: 15,
  chroma: 0.25,
  specular: 0.6,
  rimLight: 1,
  tint: "rgba(255,255,255,0.14)",
  shadow: "0 3px 10px rgba(0,0,0,0.32)",
};

/* Squished-bar colors: fill matches `.glassx-slider-fill`, remainder matches
   the translucent `.glassx-slider-track` — the wallpaper shows through it. */
const MINI_FILL = "rgba(255, 255, 255, 0.95)";
const MINI_TRACK = "rgba(255, 255, 255, 0.18)";

/**
 * A glass slider. The thumb refracts the wallpaper (clone mode) under the
 * *entire bar squished into the thumb*: a translucent hard-stop gradient whose
 * boundary sits at the current value, so the progress sweeps across the inside
 * of the lens as you drag while the page keeps showing through the unfilled
 * side. Updating the overlay is a pure CSS restyle — no filter rebuilds.
 */
export function GlassSlider(props: GlassSliderProps) {
  const flat = useContext(GlassCopyContext);
  return flat ? <FlatSlider {...props} /> : <SliderImpl {...props} />;
}

function FlatSlider({
  value,
  min = 0,
  max = 100,
  step: _step,
  onChange: _onChange,
  glass: _glass,
  className = "",
  ...rest
}: GlassSliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={`glassx glassx-slider ${className}`} {...rest}>
      <div className="glassx-slider-track">
        <div className="glassx-slider-fill" style={{ width: `${pct}%` }} />
      </div>
      <div
        className="glassx-slider-thumb lq glassx-flat-thumb"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

function SliderImpl({
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
  const dragging = useRef(false);
  const pct = ((value - min) / (max - min)) * 100;

  // The engine sizes the backdrop to the thumb box plus its sampling margin
  // (`0.4 * size + scale` per side) and paints the wallpaper into it (clone
  // mode). The squished bar rides on top as a translucent overlay, mapped so
  // its 0..100% range spans exactly the visible thumb window, with the end
  // colors extended through the margins so the rim never samples past it.
  const [thumbSize, setThumbSize] = useState(30);
  const scale = glass?.scale ?? THUMB_GLASS.scale ?? 15;
  const margin = Math.ceil(0.4 * thumbSize + scale);
  const boxSize = thumbSize + 2 * margin;
  const windowStart = (margin / boxSize) * 100;
  const windowSpan = (thumbSize / boxSize) * 100;
  const boundary = windowStart + (windowSpan * pct) / 100;
  const g = useGlass({ ...THUMB_GLASS, ...glass });

  useLayoutEffect(() => {
    const thumb = g.hostRef.current;
    if (thumb) setThumbSize(thumb.getBoundingClientRect().width || 30);
  }, [g.hostRef]);

  // Clone mode only realigns the wallpaper on scroll/resize; the thumb also
  // moves with the value, so realign whenever it does.
  useLayoutEffect(() => {
    g.controllerRef.current?._reposition(true);
  }, [pct, g.controllerRef]);

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
        ref={g.hostRef}
        className="glassx-slider-thumb lq"
        style={{ left: `${pct}%` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          dragging.current = true;
        }}
      >
        <div ref={g.refractionRef} className="lq-refraction">
          <div ref={g.backdropRef} className="lq-backdrop">
            <div
              className="glassx-thumb-bar"
              style={{
                background: `linear-gradient(90deg, ${MINI_FILL} 0%, ${MINI_FILL} ${boundary}%, ${MINI_TRACK} ${boundary}%, ${MINI_TRACK} 100%)`,
              }}
            />
          </div>
        </div>
        <div ref={g.sheenRef} className="lq-sheen" />
      </div>
    </div>
  );
}

export default GlassSlider;
