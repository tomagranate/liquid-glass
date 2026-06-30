import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { WebGLGlass } from "../core/liquid-glass-webgl.js";
import type { LensSpec } from "../core/types.js";

export interface UseGlassTextureParams {
  /** Returns the surface to refract — a `<canvas>`, `<video>`, image, etc. */
  getSource: () => TexImageSource | null;
  /** Canvas size in CSS px (match the media's rendered box). */
  width: number;
  height: number;
  /** Control boxes to refract, CSS px relative to the canvas top-left. */
  lenses: LensSpec[];
  /** Re-upload the source every frame (for a playing `<video>`). */
  live?: boolean;
  /** Bump to re-upload a *static* source after its pixels change (QR redraw). */
  sourceVersion?: number;
}

function ready(src: TexImageSource | null): src is TexImageSource {
  if (!src) return false;
  // A video with no decoded frame yet can't be uploaded.
  if (
    typeof HTMLVideoElement !== "undefined" &&
    src instanceof HTMLVideoElement
  )
    return src.readyState >= 2;
  return true;
}

/**
 * React binding for {@link WebGLGlass} — the texture backend for surfaces SVG
 * filters can't read (a `<canvas>` QR code, a playing `<video>`). Renders an
 * overlay canvas whose lenses refract the source beneath them.
 *
 * Static source (QR): uploaded once and re-rendered when `lenses`/`sourceVersion`
 * change. Live source (`live: true`): re-uploaded and re-rendered every frame.
 */
export function useGlassTexture(
  params: UseGlassTextureParams,
): RefObject<HTMLCanvasElement> {
  const { width, height, live, sourceVersion } = params;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glassRef = useRef<WebGLGlass | null>(null);

  const getSourceRef = useRef(params.getSource);
  getSourceRef.current = params.getSource;
  const lensesRef = useRef(params.lenses);
  lensesRef.current = params.lenses;

  useLayoutEffect(() => {
    if (!canvasRef.current) return;
    let glass: WebGLGlass;
    try {
      glass = new WebGLGlass(canvasRef.current);
    } catch (e) {
      console.warn(
        "useGlassTexture: WebGL2 unavailable —",
        (e as Error).message,
      );
      return;
    }
    glassRef.current = glass;
    return () => {
      glass.destroy();
      glassRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    glassRef.current?.resize(width, height);
  }, [width, height]);

  const lensesKey = JSON.stringify(params.lenses);
  useEffect(() => {
    const glass = glassRef.current;
    if (!glass) return;

    if (live) {
      let raf = 0;
      const loop = () => {
        const src = getSourceRef.current();
        if (ready(src)) glass.setSource(src);
        glass.setLenses(lensesRef.current);
        glass.render();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    const src = getSourceRef.current();
    if (ready(src)) glass.setSource(src);
    glass.setLenses(lensesRef.current);
    glass.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, lensesKey, width, height, sourceVersion]);

  return canvasRef;
}

export default useGlassTexture;
