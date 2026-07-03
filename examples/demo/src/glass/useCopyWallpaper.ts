import { type RefObject, useEffect, useRef } from "react";

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
    const align = () => {
      const t = getTarget();
      if (!t) return;
      const r = t.getBoundingClientRect();
      el.style.transform = `translate(${-r.left}px, ${-r.top}px)`;
    };
    align();
    window.addEventListener("scroll", align, { passive: true });
    window.addEventListener("resize", align);
    return () => {
      window.removeEventListener("scroll", align);
      window.removeEventListener("resize", align);
    };
  }, [getTarget]);

  return ref;
}

export default useCopyWallpaper;
