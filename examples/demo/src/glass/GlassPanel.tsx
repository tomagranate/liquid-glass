import type { HTMLAttributes } from "react";
import type { GlassAppearanceOptions } from "@tomagranate/liquid-glass";
import { GlassOverPage } from "@tomagranate/liquid-glass/react";
import "./components.css";

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Per-instance glass material overrides. */
  glass?: GlassAppearanceOptions;
  /** Extra class for the inner content layer. */
  contentClassName?: string;
}

const PANEL_GLASS: GlassAppearanceOptions = {
  radius: 26,
  depth: 22,
  scale: 64,
  blur: 1.5,
  chroma: 0.5,
  specular: 0.35,
  rimLight: 0.9,
  tint: "rgba(255,255,255,0.07)",
  shadow: "0 18px 50px rgba(0,0,0,0.35)",
};

/**
 * A page-glass panel for cards, tiles, and docks. Children stay crisp.
 */
export function GlassPanel({
  glass,
  className = "",
  contentClassName = "",
  children,
  ...rest
}: GlassPanelProps) {
  return (
    <GlassOverPage
      className={`glassx ${className}`}
      {...PANEL_GLASS}
      {...glass}
      {...rest}
    >
      <div className={`glassx-content ${contentClassName}`}>{children}</div>
    </GlassOverPage>
  );
}

export default GlassPanel;
