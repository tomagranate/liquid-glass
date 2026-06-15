import { type ButtonHTMLAttributes, useRef } from "react";
import type { LensMaterial } from "../core/types.js";
import { useGlassLens } from "./useGlassLens.js";
import "./components.css";

export interface GlassButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Per-instance glass material overrides. */
  glass?: LensMaterial;
}

/**
 * A glass button. The whole button is a lens; the {@link GlassStage} draws the
 * glass (refracting the live background) at its box, the label rides on top.
 */
export function GlassButton({
  children,
  glass,
  className = "",
  ...rest
}: GlassButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const canvasRef = useGlassLens(ref, {
    radius: 9999,
    depth: 11,
    scale: 58,
    chroma: 0.5,
    specular: 0.5,
    rimLight: 0.9,
    ...glass,
  });

  return (
    <button
      ref={ref}
      className={`glassx glassx-button ${className}`}
      type="button"
      {...rest}
    >
      <canvas
        ref={canvasRef}
        className="glass-lens-canvas"
        aria-hidden="true"
      />
      <span className="glass-fg">{children}</span>
    </button>
  );
}

export default GlassButton;
