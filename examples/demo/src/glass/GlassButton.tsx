import type { ButtonHTMLAttributes } from "react";
import type { GlassAppearanceOptions } from "@tomagranate/liquid-glass";
import { GlassOverPage } from "@tomagranate/liquid-glass/react";
import "./components.css";

export interface GlassButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. `primary` carries a brighter tint; `ghost` is near-clear. */
  variant?: "primary" | "ghost";
  /** Per-instance glass material overrides. */
  glass?: GlassAppearanceOptions;
}

const BUTTON_GLASS: GlassAppearanceOptions = {
  radius: 999,
  depth: 12,
  scale: 40,
  chroma: 0.45,
  specular: 0.4,
  rimLight: 0.9,
  tint: "rgba(255,255,255,0.08)",
  shadow: "0 8px 24px rgba(0,0,0,0.28)",
};

const VARIANT_GLASS: Record<string, GlassAppearanceOptions> = {
  primary: { tint: "rgba(255,255,255,0.26)", rimLight: 1.1 },
  ghost: { tint: "rgba(255,255,255,0.03)", rimLight: 0.7, shadow: "none" },
};

/**
 * A page-glass button. The label stays crisp and clickable.
 */
export function GlassButton({
  children,
  variant,
  glass,
  className = "",
  ...rest
}: GlassButtonProps) {
  return (
    <GlassOverPage
      as="button"
      type="button"
      className={`glassx glassx-button ${className}`}
      {...BUTTON_GLASS}
      {...(variant ? VARIANT_GLASS[variant] : undefined)}
      {...glass}
      {...rest}
    >
      <span className="glassx-button-label">{children}</span>
    </GlassOverPage>
  );
}

export default GlassButton;
