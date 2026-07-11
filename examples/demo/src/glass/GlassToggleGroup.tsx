import {
  type HTMLAttributes,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { GlassOptions } from "@tomagranate/liquid-glass";
import { useGlass, useSurface } from "@tomagranate/liquid-glass/react";
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
}

const PILL_GLASS: GlassOptions = {
  radius: 999,
  depth: 6,
  scale: 16,
  chroma: 0.2,
  specular: 0.5,
  rimLight: 1,
  tint: "rgba(255,255,255,0.09)",
  shadow: "0 2px 10px rgba(0,0,0,0.28)",
};

/**
 * A segmented control whose selection indicator is a glass lens. The row of
 * labels is a content surface; the pill is a `<Glass>` sibling that slides over
 * it, so the label under the pill bends in place as the selection moves. The
 * slide is a CSS transition, tracked automatically by the engine — no filter
 * rebuilds, no duplicated copy of the row.
 */
export function GlassToggleGroup({
  options,
  value,
  onChange,
  className = "",
  ...rest
}: GlassToggleGroupProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState({ left: 0, width: 0 });

  useSurface(trackRef);
  const handle = useGlass(pillRef, { ...PILL_GLASS, background: false });

  useLayoutEffect(() => {
    const measure = () => {
      const row = rowRef.current;
      const el = itemRefs.current[value];
      if (!row || !el) return;
      const rowRect = row.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setPill({ left: r.left - rowRect.left, width: r.width });
      handle?.geometryChanged();
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, options, handle]);

  return (
    <div
      ref={rowRef}
      className={`glassx glassx-toggle ${className}`}
      role="tablist"
      {...rest}
    >
      <div ref={trackRef} className="glassx-toggle-track">
        {options.map((opt) => (
          <button
            key={opt.value}
            ref={(n) => {
              itemRefs.current[opt.value] = n;
            }}
            className="glassx-toggle-item"
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
      <div
        ref={pillRef}
        className="glassx-toggle-pill"
        aria-hidden="true"
        style={{
          width: pill.width,
          transform: `translateX(${pill.left}px)`,
        }}
      />
    </div>
  );
}

export default GlassToggleGroup;
