import type { HTMLAttributes } from "react";
import type { GlassOptions } from "@tomagranate/liquid-glass";
import { Glass } from "@tomagranate/liquid-glass/react";
import "./components.css";

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Per-instance glass material overrides. */
  glass?: GlassOptions;
  /** Extra class for the inner content layer. */
  contentClassName?: string;
}

const PANEL_GLASS: GlassOptions = {
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
 * A general-purpose glass surface: cards, tiles, docks. A thin wrapper over
 * `<Glass>` — the panel sits inside the page surface, so it refracts whatever
 * is behind it (wallpaper + live content) with no extra wiring. Children ride
 * on top in a content layer and stay crisp and interactive.
 */
export function GlassPanel({
  glass,
  className = "",
  contentClassName = "",
  children,
  ...rest
}: GlassPanelProps) {
  return (
    <Glass
      className={`glassx ${className}`}
      {...PANEL_GLASS}
      {...glass}
      {...rest}
    >
      <div className={`glassx-content ${contentClassName}`}>{children}</div>
    </Glass>
  );
}

export default GlassPanel;
