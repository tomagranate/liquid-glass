import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useContext,
  useEffect,
  useRef,
} from "react";
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

interface ActiveShockwave {
  x: number;
  y: number;
  radius: number;
  band: number;
  strength: number;
  chroma: number;
  specular: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const SHOCK_DURATION_MS = 5200;
const waveTravel = (t: number) => 1 - (1 - t) ** 1.35;
const fadeOut = (t: number) => {
  const v = clamp((t - 0.68) / 0.32, 0, 1);
  return 1 - v * v * (3 - 2 * v);
};

const SHOCK_VERT = `#version 300 es
layout(location=0) in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const SHOCK_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uBand;
uniform float uStrength;
uniform float uChroma;
uniform float uSpecular;
out vec4 outColor;

void main() {
  vec2 px = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 delta = px - uCenter;
  float dist = length(delta);
  vec2 dir = dist > 0.001 ? delta / dist : vec2(0.0, 1.0);
  float normalized = (dist - uRadius) / max(1.0, uBand);
  float ring = exp(-normalized * normalized * 1.25);
  ring *= 1.0 - smoothstep(1.85, 2.85, abs(normalized));
  if (ring <= 0.002) discard;

  float shoulder = 0.82 + 0.18 * cos(normalized * 2.2);
  vec2 displacement = dir * ring * shoulder * uStrength;
  vec2 base = px / uResolution;
  vec2 d = displacement / uResolution;
  d.y = -d.y;

  float cr = texture(uTex, base + d * (1.0 + 0.78 * uChroma)).r;
  float cg = texture(uTex, base + d * (1.0 + 0.14 * uChroma)).g;
  float cb = texture(uTex, base + d * (1.0 - 0.58 * uChroma)).b;
  vec3 color = vec3(cr, cg, cb);

  float shine = pow(max(0.0, dot(dir, normalize(vec2(-0.62, -0.78)))), 3.0);
  color += ring * shine * uSpecular * 0.34;
  outColor = vec4(color, ring * 0.76);
}`;

class ShockwaveRenderer {
  readonly canvas: HTMLCanvasElement;

  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly vao: WebGLVertexArrayObject;
  private readonly texture: WebGLTexture;
  private readonly uResolution: WebGLUniformLocation | null;
  private readonly uCenter: WebGLUniformLocation | null;
  private readonly uRadius: WebGLUniformLocation | null;
  private readonly uBand: WebGLUniformLocation | null;
  private readonly uStrength: WebGLUniformLocation | null;
  private readonly uChroma: WebGLUniformLocation | null;
  private readonly uSpecular: WebGLUniformLocation | null;
  private readonly uTex: WebGLUniformLocation | null;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("WebGL2 not available");
    this.canvas = canvas;
    this.gl = gl;
    this.program = this.makeProgram(SHOCK_VERT, SHOCK_FRAG);
    this.uResolution = gl.getUniformLocation(this.program, "uResolution");
    this.uCenter = gl.getUniformLocation(this.program, "uCenter");
    this.uRadius = gl.getUniformLocation(this.program, "uRadius");
    this.uBand = gl.getUniformLocation(this.program, "uBand");
    this.uStrength = gl.getUniformLocation(this.program, "uStrength");
    this.uChroma = gl.getUniformLocation(this.program, "uChroma");
    this.uSpecular = gl.getUniformLocation(this.program, "uSpecular");
    this.uTex = gl.getUniformLocation(this.program, "uTex");

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
  }

  private makeProgram(vertexSource: string, fragmentSource: string) {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, this.makeShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(
      program,
      this.makeShader(gl.FRAGMENT_SHADER, fragmentSource),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`link: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
  }

  private makeShader(type: number, source: string) {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`compile: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  resize(width: number, height: number, dpr = window.devicePixelRatio || 1) {
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  setSource(source: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  render(wave: ActiveShockwave | null) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!wave) return;

    const dpr = this.dpr;
    const activateProgram = gl.useProgram.bind(gl);
    activateProgram(this.program);
    gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uCenter, wave.x * dpr, wave.y * dpr);
    gl.uniform1f(this.uRadius, wave.radius * dpr);
    gl.uniform1f(this.uBand, wave.band * dpr);
    gl.uniform1f(this.uStrength, wave.strength * dpr);
    gl.uniform1f(this.uChroma, wave.chroma);
    gl.uniform1f(this.uSpecular, wave.specular);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uTex, 0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  destroy() {
    const gl = this.gl;
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.texture);
    gl.deleteProgram(this.program);
  }
}

function drawColorField(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.save();

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#19134d");
  bg.addColorStop(0.28, "#075f88");
  bg.addColorStop(0.56, "#1d7a50");
  bg.addColorStop(0.78, "#a85018");
  bg.addColorStop(1, "#501850");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = "screen";
  const blooms = [
    [0.15, 0.18, 0.5, "rgba(255, 73, 177, 0.72)"],
    [0.83, 0.2, 0.48, "rgba(64, 229, 255, 0.68)"],
    [0.25, 0.82, 0.58, "rgba(255, 201, 68, 0.72)"],
    [0.78, 0.75, 0.55, "rgba(86, 255, 145, 0.62)"],
  ] as const;
  for (const [px, py, pr, color] of blooms) {
    const x = width * px;
    const y = height * py;
    const r = Math.max(width, height) * pr;
    const bloom = ctx.createRadialGradient(x, y, 0, x, y, r);
    bloom.addColorStop(0, color);
    bloom.addColorStop(0.45, color.replace(/0\.\d+\)/, "0.22)"));
    bloom.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const bands = [
    ["#ff4fb8", 0.18, 0.72, 24],
    ["#4fe9ff", 0.34, 0.28, 18],
    ["#ffe45c", 0.52, 0.68, 20],
    ["#5dff93", 0.72, 0.36, 16],
  ] as const;
  for (const [color, startY, endY, lineWidth] of bands) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `${color}11`);
    gradient.addColorStop(0.5, `${color}88`);
    gradient.addColorStop(1, `${color}11`);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(-width * 0.08, height * startY);
    ctx.bezierCurveTo(
      width * 0.24,
      height * (startY - 0.18),
      width * 0.66,
      height * (endY + 0.2),
      width * 1.08,
      height * endY,
    );
    ctx.stroke();
  }

  const shapes = [
    [0.2, 0.34, 34, "#fff06a"],
    [0.43, 0.22, 28, "#72f6ff"],
    [0.68, 0.55, 42, "#ff6bbd"],
    [0.82, 0.33, 24, "#80ff8c"],
    [0.36, 0.72, 30, "#ff9a4a"],
  ] as const;
  ctx.globalAlpha = 0.82;
  for (const [px, py, size, color] of shapes) {
    const x = width * px;
    const y = height * py;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
      const sx = x + Math.cos(a) * size;
      const sy = y + Math.sin(a) * size;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const minor = 24;
  const major = minor * 4;
  ctx.lineWidth = 1;

  for (let x = 0; x <= width; x += minor) {
    const crispX = Math.round(x) + 0.5;
    ctx.beginPath();
    ctx.moveTo(crispX, 0);
    ctx.lineTo(crispX, height);
    ctx.strokeStyle =
      x % major === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.075)";
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += minor) {
    const crispY = Math.round(y) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, crispY);
    ctx.lineTo(width, crispY);
    ctx.strokeStyle =
      y % major === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.075)";
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
  ctx.fillRect(0, Math.round(height * 0.5), width, 1);
  ctx.fillRect(Math.round(width * 0.5), 0, 1, height);

  ctx.restore();
}

