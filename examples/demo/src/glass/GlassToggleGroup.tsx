import {
  type HTMLAttributes,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { LensMaterial } from "@tomagranate/liquid-glass";
import { useGlassLens } from "@tomagranate/liquid-glass";
import "./components.css";

export interface ToggleOption {
  value: string;
  label: ReactNode;
}

export interface GlassToggleGroupProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: ToggleOption[];
  value: string;
  onChange?: (value: string) => void;
  /** Per-instance glass material overrides for the indicator. */
  glass?: LensMaterial;
}

/**
 * A segmented control whose selection indicator is a glass lens. It glides
 * between options, refracting the live background; the labels stay crisp on top.
 */
export function GlassToggleGroup({
  options,
  value,
  onChange,
  glass,
  ...rest
}: GlassToggleGroupProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [ind, setInd] = useState({ x: 0, w: 0 });

  const canvasRef = useGlassLens(indicatorRef, {
    radius: 9999,
    depth: 7,
    scale: 26,
    chroma: 0.22,
    specular: 0.5,
    rimLight: 1,
    ...glass,
  });

  useLayoutEffect(() => {
    const node = itemRefs.current[value];
    const row = rowRef.current;
    if (!node || !row) return;
    const a = row.getBoundingClientRect();
    const b = node.getBoundingClientRect();
    setInd({ x: b.left - a.left, w: b.width });
  }, [value, options]);

  return (
    <div ref={rowRef} className="glassx glassx-toggle" role="tablist" {...rest}>
      <span
        ref={indicatorRef}
        className="glassx-toggle-indicator"
        style={{ width: ind.w, transform: `translateX(${ind.x}px)` }}
      >
        <canvas
          ref={canvasRef}
          className="glass-lens-canvas"
          aria-hidden="true"
        />
      </span>
      {options.map((opt) => (
        <button
          key={opt.value}
          ref={(n) => {
            itemRefs.current[opt.value] = n;
          }}
          className="glassx-toggle-item glass-fg"
          data-active={opt.value === value}
          role="tab"
          aria-selected={opt.value === value}
          type="button"
          onClick={() => onChange?.(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default GlassToggleGroup;
