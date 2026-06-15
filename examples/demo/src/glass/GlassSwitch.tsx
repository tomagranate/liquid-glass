import { type HTMLAttributes, useRef } from "react";
import type { LensMaterial } from "@tomagranate/liquid-glass";
import { useGlassLens } from "@tomagranate/liquid-glass";
import "./components.css";

export interface GlassSwitchProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Per-instance glass material overrides for the thumb. */
  glass?: LensMaterial;
}

/**
 * A glass on/off switch. The thumb is a lens that refracts the live background
 * as it slides — a moving glass highlight.
 */
export function GlassSwitch({
  checked = false,
  onChange,
  glass,
  ...rest
}: GlassSwitchProps) {
  const thumbRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useGlassLens(thumbRef, {
    radius: 9999,
    depth: 8,
    scale: 34,
    chroma: 0.35,
    specular: 0.55,
    rimLight: 1,
    ...glass,
  });

  return (
    <div
      className="glassx glassx-switch"
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
      <span className="glassx-switch-track" />
      <span ref={thumbRef} className="glassx-switch-thumb">
        <canvas
          ref={canvasRef}
          className="glass-lens-canvas"
          aria-hidden="true"
        />
      </span>
    </div>
  );
}

export default GlassSwitch;
