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
  background: string | null;
  destroyed: boolean;
}

export function diagnosticsSnapshot(
  value: MutableDiagnostics,
): GlassDiagnostics {
  return Object.freeze({ ...value, policy: Object.freeze([...value.policy]) });
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
