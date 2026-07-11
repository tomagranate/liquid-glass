import type {
  GlassBackend,
  GlassBudgets,
  GlassFallback,
  GlassQuality,
  ResolvedLensMaterial,
} from "./types.js";

export type GlassEngine = "chromium" | "firefox" | "webkit";

export const PROVISIONAL_AREA_BUDGETS: Required<GlassBudgets> = {
  chromium: 3_000_000,
  firefox: 750_000,
  webkit: 1_500_000,
};

export interface PolicyInput {
  engine: GlassEngine;
  desiredBackend: GlassBackend;
  quality: GlassQuality;
  fallback: GlassFallback;
  material: ResolvedLensMaterial;
  width: number;
  height: number;
  dpr: number;
  visible?: boolean;
  moving?: boolean;
  budgets?: GlassBudgets;
}

export interface PolicyDecision {
  backend: GlassBackend;
  effectiveMaterial: ResolvedLensMaterial;
  reason: string;
  provisionalBudget: number;
  deviceArea: number;
}

export function detectEngine(): GlassEngine {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Firefox\//.test(ua)) return "firefox";
  if (/AppleWebKit\//.test(ua) && !/(?:Chrome|Chromium|Edg)\//.test(ua)) {
    return "webkit";
  }
  return "chromium";
}

function fallbackBackend(fallback: GlassFallback): GlassBackend {
  return fallback === "none" ? "none" : "native";
}

/** Pure provisional policy. All thresholds are public calibration hooks. */
export function chooseGlassPolicy(input: PolicyInput): PolicyDecision {
  const base = {
    ...PROVISIONAL_AREA_BUDGETS,
    ...input.budgets,
  }[input.engine];
  const multiplier =
    input.quality === "performance"
      ? 0.5
      : input.quality === "fidelity"
        ? 2
        : 1;
  const budget = base * multiplier;
  const dpr = Math.max(1, input.dpr || 1);
  const deviceArea = input.width * input.height * dpr * dpr;
  const material = { ...input.material };

  if (input.quality === "performance") {
    material.dpr = 1;
    material.chroma = 0;
    material.specular = 0;
  } else if (input.quality === "balanced") {
    material.dpr = Math.min(material.dpr, 1.5);
    if (deviceArea > budget * 0.5) {
      material.chroma = 0;
      material.specular = 0;
    }
  } else {
    material.dpr = Math.min(material.dpr, 2);
  }

  if (input.visible === false) {
    return {
      backend: "none",
      effectiveMaterial: material,
      reason: "offscreen",
      provisionalBudget: budget,
      deviceArea,
    };
  }
  const webkitHardDimension =
    input.engine === "webkit" &&
    (input.width * dpr > 2048 || input.height * dpr > 2048);
  const firefoxAnimatedRisk =
    input.engine === "firefox" && input.moving && deviceArea > budget * 0.5;
  if (webkitHardDimension || deviceArea > budget || firefoxAnimatedRisk) {
    return {
      backend: fallbackBackend(input.fallback),
      effectiveMaterial: material,
      reason: webkitHardDimension
        ? "webkit-hard-dimension"
        : firefoxAnimatedRisk
          ? "firefox-animated-software-filter"
          : "provisional-area-budget",
      provisionalBudget: budget,
      deviceArea,
    };
  }
  return {
    backend: input.desiredBackend,
    effectiveMaterial: material,
    reason: "within-provisional-budget",
    provisionalBudget: budget,
    deviceArea,
  };
}
