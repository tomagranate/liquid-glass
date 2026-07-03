import { type HTMLAttributes, useContext } from "react";
import type { GlassOptions } from "@tomagranate/liquid-glass";
import { useGlass } from "@tomagranate/liquid-glass";
import { GlassCopyContext } from "./flat.ts";
import "./components.css";

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Per-instance glass material overrides. */
  glass?: GlassOptions;
  /** Extra class for the content layer (`.lq-content`). */
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
 * A general-purpose glass surface: cards, tiles, docks. The panel is one `.lq`
 * surface refracting the page backdrop; children ride on top in `.lq-content`
 * and stay crisp and interactive.
 */
export function GlassPanel(props: GlassPanelProps) {
  const flat = useContext(GlassCopyContext);
  return flat ? <FlatPanel {...props} /> : <PanelImpl {...props} />;
}

function PanelImpl({
  glass,
  className = "",
  contentClassName = "",
  children,
  ...rest
}: GlassPanelProps) {
  const g = useGlass({ ...PANEL_GLASS, ...glass });

  return (
    <div ref={g.hostRef} className={`glassx lq ${className}`} {...rest}>
      <div ref={g.refractionRef} className="lq-refraction">
        <div ref={g.backdropRef} className="lq-backdrop" />
      </div>
      <div ref={g.sheenRef} className="lq-sheen" />
      <div className={`lq-content ${contentClassName}`}>{children}</div>
    </div>
  );
}

function FlatPanel({
  glass: _glass,
  className = "",
  contentClassName = "",
  children,
  ...rest
}: GlassPanelProps) {
  return (
    <div className={`glassx lq glassx-flat ${className}`} {...rest}>
      <div className={`lq-content ${contentClassName}`}>{children}</div>
    </div>
  );
}

export default GlassPanel;
