import { type HTMLAttributes, useRef } from "react";
import type { GlassOptions } from "@tomagranate/liquid-glass";
import { useGlass, useSurface } from "@tomagranate/liquid-glass/react";
import "./components.css";

export interface GlassSwitchProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Per-instance glass material overrides for the thumb. */
  glass?: GlassOptions;
}

const THUMB_GLASS: GlassOptions = {
  radius: 999,
  depth: 5,
  scale: 12,
  chroma: 0.12,
  specular: 0.5,
  rimLight: 1,
  tint: "rgba(255,255,255,0.06)",
  shadow: "0 2px 7px rgba(0,0,0,0.35)",
};

/**
 * A glass on/off switch. The track is registered as a content surface; the
 * thumb is a glass lens sliding over it, so the track — and its on/off color
 * transition — bends in place under the thumb as it moves. The thumb slides
 * with a CSS transition, which the engine tracks automatically — no
 * `track: "live"` and no duplicate markup.
 */
export function GlassSwitch({
  checked = false,
  onChange,
  glass,
  className = "",
  ...rest
}: GlassSwitchProps) {
  const trackRef = useRef<HTMLSpanElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  useSurface(trackRef);
  useGlass(thumbRef, { ...THUMB_GLASS, background: false, ...glass });

  return (
    <div
      className={`glassx glassx-switch ${className}`}
      data-on={checked}
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange?.(!checked)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange?.(!checked);
        }
      }}
      {...rest}
    >
      <span ref={trackRef} className="glassx-switch-track" />
      <div ref={thumbRef} className="glassx-switch-thumb" />
    </div>
  );
}

export default GlassSwitch;