/**
 * A WebGL-backed shockwave field. The visible field canvas sits underneath; the
 * overlay canvas redraws only the refractive wavefront, so the field appears
 * unchanged except where the pulse bends and chromatically splits the pixels.
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
  const fieldRef = useRef<HTMLCanvasElement>(null);
  const glassRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ShockwaveRenderer | null>(null);
  const pulsesRef = useRef<ShockPulse[]>([]);
  const dimsRef = useRef({ width: 0, height: 0, dpr: 1 });
  const rafRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const sourceReadyRef = useRef(false);
  const redrawSourceRef = useRef<() => void>(() => {});

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
        duration: SHOCK_DURATION_MS,
        maxRadius,
        power,
      },
    ];
  };

  useEffect(() => {
    const stage = stageRef.current;
    const source = sourceRef.current;
    const field = fieldRef.current;
    const glass = glassRef.current;
    if (!stage || !source || !field || !glass) return;

    let renderer: ShockwaveRenderer;
    try {
      renderer = new ShockwaveRenderer(glass);
    } catch {
      stage.dataset.webgl = "false";
      return;
    }
    rendererRef.current = renderer;

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
      field.width = source.width;
      field.height = source.height;
      field.style.width = `${width}px`;
      field.style.height = `${height}px`;

      const ctx = source.getContext("2d");
      const fieldCtx = field.getContext("2d");
      if (!ctx || !fieldCtx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fieldCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      fieldCtx.clearRect(0, 0, width, height);

      drawColorField(ctx, width, height);
      drawColorField(fieldCtx, width, height);

      renderer.setSource(source);
      sourceReadyRef.current = true;
    };
    redrawSourceRef.current = drawSource;

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      dimsRef.current = { width, height, dpr };
      renderer.resize(width, height, dpr);
      drawSource();
    };

    const waveForFrame = (now: number): ActiveShockwave | null => {
      const live: ShockPulse[] = [];
      let active: ActiveShockwave | null = null;
      for (const pulse of pulsesRef.current) {
        const t = (now - pulse.start) / pulse.duration;
        if (t >= 1) continue;
        live.push(pulse);

        const fade = fadeOut(t);
        const radius = 42 + pulse.maxRadius * waveTravel(t);
        const strength = (54 * (1 - t) ** 0.46 + 12) * fade * pulse.power;
        active = {
          x: pulse.x,
          y: pulse.y,
          radius,
          band: 82 + 54 * (1 - t),
          strength,
          chroma: 1.18 * fade,
          specular: 0.16 * fade,
        };
      }
      pulsesRef.current = live;

      return active;
    };

    const render = (now: number) => {
      if (sourceReadyRef.current) {
        renderer.render(waveForFrame(now));
      }
      rafRef.current = requestAnimationFrame(render);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    let redrawRaf = 0;
    const scheduleRedraw = () => {
      if (redrawRaf) return;
      redrawRaf = requestAnimationFrame(() => {
        redrawRaf = 0;
        drawSource();
      });
    };
    window.addEventListener("scroll", scheduleRedraw, {
      passive: true,
      capture: true,
    });
    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (redrawRaf) cancelAnimationFrame(redrawRaf);
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener("scroll", scheduleRedraw, { capture: true });
      motionQuery.removeEventListener("change", updateMotion);
      renderer.destroy();
      rendererRef.current = null;
      redrawSourceRef.current = () => {};
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
    redrawSourceRef.current();
    enqueuePulse(point.x, point.y);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const { width, height } = dimsRef.current;
    const point = { x: width / 2, y: height / 2 };
    redrawSourceRef.current();
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
        ref={fieldRef}
        className="glassx-shockwave-field"
        aria-hidden="true"
      />
      <canvas
        ref={glassRef}
        className="glassx-shockwave-glass"
        aria-hidden="true"
      />
    </div>
  );
}

export default GlassShockwave;
