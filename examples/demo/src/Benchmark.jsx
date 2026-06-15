import { useEffect, useMemo, useRef, useState } from "react";
import { createGlassController, WebGLGlass } from "@tomagranate/liquid-glass";
import "./benchmark.css";

/* Identical lens material for both backends, for a fair comparison. */
const LENS = {
  radius: 9999,
  depth: 26,
  scale: 90,
  chroma: 0.4,
  specular: 0.45,
};
const COUNTS = [10, 30, 60, 100];
const WARMUP = 600;
const MEASURE = 2200;

/* Deterministic motion shared by both backends. */
function positionsAt(t, count, size, W, H) {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW = (W - 80) / cols;
  const cellH = (H - 160) / rows;
  const out = [];
  for (let i = 0; i < count; i++) {
    const gx = i % cols;
    const gy = Math.floor(i / cols);
    const bx = 40 + gx * cellW + cellW / 2;
    const by = 110 + gy * cellH + cellH / 2;
    const a = (t / 1000) * 1.4 + i * 0.7;
    out.push({
      x: bx + Math.cos(a) * 36 - size / 2,
      y: by + Math.sin(a) * 36 - size / 2,
    });
  }
  return out;
}

function stats(deltas) {
  if (!deltas.length) return null;
  const s = [...deltas].sort((a, b) => a - b);
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return {
    fps: 1000 / avg,
    avg,
    p95: s[Math.floor(s.length * 0.95)],
    max: s[s.length - 1],
    dropped: deltas.filter((d) => d > 22).length,
    frames: deltas.length,
  };
}

function measure(duration, perFrame) {
  return new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const start = last;
    function loop(now) {
      const dt = now - last;
      last = now;
      perFrame(now);
      if (now - start > 16) deltas.push(dt); // skip the first frame
      if (now - start < duration) requestAnimationFrame(loop);
      else resolve(deltas);
    }
    requestAnimationFrame(loop);
  });
}

/* Build a colourful source image (gradient + blobs + grid) once. */
function makeSource(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#241655");
  g.addColorStop(0.6, "#0a0a1a");
  g.addColorStop(1, "#04121a");
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  const blobs = [
    [0.12 * w, 0.16 * h, 0.42 * w, "#ff7a59"],
    [0.86 * w, 0.2 * h, 0.38 * w, "#7b5cff"],
    [0.78 * w, 0.9 * h, 0.5 * w, "#00d4a0"],
    [0.22 * w, 0.84 * h, 0.34 * w, "#ffd23f"],
  ];
  for (const [cx, cy, r, col] of blobs) {
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, col);
    rg.addColorStop(1, "transparent");
    x.fillStyle = rg;
    x.fillRect(0, 0, w, h);
  }
  x.strokeStyle = "rgba(255,255,255,0.13)";
  x.lineWidth = 1;
  for (let gx = 0; gx <= w; gx += 40) {
    x.beginPath();
    x.moveTo(gx, 0);
    x.lineTo(gx, h);
    x.stroke();
  }
  for (let gy = 0; gy <= h; gy += 40) {
    x.beginPath();
    x.moveTo(0, gy);
    x.lineTo(w, gy);
    x.stroke();
  }
  return c;
}

