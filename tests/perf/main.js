import { createGlassScope } from "@tomagranate/liquid-glass";
import "@tomagranate/liquid-glass/styles.css";
import {
  scenarioMotionMode,
  shouldNotifyManualGeometry,
} from "./motion-policy.js";
import "./style.css";

const app = document.querySelector("#app");
let current = null;
let interactionResults = [];

function resetInteractions() {
  interactionResults = [];
  return interactionResults.length;
}
const pageErrors = [];
const originalConsoleError = console.error.bind(console);
console.error = (...values) => {
  pageErrors.push(values.map(String).join(" "));
  originalConsoleError(...values);
};
window.addEventListener("error", (event) =>
  pageErrors.push(String(event.error?.stack || event.message)),
);
window.addEventListener("unhandledrejection", (event) =>
  pageErrors.push(String(event.reason?.stack || event.reason)),
);

const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
const twoFrames = async () => {
  await raf();
  await raf();
};

function countFrom(id) {
  if (id === "content-small-motion") return 3;
  if (id === "mixed") return 8;
  return Number(id.match(/-(1|8|32)$/)?.[1] ?? (id === "media-live-8" ? 8 : 1));
}

function expectedBackend(id) {
  const ua = navigator.userAgent;
  if (id === "idle-teardown") return ["backdrop", "background-copy", "none"];
  if (id.startsWith("background-copy")) return ["background-copy"];
  if (id.startsWith("media-live")) return ["media-webgl"];
  if (id.startsWith("content-page")) return ["content-svg", "native"];
  if (id.startsWith("content-") || id === "mixed")
    return ["content-svg", "media-webgl", "background-copy", "native"];
  if (id.startsWith("backdrop") && /(?:Chrome|Chromium)\//.test(ua))
    return ["backdrop"];
  return ["content-svg", "background-copy", "native"];
}

function markup(id, count) {
  const baseX = id.startsWith("content-small")
    ? 280
    : id.startsWith("media-live")
      ? 320
      : 30;
  const baseY = id.startsWith("content-small")
    ? 280
    : id === "mixed"
      ? 300
      : id.startsWith("media-live")
        ? 300
        : id.startsWith("background-copy")
          ? 300
          : 40;
  const controlNames = ["switch", "slider", "toggle"];
  const lenses = Array.from(
    { length: count },
    (_, index) =>
      `<button class="perf-lens" data-lens="${index}" data-control="${controlNames[index] || "lens"}" style="left:${baseX + (index % 8) * 60}px;top:${baseY + Math.floor(index / 8) * 80}px">${controlNames[index] || index + 1}</button>`,
  ).join("");
  const media =
    id.startsWith("media-live") || id === "mixed"
      ? `<canvas id="media" width="640" height="360"></canvas>`
      : "";
  const lensesInsideScroller = id.startsWith("background-copy");
  return `<main id="surface"><div id="scroller"><div class="scroll-content"><div class="wallpaper-grid">${Array.from({ length: 160 }, (_, i) => `<span>live-${i}</span>`).join("")}</div>${media}${lensesInsideScroller ? `<div id="lenses">${lenses}</div>` : ""}</div></div></main>${lensesInsideScroller ? "" : `<div id="lenses">${lenses}</div>`}<button id="interaction">interact</button>`;
}

function animateCanvas(canvas, state) {
  const context = canvas?.getContext("2d");
  if (!context) return () => {};
  let frame = 0;
  const draw = () => {
    if (!state.running) return;
    const gradient = context.createLinearGradient(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    gradient.addColorStop(0, `hsl(${frame % 360} 80% 55%)`);
    gradient.addColorStop(1, `hsl(${(frame + 160) % 360} 80% 35%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    frame += 2;
    state.canvasRaf = requestAnimationFrame(draw);
  };
  draw();
  return () => cancelAnimationFrame(state.canvasRaf);
}

async function mount({ scenario, effect }) {
  await teardown();
  resetInteractions();
  const count = countFrom(scenario);
  app.innerHTML = markup(scenario, count);
  document.body.dataset.scenario = scenario;
  document.body.dataset.effect = String(effect);
  const state = {
    scenario,
    effect,
    scope: null,
    handles: [],
    lensHandles: [],
    running: true,
    motion: 0,
    scrollDistance: 0,
    manualGeometryChanged: 0,
    baselineOwned: document.querySelectorAll(".lg,.lgs-surface,.lgm-overlay")
      .length,
  };
  current = state;
  const started = performance.now();
  const scope = createGlassScope({ quality: "balanced", fallback: "blur" });
  state.scope = scope;
  const surface = document.querySelector("#surface");
  const canvas = document.querySelector("#media");
  const explicitCopy =
    scenario.startsWith("background-copy") || scenario === "mixed";
  if (effect) {
    if (
      !scenario.startsWith("background-copy") &&
      !scenario.startsWith("media-live") &&
      scenario !== "idle-teardown"
    ) {
      state.handles.push(scope.createSurface(surface));
    }
    if (canvas)
      state.handles.push(scope.createMediaSurface(canvas, { live: true }));
    for (const lens of document.querySelectorAll(".perf-lens")) {
      const options = explicitCopy
        ? {
            background: "linear-gradient(135deg,#f64,#35f)",
            surfaces: canvas ? state.handles : "auto",
          }
        : scenario.startsWith("content-") || scenario.startsWith("media-live")
          ? { background: false }
          : {};
      const handle = scope.glass(lens, options);
      state.handles.push(handle);
      state.lensHandles.push(handle);
    }
  }
  state.stopCanvas = animateCanvas(canvas, state);
  document.querySelector("#interaction").addEventListener("click", async () => {
    const click = performance.now();
    await twoFrames();
    interactionResults.push(performance.now() - click);
  });
  const ready = performance.now() - started;
  await twoFrames();
  state.mountReady = ready;
  state.mountSecondPaint = performance.now() - started;
  return snapshot();
}

async function teardown() {
  if (!current) return { ownedNodeGrowth: 0 };
  current.running = false;
  current.stopCanvas?.();
  current.scope?.destroy();
  const owned = document.querySelectorAll(
    ".lg,.lgs-surface,.lgm-overlay",
  ).length;
  const result = { ownedNodeGrowth: owned - current.baselineOwned };
  app.innerHTML = "";
  current = null;
  return result;
}

function driveMotion(frame) {
  if (!current) return;
  const mode = scenarioMotionMode(current.scenario);
  if (mode === "idle") return;
  if (mode === "scroll") {
    const scroller = document.querySelector("#scroller");
    const next = Math.abs(((frame * 4) % 240) - 120);
    scroller.scrollTop = next;
    current.scrollDistance = Math.max(
      current.scrollDistance,
      Math.abs(scroller.scrollTop),
    );
  } else if (shouldNotifyManualGeometry(current.scenario)) {
    for (const [index, lens] of [
      ...document.querySelectorAll(".perf-lens"),
    ].entries()) {
      lens.style.transform = `translate(${Math.sin((frame + index) / 9) * 18}px,${Math.cos((frame + index) / 11) * 8}px)`;
      if (current.lensHandles[index]) {
        current.lensHandles[index].geometryChanged();
        current.manualGeometryChanged++;
      }
    }
  }
  current.motion++;
}

async function calibrate(frames = 60) {
  const stamps = [];
  for (let i = 0; i < frames; i++) stamps.push(await raf());
  const deltas = stamps.slice(1).map((value, index) => value - stamps[index]);
  return deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)];
}

async function runFrames({ scenario, effect, frames, injectWork = 0 }) {
  resetInteractions();
  const mounted = await mount({ scenario, effect });
  const calibratedInterval = await calibrate(30);
  const stamps = [];
  for (let i = 0; i < frames; i++) {
    const time = await raf();
    driveMotion(i);
    if (injectWork) {
      const until = performance.now() + injectWork;
      while (performance.now() < until) {
        /* intentional negative self-test */
      }
    }
    stamps.push(time);
  }
  const deltas = stamps.slice(1).map((value, index) => value - stamps[index]);
  return {
    ...mounted,
    ...snapshot(),
    calibratedInterval,
    deltas,
    interactionResults: [...interactionResults],
    diagnostics: current.scope.getDiagnostics(),
  };
}

function snapshot() {
  const lens = document.querySelector(".perf-lens");
  const rect = lens?.getBoundingClientRect();
  const backends = [...document.querySelectorAll(".perf-lens")].flatMap(
    (element) => (element.dataset.lgBackend || "").split(",").filter(Boolean),
  );
  return {
    scenario: current?.scenario,
    effect: current?.effect,
    backends: [...new Set(backends)],
    expectedBackends: expectedBackend(current?.scenario || ""),
    motion: current?.motion ?? 0,
    scrollDistance: current?.scrollDistance ?? 0,
    manualGeometryChanged: current?.manualGeometryChanged ?? 0,
    mountReady: current?.mountReady ?? 0,
    mountSecondPaint: current?.mountSecondPaint ?? 0,
    diagnostics: current?.scope?.getDiagnostics() ?? null,
    roi: rect
      ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      : null,
  };
}

window.__liquidGlassPerf = {
  ready: true,
  runFrames,
  settle: twoFrames,
  snapshot,
  teardown,
  mount,
  resetInteractions,
  get interactionResults() {
    return interactionResults;
  },
  get pageErrors() {
    return [...pageErrors];
  },
};
