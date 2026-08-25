import type { GlassBudgets, GlassDiagnostics, GlassOptions } from "./types.js";
import type { ContentSurface } from "./surfaces.js";
import type { MediaSurface } from "./media.js";
import type { PolicyDecision } from "./policy.js";

export interface MutableDiagnostics {
  lenses: number;
  contentSurfaces: number;
  mediaSurfaces: number;
  filterRebuilds: number;
  mapRegenerations: number;
  geometryRafCallbacks: number;
  mediaRafCallbacks: number;
  mediaUploads: number;
  backdropWorkload: {
    lenses: number;
    devicePixelPassArea: number;
    tier: "full" | "lean";
    reason: string;
  };
  backgroundCopyWorkload: {
    lenses: number;
    admitted?: number;
    devicePixelPassArea: number;
    tier: "full" | "lean" | "native" | "partial";
    reason: string;
  };
  policy: Array<{
    backend: import("./types.js").GlassBackend;
    reason: string;
    dpr: number;
    chroma: number;
    specular: number;
    filterWidth: number;
    filterHeight: number;
    deviceArea: number;
  }>;
}

export interface ScopeRuntime {
  readonly content: Set<ContentSurface>;
  readonly media: Set<MediaSurface>;
  readonly lenses: Set<{ destroy(): void; refresh(): void }>;
  readonly defaults: GlassOptions;
  readonly budgets?: GlassBudgets;
  readonly diagnostics: MutableDiagnostics;
  readonly backdropWorkloads: Map<object, BackdropWorkload>;
  backdropDevicePixelPassArea: number;
  readonly backdropQualityCounts: Record<
    import("./types.js").GlassQuality,
    number
  >;
  backdropRefreshQueued: boolean;
  readonly backgroundCopyWorkloads: Map<object, TrackedBackgroundCopyWorkload>;
  backgroundCopyDevicePixelPassArea: number;
  backgroundCopyRefreshQueued: boolean;
  background: string | null;
  destroyed: boolean;
}

export interface BackdropWorkload {
  deviceArea: number;
  passMultiplier: number;
  quality: import("./types.js").GlassQuality;
  refresh(): void;
}

export interface BackgroundCopyWorkload {
  deviceArea: number;
  passMultiplier: number;
  engine: import("./policy.js").GlassEngine;
  refresh(): void;
}

interface TrackedBackgroundCopyWorkload extends BackgroundCopyWorkload {
  readonly insertionSequence: number;
  admitted: boolean | null;
  rejectionReason: string | null;
}

export const BACKDROP_AGGREGATE_THRESHOLDS = {
  performance: 0,
  balanced: 1_500_000,
  fidelity: 3_000_000,
} as const;

const BACKDROP_EXIT_HYSTERESIS = 0.8;

/**
 * Calibrated in branded browsers. Safari 26.5 degrades above one balanced
 * 240x176 copy; Chrome 149 sustains eight copies but collapses at 32. Firefox
 * uses the same provisional dense-copy ceiling pending broader hardware data.
 */
export const BACKGROUND_COPY_AGGREGATE_THRESHOLDS = {
  chromium: 12_000_000,
  firefox: 12_000_000,
  webkit: 1_500_000,
} as const;

/** Entry point for the reduced-cost copy tier; equal to native means skipped. */
export const BACKGROUND_COPY_LEAN_THRESHOLDS = {
  chromium: BACKGROUND_COPY_AGGREGATE_THRESHOLDS.chromium,
  firefox: 6_000_000,
  webkit: BACKGROUND_COPY_AGGREGATE_THRESHOLDS.webkit,
} as const;

const BACKGROUND_COPY_EXIT_HYSTERESIS = 0.7;
let backgroundCopyInsertionSequence = 0;
const backgroundCopyQualityTiers = new WeakMap<ScopeRuntime, "full" | "lean">();

export interface BackgroundCopyWorkloadVerdict {
  readonly tier: "full" | "lean" | "native";
  readonly reason: string;
}

/** Return this lens's aggregate-copy verdict, independent of its siblings. */
export function backgroundCopyWorkloadVerdict(
  runtime: ScopeRuntime | undefined,
  key: object,
): BackgroundCopyWorkloadVerdict | null {
  if (!runtime) return null;
  const workload = runtime.backgroundCopyWorkloads.get(key);
  if (!workload) return null;
  if (!workload.admitted) {
    return {
      tier: "native",
      reason:
        workload.rejectionReason ?? "aggregate-admission-over-copy-budget",
    };
  }
  const tier = backgroundCopyQualityTiers.get(runtime) ?? "full";
  return {
    tier,
    reason:
      tier === "lean"
        ? "aggregate-background-copy-lean-device-pixel-pass-budget"
        : "within-aggregate-background-copy-budget",
  };
}

