import { type RefObject, useEffect, useRef } from "react";
import type { LensMaterial } from "../core/types.js";
import { useGlassStage } from "./GlassStage.js";

/**
 * Turn an element into a glass lens.
 *
 * The component renders a transparent host plus a `<canvas>` child; this hook
 * returns the ref for that canvas. The glass lives on the element's OWN canvas
 * (a DOM child), so it moves with the element during scroll, overscroll and
 * transforms. Rendering is shared: the surrounding {@link GlassStage} draws the
 * whole field once per frame and each canvas blits its own region.
 *
 * ```tsx
 * const ref = useRef<HTMLButtonElement>(null);
 * const canvasRef = useGlassLens(ref, { radius: 9999, depth: 10 });
 * return (
 *   <button ref={ref}>
 *     <canvas ref={canvasRef} className="glass-lens-canvas" />
 *     <span className="glass-fg">label</span>
 *   </button>
 * );
 * ```
 *
 * @returns ref to attach to the lens `<canvas>`
 */
export function useGlassLens(
  hostRef: RefObject<HTMLElement>,
  params: LensMaterial = {},
  enabled = true,
): RefObject<HTMLCanvasElement> {
  const stage = useGlassStage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const id = useRef<number | null>(null);
  const key = JSON.stringify(params);

  useEffect(() => {
    if (!stage || !enabled || !hostRef.current || !canvasRef.current) return;
    id.current = stage.register(hostRef.current, canvasRef.current, params);
    return () => {
      if (id.current != null) stage.unregister(id.current);
      id.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, enabled]);

  useEffect(() => {
    if (stage && id.current != null) stage.update(id.current, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, stage]);

  return canvasRef;
}

export default useGlassLens;
