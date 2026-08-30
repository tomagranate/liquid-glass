import { type RefObject, useEffect, useRef } from "react";
import { onGlassFlush, predictRect, settle } from "@tomagranate/liquid-glass";

/**
 * Keeps a `.copy-wallpaper` slice (rendered inside an `alignTo` backdrop copy)
 * glued to the viewport. The engine aligns the copy to the target element, so
 * the copy's client origin always equals the target's — the slice offset only
 * depends on the target's rect: scroll and resize, never on the host moving.
 */
export function useCopyWallpaper(
  getTarget: (() => HTMLElement | null) | undefined,
): RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !getTarget) return;
    const align = (settling = false, measure = predictRect) => {
      const t = getTarget();
      if (!t) return;
      if (settling) settle(t);
      const r = measure(t);
      el.style.transform = `translate(${-r.left}px, ${-r.top}px)`;
    };
    const resize = () => align(true);
    resize();
    const unsubscribe = onGlassFlush(align);
    window.addEventListener("resize", resize);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", resize);
      const target = getTarget();
      if (target) settle(target);
    };
  }, [getTarget]);

  return ref;
}

export default useCopyWallpaper;