/** Update one visible backdrop lens and coalesce any tier transition refresh. */
export function updateBackdropWorkload(
  runtime: ScopeRuntime | undefined,
  key: object,
  workload: BackdropWorkload | null,
): void {
  if (!runtime) return;
  const previousWorkload = runtime.backdropWorkloads.get(key);
  if (previousWorkload) {
    runtime.backdropDevicePixelPassArea -=
      previousWorkload.deviceArea * previousWorkload.passMultiplier;
    runtime.backdropQualityCounts[previousWorkload.quality]--;
  }
  if (workload) {
    runtime.backdropWorkloads.set(key, workload);
    runtime.backdropDevicePixelPassArea +=
      workload.deviceArea * workload.passMultiplier;
    runtime.backdropQualityCounts[workload.quality]++;
  } else {
    runtime.backdropWorkloads.delete(key);
  }

  // Incremental totals keep an unchanged live-tracked lens O(1). Iterating the
  // lens set is reserved for the rare threshold transition refresh.
  const total = Math.max(0, runtime.backdropDevicePixelPassArea);
  runtime.backdropDevicePixelPassArea = total;
  const strictestQuality = runtime.backdropQualityCounts.performance
    ? "performance"
    : runtime.backdropQualityCounts.balanced
      ? "balanced"
      : runtime.backdropQualityCounts.fidelity
        ? "fidelity"
        : null;
  const threshold = strictestQuality
    ? BACKDROP_AGGREGATE_THRESHOLDS[strictestQuality]
    : BACKDROP_AGGREGATE_THRESHOLDS.balanced;
  const previous = runtime.diagnostics.backdropWorkload.tier;
  const next =
    previous === "lean"
      ? total < threshold * BACKDROP_EXIT_HYSTERESIS
        ? "full"
        : "lean"
      : total > threshold
        ? "lean"
        : "full";
  runtime.diagnostics.backdropWorkload = {
    lenses: runtime.backdropWorkloads.size,
    devicePixelPassArea: total,
    tier: next,
    reason:
      next === "lean"
        ? "aggregate-backdrop-device-pixel-pass-budget"
        : "within-aggregate-backdrop-budget",
  };
  if (next === previous || runtime.backdropRefreshQueued) return;
  runtime.backdropRefreshQueued = true;
  queueMicrotask(() => {
    runtime.backdropRefreshQueued = false;
    if (runtime.destroyed) return;
    for (const entry of runtime.backdropWorkloads.values()) entry.refresh();
  });
}

