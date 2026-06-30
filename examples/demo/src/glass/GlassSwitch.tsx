import type { HTMLAttributes } from "react";
import type { GlassOptions } from "@tomagranate/liquid-glass";
import { useGlass } from "@tomagranate/liquid-glass";
import "./components.css";

const TRACK_ON = "linear-gradient(180deg, #5fd08a, #36b06a)";
const TRACK_OFF = "linear-gradient(180deg, #6c6f80, #494c5e)";

export interface GlassSwitchProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Per-instance glass material overrides for the thumb. */
  glass?: GlassOptions;
}

const THUMB_GLASS: GlassOptions = {
  radius: 999,
  depth: 6,
  scale: 18,
  chroma: 0.3,
  specular: 0.5,
  rimLight: 1,
  tint: "rgba(255,255,255,0.12)",
  shadow: "0 2px 7px rgba(0,0,0,0.35)",
};

/**
 * A glass on/off switch. The thumb is a glass lens whose `feDisplacementMap`
 * refracts the track color beneath it. The area under the thumb is a single
 * color, so it refracts a solid backdrop — no edge for the rim to over-sample.
 */
export function GlassSwitch({
  checked = false,
  onChange,
  glass,
  ...rest
}: GlassSwitchProps) {
  const g = useGlass({
    ...THUMB_GLASS,
    ...glass,
    backdrop: checked ? TRACK_ON : TRACK_OFF,
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
      <div ref={g.hostRef} className="glassx-switch-thumb lq">
        <div ref={g.refractionRef} className="lq-refraction">
          <div ref={g.backdropRef} className="lq-backdrop" />
        </div>
        <div ref={g.sheenRef} className="lq-sheen" />
      </div>
    </div>
  );
}

export default GlassSwitch;
