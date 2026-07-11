import type { ButtonHTMLAttributes } from "react";
import type { GlassOptions } from "@tomagranate/liquid-glass";
import { Glass } from "@tomagranate/liquid-glass/react";
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
 * A glass button: one `<Glass>` panel refracting whatever is behind it. The
 * label rides on top and stays crisp and clickable.
 */
export function GlassButton({
  children,
  variant,
  glass,
  className = "",
  ...rest
}: GlassButtonProps) {
  return (
    <Glass
      as="button"
      type="button"
      className={`glassx glassx-button ${className}`}
      {...BUTTON_GLASS}
      {...(variant ? VARIANT_GLASS[variant] : undefined)}
      {...glass}
      {...rest}
    >
      <span className="glassx-button-label">{children}</span>
    </Glass>
  );
}

export default GlassButton;