/** Update one visible painted copy and coalesce admission/quality refreshes. */
export function updateBackgroundCopyWorkload(
  runtime: ScopeRuntime | undefined,
  key: object,
  workload: BackgroundCopyWorkload | null,
): void {
  if (!runtime) return;
  const previousWorkload = runtime.backgroundCopyWorkloads.get(key);
  if (
    previousWorkload &&
    workload &&
    previousWorkload.deviceArea === workload.deviceArea &&
    previousWorkload.passMultiplier === workload.passMultiplier &&
    previousWorkload.engine === workload.engine
  ) {
    // Geometry notifications often re-report an identical workload. Keep that
    // hot path O(1), while retaining the latest closure for a later refresh.
    previousWorkload.refresh = workload.refresh;
    return;
  }

  const previousAdmissions = new Map<object, boolean | null>();
  for (const [entryKey, entry] of runtime.backgroundCopyWorkloads) {
    previousAdmissions.set(entryKey, entry.admitted);
  }
  const previousQualityTier = backgroundCopyQualityTiers.get(runtime) ?? "full";
  if (previousWorkload) {
    runtime.backgroundCopyDevicePixelPassArea -=
      previousWorkload.deviceArea * previousWorkload.passMultiplier;
  }
  if (workload) {
    runtime.backgroundCopyWorkloads.set(key, {
      ...workload,
      insertionSequence:
        previousWorkload?.insertionSequence ??
        backgroundCopyInsertionSequence++,
      admitted: previousWorkload?.admitted ?? null,
      rejectionReason: previousWorkload?.rejectionReason ?? null,
    });
    runtime.backgroundCopyDevicePixelPassArea +=
      workload.deviceArea * workload.passMultiplier;
  } else {
    runtime.backgroundCopyWorkloads.delete(key);
  }

  const total = Math.max(0, runtime.backgroundCopyDevicePixelPassArea);
  runtime.backgroundCopyDevicePixelPassArea = total;
  const engine =
    workload?.engine ??
    runtime.backgroundCopyWorkloads.values().next().value?.engine ??
    "chromium";
  const nativeThreshold = BACKGROUND_COPY_AGGREGATE_THRESHOLDS[engine];
  const leanThreshold = BACKGROUND_COPY_LEAN_THRESHOLDS[engine];
  const qualityTier =
    leanThreshold === nativeThreshold
      ? "full"
      : previousQualityTier === "lean"
        ? total < leanThreshold * BACKGROUND_COPY_EXIT_HYSTERESIS
          ? "full"
          : "lean"
        : total > leanThreshold
          ? "lean"
          : "full";
  backgroundCopyQualityTiers.set(runtime, qualityTier);

  const ordered = [...runtime.backgroundCopyWorkloads.values()].sort(
    (left, right) =>
      left.deviceArea * left.passMultiplier -
        right.deviceArea * right.passMultiplier ||
      left.insertionSequence - right.insertionSequence,
  );
  let admittedCost = 0;
  let admitted = 0;
  for (const entry of ordered) {
    const cost = entry.deviceArea * entry.passMultiplier;
    // New lenses enter against the full budget. Once rejected, they need the
    // lower exit threshold before re-entry; admitted lenses keep their place
    // until the greedy running total actually exceeds the full budget.
    const postAdmissionCost = admittedCost + cost;
    const withinAdmissionThreshold =
      entry.admitted === false
        ? postAdmissionCost < nativeThreshold * BACKGROUND_COPY_EXIT_HYSTERESIS
        : postAdmissionCost <= nativeThreshold;
    if (withinAdmissionThreshold) {
      entry.admitted = true;
      entry.rejectionReason = null;
      admittedCost += cost;
      admitted++;
    } else {
      entry.admitted = false;
      entry.rejectionReason =
        cost > nativeThreshold
          ? "aggregate-background-copy-device-pixel-pass-budget"
          : "aggregate-admission-over-copy-budget";
    }
  }

  const lenses = runtime.backgroundCopyWorkloads.size;
  const next: "full" | "lean" | "native" | "partial" =
    admitted === 0 && lenses > 0
      ? "native"
      : admitted < lenses
        ? "partial"
        : qualityTier;
  const everyRejectedLensExceedsBudget =
    lenses > 0 &&
    ordered.every(
      (entry) => entry.deviceArea * entry.passMultiplier > nativeThreshold,
    );
  runtime.diagnostics.backgroundCopyWorkload = {
    lenses,
    admitted,
    devicePixelPassArea: total,
    tier: next,
    reason:
      next === "partial"
        ? "aggregate-admission-over-copy-budget"
        : next === "native"
          ? everyRejectedLensExceedsBudget
            ? "aggregate-background-copy-device-pixel-pass-budget"
            : "aggregate-admission-over-copy-budget"
          : next === "lean"
            ? "aggregate-background-copy-lean-device-pixel-pass-budget"
            : "within-aggregate-background-copy-budget",
  };
  let verdictChanged = previousQualityTier !== qualityTier;
  if (!verdictChanged) {
    for (const [entryKey, entry] of runtime.backgroundCopyWorkloads) {
      const previousAdmission = previousAdmissions.get(entryKey);
      if (
        previousAdmission !== undefined &&
        previousAdmission !== entry.admitted
      ) {
        verdictChanged = true;
        break;
      }
    }
  }
  if (!verdictChanged || runtime.backgroundCopyRefreshQueued) return;
  runtime.backgroundCopyRefreshQueued = true;
  queueMicrotask(() => {
    runtime.backgroundCopyRefreshQueued = false;
    if (runtime.destroyed) return;
    for (const entry of runtime.backgroundCopyWorkloads.values())
      entry.refresh();
  });
}

export function diagnosticsSnapshot(
  value: MutableDiagnostics,
): GlassDiagnostics {
  return Object.freeze({
    ...value,
    policy: Object.freeze([...value.policy]),
    backdropWorkload: Object.freeze({ ...value.backdropWorkload }),
    backgroundCopyWorkload: Object.freeze({
      ...value.backgroundCopyWorkload,
      admitted:
        value.backgroundCopyWorkload.admitted ??
        value.backgroundCopyWorkload.lenses,
    }),
  }) as GlassDiagnostics;
}

export function recordPolicy(
  runtime: ScopeRuntime | undefined,
  decision: PolicyDecision,
): void {
  if (!runtime) return;
  const next = {
    backend: decision.backend,
    reason: decision.reason,
    dpr: decision.dpr,
    chroma: decision.effectiveMaterial.chroma,
    specular: decision.effectiveMaterial.specular,
    filterWidth: decision.filterWidth,
    filterHeight: decision.filterHeight,
    deviceArea: decision.deviceArea,
  };
  const previous =
    runtime.diagnostics.policy[runtime.diagnostics.policy.length - 1];
  if (
    previous &&
    previous.backend === next.backend &&
    previous.reason === next.reason &&
    previous.dpr === next.dpr &&
    previous.chroma === next.chroma &&
    previous.specular === next.specular &&
    previous.filterWidth === next.filterWidth &&
    previous.filterHeight === next.filterHeight &&
    previous.deviceArea === next.deviceArea
  ) {
    return;
  }
  runtime.diagnostics.policy.push(next);
  if (runtime.diagnostics.policy.length > 50)
    runtime.diagnostics.policy.shift();
}
