import { type ButtonHTMLAttributes, useContext } from "react";
import type { GlassOptions } from "@tomagranate/liquid-glass";
import { useGlass } from "@tomagranate/liquid-glass";
import { GlassCopyContext } from "./flat.ts";
import "./components.css";

export interface GlassButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. `primary` carries a brighter tint; `ghost` is near-clear. */
  variant?: "primary" | "ghost";
  /** Per-instance glass material overrides. */
  glass?: GlassOptions;
}

const BUTTON_GLASS: GlassOptions = {
  radius: 999,
  depth: 12,
  scale: 40,
  chroma: 0.45,
  specular: 0.4,
  rimLight: 0.9,
  tint: "rgba(255,255,255,0.08)",
  shadow: "0 8px 24px rgba(0,0,0,0.28)",
};

const VARIANT_GLASS: Record<string, GlassOptions> = {
  primary: { tint: "rgba(255,255,255,0.26)", rimLight: 1.1 },
  ghost: { tint: "rgba(255,255,255,0.03)", rimLight: 0.7, shadow: "none" },
};

/**
 * A glass button. The whole button is a glass surface (`.lq`) that refracts the
 * page backdrop through an SVG `feDisplacementMap`; the label rides on top in
 * `.lq-content` and stays crisp and clickable.
 */
export function GlassButton(props: GlassButtonProps) {
  const flat = useContext(GlassCopyContext);
  return flat ? <FlatButton {...props} /> : <ButtonImpl {...props} />;
}

function ButtonImpl({
  children,
  variant,
  glass,
  className = "",
  ...rest
}: GlassButtonProps) {
  const g = useGlass<HTMLButtonElement>({
    ...BUTTON_GLASS,
    ...(variant ? VARIANT_GLASS[variant] : undefined),
    ...glass,
  });

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

function FlatButton({
  children,
  variant,
  glass: _glass,
  className = "",
  ...rest
}: GlassButtonProps) {
  return (
    <button
      className={`glassx glassx-button lq glassx-flat ${className}`}
      data-variant={variant}
      type="button"
      tabIndex={-1}
      {...rest}
    >
      <span className="lq-content glass-fg">{children}</span>
    </button>
  );
}

export default GlassButton;
