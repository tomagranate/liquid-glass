import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useContext,
  useEffect,
  useRef,
} from "react";
import { type LensSpec, WebGLGlass } from "@tomagranate/liquid-glass";
import { GlassCopyContext } from "./flat.ts";
import "./components.css";

interface ShockPulse {
  x: number;
  y: number;
  start: number;
  duration: number;
  maxRadius: number;
  power: number;
}

const IDLE_POINTS = [
  [0.24, 0.36],
  [0.72, 0.42],
  [0.46, 0.68],
  [0.58, 0.28],
] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const fadeOut = (t: number) => {
  const v = clamp((t - 0.68) / 0.32, 0, 1);
  return 1 - v * v * (3 - 2 * v);
};

function readBackdropUrl() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--lq-backdrop")
    .trim();
  const match = raw.match(/^url\((['"]?)(.*?)\1\)$/);
  return match?.[2] || "/wallpapers/amber.webp";
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale = Math.max(
    width / image.naturalWidth,
    height / image.naturalHeight,
  );
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawLightField(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const radius = Math.max(width, height);
  const glow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    0,
    width * 0.5,
    height * 0.45,
    radius * 0.68,
  );
  glow.addColorStop(0, "rgba(255,255,255,0.16)");
  glow.addColorStop(0.46, "rgba(255,255,255,0.04)");
  glow.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 0; i < 8; i++) {
    const y = height * (0.16 + i * 0.105);
    ctx.beginPath();
    ctx.moveTo(-40, y);
    ctx.bezierCurveTo(
      width * 0.28,
      y - 70,
      width * 0.68,
      y + 84,
      width + 40,
      y - 18,
    );
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + i * 0.012})`;
    ctx.lineWidth = i % 2 === 0 ? 1.3 : 0.7;
    ctx.stroke();
  }

  for (let i = 0; i < 7; i++) {
    const x = width * (0.08 + i * 0.15);
    ctx.beginPath();
    ctx.moveTo(x, -30);
    ctx.bezierCurveTo(
      x + 72,
      height * 0.26,
      x - 86,
      height * 0.68,
      x + 42,
      height + 34,
    );
    ctx.strokeStyle = "rgba(129,214,255,0.16)";
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }

  const hexagons = [
    [0.21, 0.38, 32, 0.08],
    [0.43, 0.32, 46, 0.13],
    [0.68, 0.58, 38, 0.1],
    [0.82, 0.38, 28, 0.08],
  ] as const;
  for (const [px, py, size, alpha] of hexagons) {
    const x = width * px;
    const y = height * py;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const sx = x + Math.cos(a) * size;
      const sy = y + Math.sin(a) * size;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }

  const prism = [
    [width * 0.36, height * 0.72],
    [width * 0.5, height * 0.31],
    [width * 0.67, height * 0.71],
  ] as const;
  ctx.beginPath();
  ctx.moveTo(prism[0][0], prism[0][1]);
  ctx.lineTo(prism[1][0], prism[1][1]);
  ctx.lineTo(prism[2][0], prism[2][1]);
  ctx.closePath();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  const beam = ctx.createLinearGradient(
    width * 0.2,
    height * 0.68,
    width * 0.84,
    height * 0.42,
  );
  beam.addColorStop(0, "rgba(110,220,255,0)");
  beam.addColorStop(0.38, "rgba(110,220,255,0.2)");
  beam.addColorStop(0.62, "rgba(255,255,255,0.3)");
  beam.addColorStop(1, "rgba(255,169,86,0)");
  ctx.strokeStyle = beam;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.18, height * 0.68);
  ctx.lineTo(width * 0.47, height * 0.5);
  ctx.lineTo(width * 0.83, height * 0.43);
  ctx.stroke();

  const arcBands = [
    [0.08, 0.86, 0.56, 0.92],
    [0.16, 0.78, 0.62, 0.86],
    [0.64, 0.98, 0.18, 0.56],
  ] as const;
  for (const [start, end, cy, alpha] of arcBands) {
    ctx.beginPath();
    ctx.ellipse(
      width * 0.5,
      height * cy,
      width * 0.44,
      height * 0.42,
      -0.18,
      Math.PI * start,
      Math.PI * end,
    );
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.13})`;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  const points = [
    [0.18, 0.28, 5],
    [0.34, 0.62, 4],
    [0.52, 0.36, 6],
    [0.69, 0.55, 4],
    [0.84, 0.34, 5],
  ] as const;
  for (const [px, py, r] of points) {
    const x = width * px;
    const y = height * py;
    const dot = ctx.createRadialGradient(x, y, 0, x, y, r * 8);
    dot.addColorStop(0, "rgba(255,255,255,0.9)");
    dot.addColorStop(0.2, "rgba(120,220,255,0.35)");
    dot.addColorStop(1, "rgba(120,220,255,0)");
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(x, y, r * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * A WebGL-backed shockwave field. The source canvas is visible underneath; the
 * overlay canvas redraws only refractive lenses, so the field appears unchanged
 * except where the wavefront bends and chromatically splits the same pixels.
 */
export function GlassShockwave() {
  const flat = useContext(GlassCopyContext);
  return flat ? <FlatShockwave /> : <ShockwaveImpl />;
}

function FlatShockwave() {
  return (
    <div
      className="glassx glassx-shockwave glassx-shockwave-flat"
      aria-hidden="true"
    />
  );
}

function ShockwaveImpl() {
  const stageRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const glassRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLGlass | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pulsesRef = useRef<ShockPulse[]>([]);
  const dimsRef = useRef({ width: 0, height: 0, dpr: 1 });
  const rafRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const sourceReadyRef = useRef(false);

  const enqueuePulse = (x: number, y: number, power = 1) => {
    const { width, height } = dimsRef.current;
    if (!width || !height) return;
    if (reducedMotionRef.current) return;
    const maxRadius = Math.max(width, height) * 0.92;
    pulsesRef.current = [
      {
        x,
        y,
        start: performance.now(),
        duration: 2300,
        maxRadius,
        power,
      },
    ];
  };

  useEffect(() => {
    const stage = stageRef.current;
    const source = sourceRef.current;
    const glass = glassRef.current;
    if (!stage || !source || !glass) return;

    let renderer: WebGLGlass;
    try {
      renderer = new WebGLGlass(glass);
    } catch {
      stage.dataset.webgl = "false";
      return;
    }
    rendererRef.current = renderer;
    let disposed = false;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = motionQuery.matches;
    const updateMotion = () => {
      reducedMotionRef.current = motionQuery.matches;
      pulsesRef.current = [];
    };
    motionQuery.addEventListener("change", updateMotion);

    const drawSource = () => {
      const { width, height, dpr } = dimsRef.current;
      if (!width || !height) return;
      source.width = Math.round(width * dpr);
      source.height = Math.round(height * dpr);
      source.style.width = `${width}px`;
      source.style.height = `${height}px`;

      const ctx = source.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const image = imageRef.current;
      if (image?.complete && image.naturalWidth > 0) {
        drawCover(ctx, image, width, height);
      } else {
        const fallback = ctx.createLinearGradient(0, 0, width, height);
        fallback.addColorStop(0, "#271238");
        fallback.addColorStop(0.5, "#17405a");
        fallback.addColorStop(1, "#4b210f");
        ctx.fillStyle = fallback;
        ctx.fillRect(0, 0, width, height);
      }
      drawLightField(ctx, width, height);

      renderer.setSource(source);
      sourceReadyRef.current = true;
    };

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      dimsRef.current = { width, height, dpr };
      renderer.resize(width, height, dpr);
      drawSource();
    };

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (disposed) return;
      imageRef.current = image;
      drawSource();
    };
    image.onerror = () => {
      if (disposed) return;
      imageRef.current = null;
      drawSource();
    };
    image.src = readBackdropUrl();

    const lensesForFrame = (now: number) => {
      const lenses: LensSpec[] = [];

      const live: ShockPulse[] = [];
      for (const pulse of pulsesRef.current) {
        const t = (now - pulse.start) / pulse.duration;
        if (t >= 1) continue;
        live.push(pulse);

        const fade = fadeOut(t);
        const radius = 42 + pulse.maxRadius * easeOutCubic(t);
        const strength = (62 * (1 - t) ** 0.58 + 8) * fade * pulse.power;
        lenses.push({
          x: pulse.x - radius,
          y: pulse.y - radius,
          w: radius * 2,
          h: radius * 2,
          radius,
          depth: 24 + 18 * (1 - t),
          scale: strength,
          chroma: 0.58 * fade,
          specular: 0.65 * fade,
        });
      }
      pulsesRef.current = live;

      return lenses;
    };

    const render = (now: number) => {
      if (sourceReadyRef.current) {
        renderer.setLenses(lensesForFrame(now));
        renderer.render();
      }
      rafRef.current = requestAnimationFrame(render);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    rafRef.current = requestAnimationFrame(render);

    let idleIndex = 0;
    const idlePulse = () => {
      if (reducedMotionRef.current || pulsesRef.current.length) return;
      const { width, height } = dimsRef.current;
      if (!width || !height) return;
      const point = IDLE_POINTS[idleIndex % IDLE_POINTS.length];
      idleIndex += 1;
      enqueuePulse(width * point[0], height * point[1], 0.62);
    };
    const idleDelay = window.setTimeout(idlePulse, 900);
    const idleTimer = window.setInterval(idlePulse, 3400);

    return () => {
      disposed = true;
      image.onload = null;
      image.onerror = null;
      window.clearTimeout(idleDelay);
      window.clearInterval(idleTimer);
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      motionQuery.removeEventListener("change", updateMotion);
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointFromEvent(event);
    enqueuePulse(point.x, point.y);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const { width, height } = dimsRef.current;
    const point = { x: width / 2, y: height / 2 };
    enqueuePulse(point.x, point.y);
  };

  return (
    <div
      ref={stageRef}
      className="glassx glassx-shockwave"
      role="button"
      tabIndex={0}
      aria-label="Emit a glass shockwave"
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    >
      <canvas ref={sourceRef} className="glassx-shockwave-source" />
      <canvas
        ref={glassRef}
        className="glassx-shockwave-glass"
        aria-hidden="true"
      />
    </div>
  );
}

export default GlassShockwave;
