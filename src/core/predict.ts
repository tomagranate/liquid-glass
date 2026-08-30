interface Sample {
  left: number;
  top: number;
  t: number;
}

const STALE_MS = 100;
const MAX_PX = 120;
const MAX_LEAD = 1.5;
const MIN_FRAME_MS = 4;
const MAX_FRAME_MS = 50;
const FRAME_EMA_WEIGHT = 0.2;

const last = new WeakMap<Element, Sample>();
let frameMs = 16.7;
let lead = 1;
let lastFrameTime: number | null = null;
let hasFrameDelta = false;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function now(): number {
  if (typeof performance !== "undefined") return performance.now();
  return Date.now();
}

function makeRect(rect: DOMRect, left: number, top: number): DOMRect {
  if (typeof DOMRect !== "undefined") {
    return new DOMRect(left, top, rect.width, rect.height);
  }

  return {
    x: left,
    y: top,
    left,
    top,
    right: left + rect.width,
    bottom: top + rect.height,
    width: rect.width,
    height: rect.height,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * Record one animation frame so prediction follows the display refresh rate.
 * Custom animation loops must call this once for each rAF timestamp.
 */
export function recordAnimationFrame(timestamp: number): void {
  if (lastFrameTime !== null && timestamp > lastFrameTime) {
    const delta = timestamp - lastFrameTime;
    // A long gap is idle time or a blocked main thread, not a display frame.
    if (delta <= MAX_FRAME_MS) {
      const frameDelta = Math.max(delta, MIN_FRAME_MS);
      if (hasFrameDelta) {
        frameMs += (frameDelta - frameMs) * FRAME_EMA_WEIGHT;
      } else {
        frameMs = frameDelta;
        hasFrameDelta = true;
      }
    } else {
      hasFrameDelta = false;
    }
  }
  lastFrameTime = timestamp;
}

/** Forget frame cadence after animation-frame sampling stops. */
export function resetAnimationFrameTiming(): void {
  lastFrameTime = null;
  hasFrameDelta = false;
}

/** Measure `el` and return the rect the compositor will show next frame. */
export function predictRect(el: Element, timestamp = now()): DOMRect {
  const rect = el.getBoundingClientRect();
  const previous = last.get(el);
  last.set(el, { left: rect.left, top: rect.top, t: timestamp });

  if (!previous) return rect;
  const dt = timestamp - previous.t;
  if (dt <= 0 || dt > STALE_MS) return rect;

  const velocityX = (rect.left - previous.left) / dt;
  const velocityY = (rect.top - previous.top) / dt;
  const ahead = frameMs * Math.min(lead, MAX_LEAD);
  const dx = clamp(velocityX * ahead, -MAX_PX, MAX_PX);
  const dy = clamp(velocityY * ahead, -MAX_PX, MAX_PX);

  return makeRect(rect, rect.left + dx, rect.top + dy);
}

/** Forget velocity so the next call returns the exact rect. */
export function settle(el: Element): void {
  last.delete(el);
}

/** Set the global prediction lead. Values above 1.5 stay safety-clamped. */
export function setPredictionLead(value: number): void {
  if (!Number.isFinite(value)) return;
  lead = Math.max(0, value);
}

/** Return the configured prediction lead. */
export function getPredictionLead(): number {
  return lead;
}
