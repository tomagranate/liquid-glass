import type { ButtonHTMLAttributes } from "react";
import type { GlassOptions } from "@tomagranate/liquid-glass";
import { useGlass } from "@tomagranate/liquid-glass";
import "./components.css";

export interface GlassButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Per-instance glass material overrides. */
  glass?: GlassOptions;
}

const BUTTON_GLASS: GlassOptions = {
  radius: 999,
  depth: 11,
  scale: 36,
  chroma: 0.4,
  specular: 0.4,
  rimLight: 0.85,
  tint: "rgba(255,255,255,0.08)",
};

/**
 * A glass button. The whole button is a glass surface (`.lq`) that refracts the
 * page backdrop through an SVG `feDisplacementMap`; the label rides on top in
 * `.lq-content` and stays crisp and clickable.
 */
export function GlassButton({
  children,
  glass,
  className = "",
  ...rest
}: GlassButtonProps) {
  const g = useGlass<HTMLButtonElement>({ ...BUTTON_GLASS, ...glass });

  return (
    <button
      ref={g.hostRef}
      className={`glassx glassx-button lq ${className}`}
      type="button"
      {...rest}
    >
      <div ref={g.refractionRef} className="lq-refraction">
        <div ref={g.backdropRef} className="lq-backdrop" />
      </div>
      <div ref={g.sheenRef} className="lq-sheen" />
      <span className="lq-content glass-fg">{children}</span>
    </button>
  );
}

export default GlassButton;
