/**
 * glass-field.ts
 * --------------
 * A WebGL2 renderer for the liquid-glass "field": one procedurally animated
 * background, plus any number of glass lenses that sample it live, all in a
 * single instanced draw call (cost is flat in the number of lenses). Used as the
 * background renderer and as the fully-shared single-pass path exercised by the
 * benchmark. The layered, DOM-aware path lives in `glass-compositor.ts`.
 */

import type { LensSpec } from "./types.js";

/** The animated background, shared by the base and lens shaders. uv is 0..1. */
export const GRADIENT_GLSL = `
uniform vec2 uResolution;
uniform float uTime;

vec3 bg(vec2 uv) {
  float t = uTime;
  float ar = uResolution.x / uResolution.y;
  vec2 p = vec2(uv.x * ar, uv.y);

  vec3 col = mix(vec3(0.11, 0.06, 0.27), vec3(0.01, 0.05, 0.09), uv.y);

  vec2 b1 = vec2((0.30 + 0.34 * sin(t * 0.37)) * ar, 0.28 + 0.22 * cos(t * 0.31));
  vec2 b2 = vec2((0.78 + 0.18 * sin(t * 0.27 + 1.7)) * ar, 0.30 + 0.20 * cos(t * 0.41));
  vec2 b3 = vec2((0.70 + 0.25 * sin(t * 0.23 + 3.1)) * ar, 0.78 + 0.18 * cos(t * 0.19));
  vec2 b4 = vec2((0.24 + 0.20 * sin(t * 0.33 + 2.2)) * ar, 0.80 + 0.16 * cos(t * 0.29));

  col += vec3(1.00, 0.42, 0.30) * smoothstep(0.65, 0.0, distance(p, b1));
  col += vec3(0.46, 0.34, 1.00) * smoothstep(0.62, 0.0, distance(p, b2));
  col += vec3(0.00, 0.83, 0.63) * smoothstep(0.70, 0.0, distance(p, b3));
  col += vec3(1.00, 0.80, 0.24) * smoothstep(0.55, 0.0, distance(p, b4));

  vec2 g = abs(fract(uv * vec2(ar, 1.0) * 22.0 + vec2(sin(t * 0.1) * 0.2, 0.0)) - 0.5);
  float line = smoothstep(0.46, 0.5, max(g.x, g.y));
  col += vec3(0.10) * line;

  return col;
}
`;

const BASE_VERT = `#version 300 es
layout(location=0) in vec2 aCorner;
void main() { gl_Position = vec4(aCorner * 2.0 - 1.0, 0.0, 1.0); }`;

const BASE_FRAG = `#version 300 es
precision highp float;
${GRADIENT_GLSL}
out vec4 outColor;
void main() {
  vec2 uv = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uResolution;
  outColor = vec4(bg(uv), 1.0);
}`;