export function Benchmark({ onClose }) {
  const [size, setSize] = useState(150);
  const [status, setStatus] = useState("idle");
  const [results, setResults] = useState([]); // {count, svg, webgl}
  const [preview, setPreview] = useState("webgl"); // live preview backend

  const W = window.innerWidth;
  const H = window.innerHeight;
  const source = useMemo(() => makeSource(W, H), [W, H]);
  const sourceUrl = useMemo(() => source.toDataURL(), [source]);

  const svgLayerRef = useRef(null);
  const webglCanvasRef = useRef(null);
  const previewRaf = useRef(0);

  // ── Live preview so you can see the lenses while idle ──────────────────────
  useEffect(() => {
    if (status !== "idle") return;
    const count = 18;
    let renderer = null;
    const controllers = [];
    const hosts = [];

    if (preview === "webgl") {
      renderer = new WebGLGlass(webglCanvasRef.current);
      renderer.resize(W, H);
      renderer.setSource(source);
    } else {
      const layer = svgLayerRef.current;
      for (let i = 0; i < count; i++) {
        const { host, ctrl } = makeSvgLens(layer, size, sourceUrl);
        hosts.push(host);
        controllers.push(ctrl);
      }
    }

    const loop = (now) => {
      const pos = positionsAt(now, count, size, W, H);
      if (preview === "webgl") {
        renderer.setLenses(
          pos.map((p) => ({ ...p, w: size, h: size, ...LENS })),
        );
        renderer.render();
      } else {
        for (let i = 0; i < hosts.length; i++)
          hosts[i].style.transform = `translate(${pos[i].x}px, ${pos[i].y}px)`;
      }
      previewRaf.current = requestAnimationFrame(loop);
    };
    previewRaf.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(previewRaf.current);
      renderer?.destroy();
      controllers.forEach((c) => c.destroy());
      hosts.forEach((h) => h.remove());
    };
  }, [status, preview, size, W, H, source, sourceUrl]);

  async function run() {
    cancelAnimationFrame(previewRaf.current);
    setResults([]);
    setStatus("running");
    const acc = [];

    for (const count of COUNTS) {
      // ---- SVG ----
      setStatus(`SVG · ${count} lenses…`);
      const svg = await runSvg(count);
      await idle(120);
      // ---- WebGL ----
      setStatus(`WebGL · ${count} lenses…`);
      const webgl = await runWebgl(count);
      await idle(120);
      acc.push({ count, svg, webgl });
      setResults([...acc]);
    }
    setStatus("idle");
  }

  function makeSvgLens(layer, size, url) {
    const host = document.createElement("div");
    host.className = "bench-lens";
    host.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;pointer-events:none;will-change:transform;`;
    const refraction = document.createElement("div");
    refraction.className = "lq-refraction";
    const backdrop = document.createElement("div");
    backdrop.className = "lq-backdrop";
    refraction.appendChild(backdrop);
    const sheen = document.createElement("div");
    sheen.className = "lq-sheen";
    host.append(refraction, sheen);
    layer.appendChild(host);
    const ctrl = createGlassController(
      host,
      { refraction, backdrop, sheen },
      {
        ...LENS,
        radius: 9999,
        rimLight: 1,
        backdrop: `url(${url}) 0 0 / ${W}px ${H}px`,
      },
    );
    return { host, ctrl };
  }

  async function runSvg(count) {
    const layer = svgLayerRef.current;
    const lenses = [];
    for (let i = 0; i < count; i++)
      lenses.push(makeSvgLens(layer, size, sourceUrl));
    const hosts = lenses.map((l) => l.host);
    const step = (now) => {
      const pos = positionsAt(now, count, size, W, H);
      for (let i = 0; i < hosts.length; i++)
        hosts[i].style.transform = `translate(${pos[i].x}px, ${pos[i].y}px)`;
    };
    await measure(WARMUP, step);
    const deltas = await measure(MEASURE, step);
    lenses.forEach((l) => {
      l.ctrl.destroy();
      l.host.remove();
    });
    return stats(deltas);
  }

  async function runWebgl(count) {
    const renderer = new WebGLGlass(webglCanvasRef.current);
    renderer.resize(W, H);
    renderer.setSource(source);
    const step = (now) => {
      const pos = positionsAt(now, count, size, W, H);
      renderer.setLenses(pos.map((p) => ({ ...p, w: size, h: size, ...LENS })));
      renderer.render();
    };
    await measure(WARMUP, step);
    const deltas = await measure(MEASURE, step);
    renderer.render(); // leave a frame up
    setTimeout(() => renderer.destroy(), 0);
    return stats(deltas);
  }

  const idleRunning = status === "idle";

  return (
    <div className="bench">
      <div
        className="bench-bg"
        style={{ backgroundImage: `url(${sourceUrl})` }}
      />
      {/* SVG lenses live in this layer; WebGL draws to the canvas. */}
      <div ref={svgLayerRef} className="bench-svg-layer" />
      <canvas ref={webglCanvasRef} className="bench-canvas" />

      <div className="bench-panel">
        <div className="bench-row bench-title">
          <strong>SVG&nbsp;filter vs WebGL</strong>
          <button className="bench-x" onClick={onClose}>
            ✕ close
          </button>
        </div>

        <div className="bench-row">
          <label>
            lens size {size}px
            <input
              type="range"
              min={90}
              max={260}
              value={size}
              disabled={!idleRunning}
              onChange={(e) => setSize(+e.target.value)}
            />
          </label>
          {idleRunning && (
            <div className="bench-seg">
              <button
                data-on={preview === "svg"}
                onClick={() => setPreview("svg")}
              >
                SVG preview
              </button>
              <button
                data-on={preview === "webgl"}
                onClick={() => setPreview("webgl")}
              >
                WebGL preview
              </button>
            </div>
          )}
        </div>

        <div className="bench-row">
          <button className="bench-run" onClick={run} disabled={!idleRunning}>
            {idleRunning ? "▶ Run benchmark" : status}
          </button>
        </div>

        {results.length > 0 && (
          <table className="bench-table">
            <thead>
              <tr>
                <th>lenses</th>
                <th>SVG fps</th>
                <th>WebGL fps</th>
                <th>SVG p95</th>
                <th>WebGL p95</th>
                <th>SVG drops</th>
                <th>WebGL drops</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.count}>
                  <td>{r.count}</td>
                  <td className={fpsClass(r.svg)}>{fmtFps(r.svg)}</td>
                  <td className={fpsClass(r.webgl)}>{fmtFps(r.webgl)}</td>
                  <td>{fmt(r.svg?.p95)}</td>
                  <td>{fmt(r.webgl?.p95)}</td>
                  <td>{r.svg?.dropped ?? "–"}</td>
                  <td>{r.webgl?.dropped ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="bench-note">
          Both backends refract the same image with identical lens parameters
          and motion. fps is derived from mean frame time; “drops” counts frames
          over 22&nbsp;ms. Numbers are vsync-capped, so divergence shows up
          first as dropped frames and rising p95.
        </p>
      </div>
    </div>
  );
}

const fmt = (v) => (v == null ? "–" : v.toFixed(1));
const fmtFps = (s) => (s ? Math.round(s.fps) : "–");
const fpsClass = (s) =>
  !s ? "" : s.fps >= 55 ? "good" : s.fps >= 40 ? "ok" : "bad";

function idle(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default Benchmark;
