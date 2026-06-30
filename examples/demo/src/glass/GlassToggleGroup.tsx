import {
  type HTMLAttributes,
  type ReactNode,
  useLayoutEffect,
  useRef,
} from "react";
import {
  buildGlassFilter,
  generateDisplacementMap,
  moveFilterLens,
} from "@tomagranate/liquid-glass";
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

/** Flat-grey margin around the lens shape, so its bend fades out before the box
 *  edge and blends seamlessly into the static surface around it. */
const INSET = 8;
/** Margin around the surface the backdrop copy extends, so the filter's sample
 *  region (which reaches ~30% past each edge, plus `scale` px of displacement)
 *  always reads real pixels. Kept small — a viewport-sized source graphic is too
 *  big/complex for Safari's filter and stalls it. */
const BACKDROP_MARGIN = 140;
const MAT = { depth: 6, scale: 14, chroma: 0, specular: 0.5, dpr: 2 };

let _seq = 0;

/**
 * A segmented control whose selection indicator is a glass lens: the refracted
 * surface (a copy of the page behind the row) is painted **once** and never
 * moves; only the lens *region* slides across it. The
 * displacement map is generated once and just repositioned as the selection
 * moves ({@link moveFilterLens} — two attribute writes per frame over cached
 * inputs), so there's no per-frame repaint or map rebuild. That's what keeps the
 * slide at a steady frame rate, including on Safari, while still refracting the
 * real content under each position.
 *
 * The visible pill chrome (tint, rim light, shadow) is a separate element moved
 * by a GPU `transform`; a short rAF loop slides the lens to follow it so the two
 * stay locked together through the spring easing.
 */
export function GlassToggleGroup({
  options,
  value,
  onChange,
  ...rest
}: GlassToggleGroupProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const refractionRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const defsRef = useRef<SVGDefsElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const filterRef = useRef<SVGFilterElement | null>(null);
  const lensYRef = useRef(0);
  const targetXRef = useRef(0);
  const rafRef = useRef(0);
  const mountedRef = useRef(false);

  // Geometry read straight from the DOM (segments are equal width, so the lens
  // size is constant; only its x changes as the selection moves).
  const geometry = () => {
    const row = rowRef.current;
    const first = itemRefs.current[options[0].value];
    if (!row || !first) return null;
    const rowRect = row.getBoundingClientRect();
    const segW = first.getBoundingClientRect().width;
    const pillH = rowRect.height - 10;
    const pillTop = (rowRect.height - pillH) / 2;
    const leftOf = (val: string) => {
      const el = itemRefs.current[val];
      return el ? el.getBoundingClientRect().left - rowRect.left : 0;
    };
    return { segW, pillH, pillTop, leftOf };
  };

  // Slide the lens to follow the CSS-animated pill until it settles.
  const follow = () => {
    cancelAnimationFrame(rafRef.current);
    const step = () => {
      const pill = pillRef.current;
      const filter = filterRef.current;
      if (!pill || !filter) return;
      const t = getComputedStyle(pill).transform;
      let curX = targetXRef.current;
      if (t && t !== "none") {
        try {
          curX = new DOMMatrixReadOnly(t).m41;
        } catch {
          /* keep target */
        }
      }
      moveFilterLens(filter, curX - INSET, lensYRef.current);
      if (Math.abs(curX - targetXRef.current) > 0.25) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        moveFilterLens(filter, targetXRef.current - INSET, lensYRef.current);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // Build the static surface + lens once, and keep its backdrop aligned to the
  // page on scroll/resize (never during the slide).
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const refraction = refractionRef.current;
    const backdrop = backdropRef.current;
    const pill = pillRef.current;
    const defs = defsRef.current;
    const g = geometry();
    if (!surface || !refraction || !backdrop || !pill || !defs || !g) return;

    const boxW = g.segW + 2 * INSET;
    const boxH = g.pillH + 2 * INSET;
    const mapUrl = generateDisplacementMap({
      width: boxW,
      height: boxH,
      radius: g.pillH / 2,
      depth: MAT.depth,
      dpr: MAT.dpr,
      specular: MAT.specular,
      inset: INSET,
    });
    if (!mapUrl) return;

    const id = `lqtoggle-${_seq++}`;
    lensYRef.current = g.pillTop - INSET;
    const filter = buildGlassFilter({
      id,
      mapUrl,
      scale: MAT.scale,
      chroma: MAT.chroma,
      specular: MAT.specular,
      lens: {
        x: g.leftOf(value) - INSET,
        y: lensYRef.current,
        width: boxW,
        height: boxH,
      },
    });
    defs.appendChild(filter);
    filterRef.current = filter;
    refraction.style.filter = `url(#${id})`;
    refraction.style.setProperty("-webkit-filter", `url(#${id})`);

    // Position the visible pill with no opening animation.
    pill.style.width = `${g.segW}px`;
    pill.style.height = `${g.pillH}px`;
    pill.style.top = `${g.pillTop}px`;
    pill.style.transition = "none";
    pill.style.transform = `translateX(${g.leftOf(value)}px)`;
    void pill.offsetWidth;
    pill.style.transition = "";

    // Keep the refracted copy small (row + margin), but paint the matching slice
    // of the page's viewport-fixed gradient into it via background-size/position,
    // so it still reads as the real page showing through — without handing the
    // filter a viewport-sized source graphic.
    const M = BACKDROP_MARGIN;
    const align = () => {
      const r = surface.getBoundingClientRect();
      backdrop.style.width = `${r.width + 2 * M}px`;
      backdrop.style.height = `${r.height + 2 * M}px`;
      backdrop.style.transform = `translate(${-M}px, ${-M}px)`;
      backdrop.style.backgroundSize = `${window.innerWidth}px ${window.innerHeight}px`;
      backdrop.style.backgroundPosition = `${M - r.left}px ${M - r.top}px`;
    };
    align();
    window.addEventListener("scroll", align, { passive: true });
    window.addEventListener("resize", align);

    mountedRef.current = true;
    return () => {
      window.removeEventListener("scroll", align);
      window.removeEventListener("resize", align);
      cancelAnimationFrame(rafRef.current);
      filter.remove();
      filterRef.current = null;
      mountedRef.current = false;
    };
    // Built once; selection moves are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate the pill (and trail the lens) to the selected segment. Layout-phase
  // so it fires in the same commit as the click, with no passive-effect gap.
  useLayoutEffect(() => {
    if (!mountedRef.current) return;
    const pill = pillRef.current;
    const g = geometry();
    if (!pill || !g) return;
    const targetLeft = g.leftOf(value);
    targetXRef.current = targetLeft;
    pill.style.transform = `translateX(${targetLeft}px)`;
    follow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div ref={rowRef} className="glassx glassx-toggle" role="tablist" {...rest}>
      <svg className="glassx-toggle-defs" aria-hidden="true">
        <defs ref={defsRef} />
      </svg>
      <div ref={surfaceRef} className="glassx-toggle-surface lq">
        <div ref={refractionRef} className="lq-refraction">
          <div ref={backdropRef} className="lq-backdrop" />
        </div>
      </div>
      <div ref={pillRef} className="glassx-toggle-pill" aria-hidden="true" />
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
