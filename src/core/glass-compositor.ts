/**
 * glass-compositor.ts
 * -------------------
 * Layered liquid-glass compositor — lenses refract everything beneath them,
 * including the page-DOM snapshot and other lenses.
 *
 * Each frame: render the gradient into a "scene" texture, composite a DOM
 * snapshot on top, then for every lens (bottom-to-top) draw it sampling the
 * scene-so-far and composite it back in. The caller blits each lens's disc from
 * the work canvas into that element's own in-DOM 2D canvas.
 */

import { GRADIENT_GLSL } from "./glass-field.js";
import type { LensMaterial, LensRect } from "./types.js";

const QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);

const VERT = `#version 300 es
layout(location=0) in vec2 aCorner;
uniform vec4 uRect;        // x,y,w,h device px (top-left origin)
uniform vec2 uResolution;
void main() {
  vec2 px = uRect.xy + aCorner * uRect.zw;
  gl_Position = vec4(px.x / uResolution.x * 2.0 - 1.0,
                     1.0 - px.y / uResolution.y * 2.0, 0.0, 1.0);
}`;

const GRAD_FRAG = `#version 300 es
precision highp float;
${GRADIENT_GLSL}
out vec4 o;
void main() {
  vec2 uv = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uResolution;
  o = vec4(bg(uv), 1.0);
}`;

const LENS_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uResolution;
uniform vec4 uLens;
uniform vec4 uParams;
uniform vec2 uExtra;
out vec4 o;

float sdf(vec2 p, vec2 hs, float r) {
  vec2 q = abs(p) - (hs - r);
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
  vec2 fragTL = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 p = fragTL - uLens.xy;
  vec2 hs = uLens.zw;
  float r = min(uParams.x, min(hs.x, hs.y));
  float d = sdf(p, hs, r);
  float alpha = smoothstep(1.0, -1.0, d);
  if (alpha <= 0.001) discard;

  float e = 1.0;
  vec2 g = vec2(
    sdf(p + vec2(e, 0.0), hs, r) - sdf(p - vec2(e, 0.0), hs, r),
    sdf(p + vec2(0.0, e), hs, r) - sdf(p - vec2(0.0, e), hs, r)
  );
  g = (length(g) > 1e-4) ? normalize(g) : vec2(0.0);

  float rim = max(1.0, uParams.y);
  float mag = 1.0 - smoothstep(0.0, 1.0, -d / rim);
  vec2 dispPx = g * mag * uParams.z;

  vec2 s = gl_FragCoord.xy / uResolution;
  vec2 dd = dispPx / uResolution;
  dd.y = -dd.y;
  float chroma = uParams.w;
  vec3 col = vec3(
    texture(uSrc, s + dd * (1.0 + 0.18 * chroma)).r,
    texture(uSrc, s + dd * (1.0 + 0.09 * chroma)).g,
    texture(uSrc, s + dd).b
  );

  vec2 light = normalize(vec2(-0.7071, 0.7071));
  float facing = max(0.0, dot(g, light));
  col += uExtra.x * mag * facing * facing;
  float ring = smoothstep(2.5, 0.0, abs(d + 1.0));
  col += uExtra.y * ring * (0.35 + 0.5 * facing);
  col += uExtra.y * 0.04;

  o = vec4(col, alpha);
}`;

const COMP_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uResolution;
out vec4 o;
void main() { o = texture(uTex, gl_FragCoord.xy / uResolution); }`;

