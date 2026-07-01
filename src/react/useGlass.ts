import {
  type MutableRefObject,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  createGlassController,
  type GlassController,
  type GlassOptions,
} from "../core/liquid-glass.js";

export interface UseGlassResult<H extends HTMLElement = HTMLDivElement> {
  /** the glass element (`.lq`) */
  hostRef: RefObject<H>;
  /** the filtered layer (`.lq-refraction`) */
  refractionRef: RefObject<HTMLDivElement>;
  /** the backdrop copy bent by the filter (`.lq-backdrop`) */
  backdropRef: RefObject<HTMLDivElement>;
  /** the tint + rim-light overlay (`.lq-sheen`) */
  sheenRef: RefObject<HTMLDivElement>;
  /** the live controller (null until mounted) */
  controllerRef: MutableRefObject<GlassController | null>;
}

/* Material props that, when changed, trigger a controller re-render. `backdrop`
   is passed through but only string values are part of the key. `alignTo` is an
   element/function and is tracked separately by identity below. */
function materialKey(o: GlassOptions): string {
  return JSON.stringify([
    o.radius,
    o.depth,
    o.scale,
    o.blur,
    o.chroma,
    o.specular,
    o.specularAngle,
    o.dpr,
    o.tint,
    o.rimLight,
    o.shadow,
    typeof o.backdrop === "string" ? o.backdrop : null,
  ]);
}

/**
 * React binding for the SVG `feDisplacementMap` engine.
 *
 * The component renders the layer structure and spreads these refs onto it; the
 * hook owns the {@link GlassController} lifecycle. This keeps React in charge of
 * the DOM (unlike {@link applyGlass}, which moves children imperatively).
 *
 * ```tsx
 * const g = useGlass({ radius: 18, chroma: 0.4 });
 * return (
 *   <div ref={g.hostRef} className="lq">
 *     <div ref={g.refractionRef} className="lq-refraction">
 *       <div ref={g.backdropRef} className="lq-backdrop" />
 *     </div>
 *     <div ref={g.sheenRef} className="lq-sheen" />
 *     <div className="lq-content">{children}</div>
 *   </div>
 * );
 * ```
 *
 * For a moving lens (switch thumb, slider thumb, toggle indicator) set
 * `options.alignTo` to the element beneath the lens and style the backdrop layer
 * as a copy of it — the controller keeps that copy glued over the real element as
 * the lens moves (refraction-target mode).
 */
export function useGlass<H extends HTMLElement = HTMLDivElement>(
  options: GlassOptions = {},
): UseGlassResult<H> {
  const hostRef = useRef<H>(null);
  const refractionRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<GlassController | null>(null);

  const optsRef = useRef(options);
  optsRef.current = options;

  useLayoutEffect(() => {
    const host = hostRef.current;
    const refraction = refractionRef.current;
    const backdrop = backdropRef.current;
    if (!host || !refraction || !backdrop) return;

    const ctrl = createGlassController(
      host,
      { refraction, backdrop, sheen: sheenRef.current },
      optsRef.current,
    );
    controllerRef.current = ctrl;
    return () => {
      ctrl.destroy();
      controllerRef.current = null;
    };
    // Created once; option changes flow through the update effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = materialKey(options);
  const alignToKey = options.alignTo ?? null;
  useEffect(() => {
    controllerRef.current?.update(optsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, alignToKey]);

  return { hostRef, refractionRef, backdropRef, sheenRef, controllerRef };
}

export default useGlass;
