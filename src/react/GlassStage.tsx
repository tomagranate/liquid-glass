import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useRef,
} from "react";
import { toCanvas } from "html-to-image";
import { GlassFieldGL } from "../core/glass-field.js";
import {
  GlassCompositor,
  type DomPlacement,
} from "../core/glass-compositor.js";
import type { LensMaterial } from "../core/types.js";
import "./stage.css";

export interface GlassStageApi {
  register(
    host: HTMLElement,
    canvas: HTMLCanvasElement,
    params: LensMaterial,
  ): number;
  update(id: number, params: LensMaterial): void;
  unregister(id: number): void;
}

export const GlassStageContext = createContext<GlassStageApi | null>(null);

interface RegEntry {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  params: LensMaterial;
  ctx: CanvasRenderingContext2D | null;
  _rect: DOMRect | null;
}

/* Chrome that should NOT be part of the refracted content snapshot. */
const SNAPSHOT_SKIP = new Set([
  "glass-lens-canvas",
  "magnifier-toggle",
  "magnifier-lens",
  "bench-open",
  "bench",
]);

/**
 * Shared WebGL field. Renders an animated gradient background, composites a
 * snapshot of the page DOM on top (so lenses refract real text and components),
 * then draws every lens bottom-to-top — each refracting the scene-so-far — and
 * blits each lens's disc into that element's own in-DOM 2D canvas (so glass rides
 * the page compositor on scroll/overscroll/transform).
 *
 * The DOM snapshot (html-to-image) is refreshed on mount/resize/mutation, not
 * per frame; the gradient stays per-frame live. Requires WebGL2 — without it the
 * effect is skipped (children still render).
 */
export function GlassStage({ children }: { children?: ReactNode }) {
  const bgRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const registry = useRef<Map<number, RegEntry>>(new Map());
  const apiRef = useRef<GlassStageApi | null>(null);

  if (!apiRef.current) {
    let nextId = 1;
    apiRef.current = {
      register(host, canvas, params) {
        const id = nextId++;
        registry.current.set(id, {
          host,
          canvas,
          params,
          ctx: null,
          _rect: null,
        });
        return id;
      },
      update(id, params) {
        const e = registry.current.get(id);
        if (e) e.params = params;
      },
      unregister(id) {
        registry.current.delete(id);
      },
    };
  }

  useLayoutEffect(() => {
    let bg: GlassFieldGL;
    let comp: GlassCompositor;
    let raf = 0;
    try {
      bg = new GlassFieldGL(bgRef.current!, { lenses: false });
      comp = new GlassCompositor();
    } catch (e) {
      console.warn("GlassStage: WebGL2 unavailable —", (e as Error).message);
      return;
    }

    let dpr = 1;
    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      bg.resize(window.innerWidth, window.innerHeight, dpr);
      comp.resize(window.innerWidth, window.innerHeight, dpr);
    };
    resize();

    // ── DOM snapshot → scene texture ──────────────────────────────────────
    let capturing = false;
    async function capture() {
      const node = contentRef.current;
      if (!node || capturing) return;
      capturing = true;
      try {
        const canvas = await toCanvas(node, {
          pixelRatio: dpr,
          filter: (n) => {
            const cl = (n as HTMLElement).classList;
            if (!cl) return true;
            for (const c of SNAPSHOT_SKIP) if (cl.contains(c)) return false;
            return true;
          },
        });
        comp.setDOMTexture(canvas);
      } catch (e) {
        console.warn("GlassStage: DOM snapshot failed —", e);
      } finally {
        capturing = false;
      }
    }
    let debounce: ReturnType<typeof setTimeout>;
    const recapture = () => {
      clearTimeout(debounce);
      debounce = setTimeout(capture, 180);
    };

    const onResize = () => {
      resize();
      recapture();
    };
    window.addEventListener("resize", onResize);

    const mo = new MutationObserver(recapture);
    if (contentRef.current)
      mo.observe(contentRef.current, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });

    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    fonts.then(() => requestAnimationFrame(capture));

    // ── Render loop ───────────────────────────────────────────────────────
    const start = performance.now();
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      const regs = registry.current;

      for (const r of regs.values()) {
        r._rect = null;
        if (!r.host?.isConnected || !r.canvas) continue;
        const rect = r.host.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        r._rect = rect;
      }

      let dom: DomPlacement | null = null;
      if (comp.hasDom && contentRef.current) {
        const cr = contentRef.current.getBoundingClientRect();
        dom = {
          left: cr.left * dpr,
          top: cr.top * dpr,
          w: cr.width * dpr,
          h: cr.height * dpr,
        };
      }

      bg.renderBase(t);
      comp.beginFrame(t, dom);

      const order = [...regs.entries()].sort(
        (a, b) => (a[1].params.z || 0) - (b[1].params.z || 0) || a[0] - b[0],
      );
      for (const [, r] of order) {
        const rect = r._rect;
        if (!rect) continue;
        comp.renderLens(
          { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
          r.params,
        );
        const c = r.canvas;
        const dw = Math.max(1, Math.round(rect.width * dpr));
        const dh = Math.max(1, Math.round(rect.height * dpr));
        if (c.width !== dw) c.width = dw;
        if (c.height !== dh) c.height = dh;
        const ctx = r.ctx ?? (r.ctx = c.getContext("2d"));
        if (!ctx) continue;
        ctx.clearRect(0, 0, dw, dh);
        ctx.drawImage(
          comp.canvas,
          rect.left * dpr,
          rect.top * dpr,
          rect.width * dpr,
          rect.height * dpr,
          0,
          0,
          dw,
          dh,
        );
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(debounce);
      mo.disconnect();
      window.removeEventListener("resize", onResize);
      bg.destroy();
      comp.destroy();
    };
  }, []);

  return (
    <div className="glass-stage">
      <canvas ref={bgRef} className="stage-bg" aria-hidden="true" />
      <div ref={contentRef} className="stage-content">
        <GlassStageContext.Provider value={apiRef.current}>
          {children}
        </GlassStageContext.Provider>
      </div>
    </div>
  );
}

export function useGlassStage(): GlassStageApi | null {
  return useContext(GlassStageContext);
}

export default GlassStage;
