import { useContext, useEffect } from "react";
import { useGlass } from "@tomagranate/liquid-glass";
import { GlassCopyContext } from "./flat.ts";
import "./components.css";

interface DropSpec {
  /** Horizontal position, % of stage width. */
  x: number;
  /** Diameter, px. */
  size: number;
  /** Fall speed, px/s. */
  speed: number;
  /** Starting phase, 0..1 of the wrap range, so drops never fall in lockstep. */
  offset: number;
  /** Horizontal sway amplitude, px. */
  sway: number;
}

const DROPS: DropSpec[] = [
  { x: 5, size: 34, speed: 120, offset: 0.1, sway: 10 },
  { x: 14, size: 58, speed: 70, offset: 0.55, sway: 6 },
  { x: 25, size: 24, speed: 150, offset: 0.8, sway: 12 },
  { x: 35, size: 44, speed: 95, offset: 0.3, sway: 8 },
  { x: 46, size: 72, speed: 55, offset: 0.7, sway: 5 },
  { x: 57, size: 28, speed: 135, offset: 0.15, sway: 12 },
  { x: 66, size: 50, speed: 85, offset: 0.5, sway: 7 },
  { x: 76, size: 36, speed: 110, offset: 0.9, sway: 10 },
  { x: 86, size: 62, speed: 62, offset: 0.35, sway: 6 },
  { x: 93, size: 26, speed: 140, offset: 0.65, sway: 12 },
];

/**
 * A dozen glass droplets in free fall over the wallpaper. Each droplet is its
 * own clone-mode surface; per animation frame it gets one transform write and
 * one backdrop realignment — no repaints, no filter rebuilds. Honors
 * `prefers-reduced-motion` by scattering the drops statically instead.
 */
export function GlassRain() {
  const flat = useContext(GlassCopyContext);
  // In refraction copies the stage stays empty: animated positions can't be
  // mirrored faithfully, and static look-alikes would lie. Height matches so
  // copy layout stays registered.
  if (flat) return <div className="glassx glassx-rain" aria-hidden="true" />;
  return (
    <div className="glassx glassx-rain" aria-hidden="true">
      {DROPS.map((d) => (
        <RainDrop key={d.x} {...d} />
      ))}
    </div>
  );
}

function RainDrop({ x, size, speed, offset, sway }: DropSpec) {
  const g = useGlass({
    radius: "50%",
    depth: Math.round(Math.min(20, Math.max(7, size * 0.32))),
    scale: Math.round(size * 1.1),
    blur: 0,
    chroma: 0.55,
    specular: 0.45,
    rimLight: 0.9,
    tint: "rgba(255,255,255,0.04)",
    shadow: "none",
  });

  useEffect(() => {
    const host = g.hostRef.current;
    const stage = host?.parentElement;
    if (!host || !stage) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const y = offset * Math.max(0, stage.clientHeight - size);
      host.style.transform = `translate(0px, ${y}px)`;
      g.controllerRef.current?._reposition(true);
      return;
    }

    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = (now - t0) / 1000;
      // Wrap through [-size, stage height]: the teleport happens off-view at
      // both ends (the stage clips overflow).
      const range = stage.clientHeight + size;
      const y = ((offset * range + t * speed) % range) - size;
      const dx = Math.sin(t * 0.9 + offset * 7) * sway;
      host.style.transform = `translate(${dx}px, ${y}px)`;
      g.controllerRef.current?._reposition(true);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [size, speed, offset, sway, g.hostRef, g.controllerRef]);

  return (
    <div
      ref={g.hostRef}
      className="glassx-raindrop lq"
      style={{ left: `${x}%`, width: size, height: size }}
    >
      <div ref={g.refractionRef} className="lq-refraction">
        <div ref={g.backdropRef} className="lq-backdrop" />
      </div>
      <div ref={g.sheenRef} className="lq-sheen" />
    </div>
  );
}

export default GlassRain;
