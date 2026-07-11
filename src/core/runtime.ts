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
  background: string | null;
  destroyed: boolean;
}

export interface BackdropWorkload {
  deviceArea: number;
  passMultiplier: number;
  quality: import("./types.js").GlassQuality;
  refresh(): void;
}

export const BACKDROP_AGGREGATE_THRESHOLDS = {
  performance: 0,
  balanced: 1_500_000,
  fidelity: 3_000_000,
} as const;

const BACKDROP_EXIT_HYSTERESIS = 0.8;

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

export function diagnosticsSnapshot(
  value: MutableDiagnostics,
): GlassDiagnostics {
  return Object.freeze({
    ...value,
    policy: Object.freeze([...value.policy]),
    backdropWorkload: Object.freeze({ ...value.backdropWorkload }),
  });
}

export function recordPolicy(
  runtime: ScopeRuntime | undefined,
  decision: PolicyDecision,
): void {
  if (!runtime) return;
  const next = {
    backend: decision.backend,
    reason: decision.reason,
    dpr: decision.effectiveMaterial.dpr,
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
