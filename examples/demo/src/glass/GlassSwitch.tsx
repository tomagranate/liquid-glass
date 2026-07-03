import { type HTMLAttributes, useCallback, useContext, useRef } from "react";
import type { GlassOptions } from "@tomagranate/liquid-glass";
import { useGlass } from "@tomagranate/liquid-glass";
import { GlassCopyContext } from "./flat.ts";
import { useCopyWallpaper } from "./useCopyWallpaper.ts";
import "./components.css";

export interface GlassSwitchProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Per-instance glass material overrides for the thumb. */
  glass?: GlassOptions;
}

const THUMB_GLASS: GlassOptions = {
  radius: 999,
  depth: 5,
  scale: 12,
  chroma: 0.12,
  specular: 0.5,
  rimLight: 1,
  tint: "rgba(255,255,255,0.06)",
  shadow: "0 2px 7px rgba(0,0,0,0.35)",
};

/**
 * A glass on/off switch. The thumb is a transparent lens aligned to the track
 * (refraction-target mode): its backdrop holds a wallpaper slice plus a copy
 * of the track pill — same class, so the on/off colors and their transition
 * come along for free — and the thumb bends both as it slides.
 */
export function GlassSwitch(props: GlassSwitchProps) {
  const flat = useContext(GlassCopyContext);
  return flat ? <FlatSwitch {...props} /> : <SwitchImpl {...props} />;
}

function SwitchImpl({
  checked = false,
  onChange,
  glass,
  className = "",
  ...rest
}: GlassSwitchProps) {
  const trackRef = useRef<HTMLSpanElement>(null);
  const alignToTrack = useCallback(() => trackRef.current, []);
  const g = useGlass({ ...THUMB_GLASS, ...glass, alignTo: alignToTrack });
  const wallpaperRef = useCopyWallpaper(alignToTrack);

  return (
    <div
      className={`glassx glassx-switch ${className}`}
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
      <span ref={trackRef} className="glassx-switch-track" />
      <div ref={g.hostRef} className="glassx-switch-thumb lq">
        <div ref={g.refractionRef} className="lq-refraction">
          <div ref={g.backdropRef} className="lq-backdrop">
            <div ref={wallpaperRef} className="copy-wallpaper" />
            {/* Same class as the real track: inherits the on/off background
                (via the ancestor's data-on) and its color transition. */}
            <span className="glassx-switch-track" />
          </div>
        </div>
        <div ref={g.sheenRef} className="lq-sheen" />
      </div>
    </div>
  );
}

function FlatSwitch({
  checked = false,
  onChange: _onChange,
  glass: _glass,
  className = "",
  ...rest
}: GlassSwitchProps) {
  return (
    <div
      className={`glassx glassx-switch ${className}`}
      data-on={checked}
      {...rest}
    >
      <span className="glassx-switch-track" />
      <div className="glassx-switch-thumb lq glassx-flat-thumb" />
    </div>
  );
}

export default GlassSwitch;