const DOM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uDom;
uniform vec2 uResolution;
uniform vec4 uRect;   // domLeft, domTop, domW, domH (top-left device px)
out vec4 o;
void main() {
  vec2 fragTL = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 uv = (fragTL - uRect.xy) / uRect.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  o = texture(uDom, uv);
}`;

interface Program {
  p: WebGLProgram;
  uRect: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uSrc: WebGLUniformLocation | null;
  uTex: WebGLUniformLocation | null;
  uDom: WebGLUniformLocation | null;
  uLens: WebGLUniformLocation | null;
  uParams: WebGLUniformLocation | null;
  uExtra: WebGLUniformLocation | null;
}

/** Viewport placement of the DOM snapshot, in device px (top-left origin). */
export interface DomPlacement {
  left: number;
  top: number;
  w: number;
  h: number;
}

export class GlassCompositor {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  hasDom = false;

  private dpr = 1;
  private W = 0;
  private H = 0;

  private readonly gradProg: Program;
  private readonly lensProg: Program;
  private readonly compProg: Program;
  private readonly domProg: Program;
  private readonly vao: WebGLVertexArrayObject;
  private readonly quadBuf: WebGLBuffer;
  private readonly texScene: WebGLTexture;
  private readonly texLens: WebGLTexture;
  private readonly texDom: WebGLTexture;
  private readonly fboScene: WebGLFramebuffer;

  constructor() {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) throw new Error("WebGL2 not available");
    this.canvas = canvas;
    this.gl = gl;

    this.gradProg = this.makeProgram(VERT, GRAD_FRAG);
    this.lensProg = this.makeProgram(VERT, LENS_FRAG);
    this.compProg = this.makeProgram(VERT, COMP_FRAG);
    this.domProg = this.makeProgram(VERT, DOM_FRAG);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.texScene = gl.createTexture()!;
    this.texLens = gl.createTexture()!;
    this.texDom = gl.createTexture()!;
    this.fboScene = gl.createFramebuffer()!;
  }

  /** Upload a page-DOM snapshot (an HTMLCanvasElement) to refract under lenses. */
  setDOMTexture(canvas: HTMLCanvasElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texDom);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.hasDom = true;
  }
  clearDOMTexture(): void {
    this.hasDom = false;
  }

  private makeProgram(vs: string, fs: string): Program {
    const gl = this.gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, this.makeShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this.makeShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
    return {
      p,
      uRect: gl.getUniformLocation(p, "uRect"),
      uResolution: gl.getUniformLocation(p, "uResolution"),
      uTime: gl.getUniformLocation(p, "uTime"),
      uSrc: gl.getUniformLocation(p, "uSrc"),
      uTex: gl.getUniformLocation(p, "uTex"),
      uDom: gl.getUniformLocation(p, "uDom"),
      uLens: gl.getUniformLocation(p, "uLens"),
      uParams: gl.getUniformLocation(p, "uParams"),
      uExtra: gl.getUniformLocation(p, "uExtra"),
    };
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

  private initTex(tex: WebGLTexture): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.W,
      this.H,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  resize(w: number, h: number, dpr = window.devicePixelRatio || 1): void {
    this.dpr = dpr;
    this.W = Math.round(w * dpr);
    this.H = Math.round(h * dpr);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.initTex(this.texScene);
    this.initTex(this.texLens);
  }

  /** Seed the scene with the gradient, then composite the DOM snapshot. */
  beginFrame(timeSec: number, dom?: DomPlacement | null): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboScene);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texScene,
      0,
    );
    gl.viewport(0, 0, this.W, this.H);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(this.vao);

    const g = this.gradProg;
    gl.useProgram(g.p);
    gl.uniform2f(g.uResolution, this.W, this.H);
    gl.uniform1f(g.uTime, timeSec);
    gl.uniform4f(g.uRect, 0, 0, this.W, this.H);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (this.hasDom && dom && dom.w > 0 && dom.h > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const d = this.domProg;
      gl.useProgram(d.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texDom);
      gl.uniform1i(d.uDom, 0);
      gl.uniform2f(d.uResolution, this.W, this.H);
      gl.uniform4f(d.uRect, dom.left, dom.top, dom.w, dom.h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
    }
  }

  /**
   * Draw one lens (sampling the scene below) onto the work canvas, then
   * composite it into the scene for the lenses above. Rect/params in CSS px.
   */
  renderLens(rect: LensRect, params: LensMaterial): void {
    const gl = this.gl;
    const dpr = this.dpr;
    const bx = Math.max(0, Math.floor((rect.x - 4) * dpr));
    const by = Math.max(0, Math.floor((rect.y - 4) * dpr));
    const bw = Math.min(this.W - bx, Math.ceil((rect.w + 8) * dpr));
    const bh = Math.min(this.H - by, Math.ceil((rect.h + 8) * dpr));
    if (bw <= 0 || bh <= 0) return;
    const byFb = this.H - (by + bh);

    // a. Lens → work canvas, sampling the scene below.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.W, this.H);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(bx, byFb, bw, bh);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const l = this.lensProg;
    gl.useProgram(l.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texScene);
    gl.uniform1i(l.uSrc, 0);
    gl.uniform2f(l.uResolution, this.W, this.H);
    gl.uniform4f(
      l.uLens,
      (rect.x + rect.w / 2) * dpr,
      (rect.y + rect.h / 2) * dpr,
      (rect.w / 2) * dpr,
      (rect.h / 2) * dpr,
    );
    gl.uniform4f(
      l.uParams,
      Math.min(params.radius ?? 9999, Math.min(rect.w, rect.h) / 2) * dpr,
      (params.depth ?? 12) * dpr,
      (params.scale ?? 80) * dpr,
      params.chroma ?? 0.4,
    );
    gl.uniform2f(l.uExtra, params.specular ?? 0.4, params.rimLight ?? 0.8);
    // uRect is top-left device px (the vertex flips Y); scissor/copy use byFb.
    gl.uniform4f(l.uRect, bx, by, bw, bh);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.SCISSOR_TEST);

    // b. Copy the disc out of the canvas into texLens.
    gl.bindTexture(gl.TEXTURE_2D, this.texLens);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, bx, byFb, bx, byFb, bw, bh);

    // c. Composite texLens over the scene, so lenses above refract it.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboScene);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texScene,
      0,
    );
    gl.viewport(0, 0, this.W, this.H);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const c = this.compProg;
    gl.useProgram(c.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texLens);
    gl.uniform1i(c.uTex, 0);
    gl.uniform2f(c.uResolution, this.W, this.H);
    gl.uniform4f(c.uRect, bx, by, bw, bh);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  destroy(): void {
    const gl = this.gl;
    gl.deleteFramebuffer(this.fboScene);
    gl.deleteTexture(this.texScene);
    gl.deleteTexture(this.texLens);
    gl.deleteTexture(this.texDom);
    gl.deleteBuffer(this.quadBuf);
    gl.deleteVertexArray(this.vao);
  }
}

export default GlassCompositor;