const LENS_VERT = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aRect;
layout(location=2) in vec4 aParams;
layout(location=3) in vec2 aExtra;
uniform vec2 uResolution;
out vec2 vLocal;
out vec2 vHalf;
out vec4 vParams;
out vec2 vExtra;
void main() {
  vHalf = aRect.zw;
  vParams = aParams;
  vExtra = aExtra;
  vec2 corner = aCorner * 2.0 - 1.0;
  float margin = 2.0;
  vec2 px = aRect.xy + corner * (vHalf + margin);
  vLocal = corner * (vHalf + margin);
  vec2 clip = vec2(px.x / uResolution.x * 2.0 - 1.0,
                   1.0 - px.y / uResolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const LENS_FRAG = `#version 300 es
precision highp float;
${GRADIENT_GLSL}
in vec2 vLocal;
in vec2 vHalf;
in vec4 vParams;
in vec2 vExtra;
out vec4 outColor;

float sdfRoundRect(vec2 p, vec2 hs, float r) {
  vec2 q = abs(p) - (hs - r);
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
  float radius = vParams.x, depth = vParams.y, scale = vParams.z, chroma = vParams.w;
  float specular = vExtra.x, rimLight = vExtra.y;
  float r = min(radius, min(vHalf.x, vHalf.y));

  float sdf = sdfRoundRect(vLocal, vHalf, r);
  float alpha = smoothstep(1.0, -1.0, sdf);
  if (alpha <= 0.001) discard;

  float e = 1.0;
  vec2 grad = vec2(
    sdfRoundRect(vLocal + vec2(e, 0.0), vHalf, r) - sdfRoundRect(vLocal - vec2(e, 0.0), vHalf, r),
    sdfRoundRect(vLocal + vec2(0.0, e), vHalf, r) - sdfRoundRect(vLocal - vec2(0.0, e), vHalf, r)
  );
  grad = (length(grad) > 1e-4) ? normalize(grad) : vec2(0.0);

  float rim = max(1.0, depth);
  float mag = 1.0 - smoothstep(0.0, 1.0, -sdf / rim);
  vec2 dispPx = grad * mag * scale;

  vec2 uv = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uResolution;
  vec2 d = dispPx / uResolution;
  d.y = -d.y;
  vec3 col = vec3(
    bg(uv + d * (1.0 + 0.18 * chroma)).r,
    bg(uv + d * (1.0 + 0.09 * chroma)).g,
    bg(uv + d).b
  );

  vec2 light = normalize(vec2(-0.7071, 0.7071));
  float facing = max(0.0, dot(grad, light));
  col += specular * mag * facing * facing;
  float ring = smoothstep(2.5, 0.0, abs(sdf + 1.0));
  col += rimLight * ring * (0.35 + 0.5 * facing);
  col += rimLight * 0.04;

  outColor = vec4(col, alpha);
}`;

const FLOATS_PER_LENS = 10;

export interface GlassFieldOptions {
  /** true (default) → instanced lens program; false → full-screen gradient. */
  lenses?: boolean;
}

export class GlassFieldGL {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  private readonly lensMode: boolean;
  private lensCount = 0;
  private capacity = 0;
  private dpr = 1;
  private _data: Float32Array = new Float32Array(0);

  private readonly program: WebGLProgram;
  private readonly quadBuf: WebGLBuffer;
  private readonly vao: WebGLVertexArrayObject;
  private readonly instBuf: WebGLBuffer | null = null;
  private readonly uResolution: WebGLUniformLocation | null;
  private readonly uTime: WebGLUniformLocation | null;

  constructor(
    canvas: HTMLCanvasElement,
    { lenses = true }: GlassFieldOptions = {},
  ) {
    const gl = canvas.getContext("webgl2", {
      premultipliedAlpha: false,
      alpha: true,
      antialias: false,
    });
    if (!gl) throw new Error("WebGL2 not available");
    this.gl = gl;
    this.canvas = canvas;
    this.lensMode = lenses;

    const quad = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    if (lenses) {
      this.program = this.makeProgram(LENS_VERT, LENS_FRAG);
      this.instBuf = gl.createBuffer()!;
      this.vao = gl.createVertexArray()!;
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      const stride = FLOATS_PER_LENS * 4;
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
      gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 32);
      gl.vertexAttribDivisor(3, 1);
      gl.bindVertexArray(null);
    } else {
      this.program = this.makeProgram(BASE_VERT, BASE_FRAG);
      this.vao = gl.createVertexArray()!;
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    }

    this.uResolution = gl.getUniformLocation(this.program, "uResolution");
    this.uTime = gl.getUniformLocation(this.program, "uTime");

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
  }

  private makeProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, this.makeShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this.makeShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
    return p;
  }
  private makeShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(`compile: ${gl.getShaderInfoLog(s)}`);
    return s;
  }

  resize(w: number, h: number, dpr = window.devicePixelRatio || 1): void {
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.dpr = dpr;
  }

  setLenses(lenses: LensSpec[]): void {
    if (!this.lensMode || !this.instBuf) return;
    const gl = this.gl;
    const dpr = this.dpr || 1;
    const n = lenses.length;
    if (n > this.capacity) {
      this.capacity = Math.max(n, (this.capacity * 2) | 0, 16);
      this._data = new Float32Array(this.capacity * FLOATS_PER_LENS);
    }
    const a = this._data;
    for (let i = 0; i < n; i++) {
      const L = lenses[i];
      const o = i * FLOATS_PER_LENS;
      a[o] = (L.x + L.w / 2) * dpr;
      a[o + 1] = (L.y + L.h / 2) * dpr;
      a[o + 2] = (L.w / 2) * dpr;
      a[o + 3] = (L.h / 2) * dpr;
      a[o + 4] = Math.min(L.radius ?? 9999, Math.min(L.w, L.h) / 2) * dpr;
      a[o + 5] = (L.depth ?? 12) * dpr;
      a[o + 6] = (L.scale ?? 80) * dpr;
      a[o + 7] = L.chroma ?? 0.4;
      a[o + 8] = L.specular ?? 0.4;
      a[o + 9] = L.rimLight ?? 0.8;
    }
    this.lensCount = n;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, a, gl.DYNAMIC_DRAW);
  }

  renderBase(timeSec: number): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uTime, timeSec);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  renderLenses(timeSec: number): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.lensCount) return;
    gl.useProgram(this.program);
    gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uTime, timeSec);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.lensCount);
    gl.bindVertexArray(null);
  }

  destroy(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.quadBuf);
    if (this.instBuf) gl.deleteBuffer(this.instBuf);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}

export default GlassFieldGL;
