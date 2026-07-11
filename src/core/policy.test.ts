import { describe, expect, it } from "vitest";
import { chooseGlassPolicy, PROVISIONAL_AREA_BUDGETS } from "./policy.js";
import type { ResolvedLensMaterial } from "./types.js";

const material: ResolvedLensMaterial = {
  radius: 16,
  depth: 14,
  scale: 90,
  blur: 0.6,
  chroma: 0.4,
  specular: 0.5,
  specularAngle: 135,
  dpr: 2,
  quality: "balanced",
  fallback: "blur",
};

describe("glass runtime policy", () => {
  it.each([
    "chromium",
    "firefox",
    "webkit",
  ] as const)("keeps small bounded %s surfaces at full backend fidelity", (engine) => {
    const result = chooseGlassPolicy({
      engine,
      desiredBackend: "content-svg",
      quality: "balanced",
      fallback: "blur",
      material,
      width: 200,
      height: 100,
      dpr: 2,
    });
    expect(result.backend).toBe("content-svg");
    expect(result.reason).toContain("provisional");
    expect(result.effectiveMaterial.dpr).toBe(1.5);
  });

  it("is quality-monotonic and applies the documented caps", () => {
    const decisions = (["performance", "balanced", "fidelity"] as const).map(
      (quality) =>
        chooseGlassPolicy({
          engine: "chromium",
          desiredBackend: "content-svg",
          quality,
          fallback: "blur",
          material: { ...material, quality },
          width: 1000,
          height: 500,
          dpr: 1,
        }),
    );
    expect(decisions.map((d) => d.provisionalBudget)).toEqual([
      PROVISIONAL_AREA_BUDGETS.chromium * 0.5,
      PROVISIONAL_AREA_BUDGETS.chromium,
      PROVISIONAL_AREA_BUDGETS.chromium * 2,
    ]);
    expect(decisions[0].effectiveMaterial).toMatchObject({
      dpr: 1,
      chroma: 0,
      specular: 0,
    });
    expect(decisions[1].effectiveMaterial.dpr).toBe(1.5);
    expect(decisions[2].effectiveMaterial.dpr).toBe(2);
  });

  it("enforces Firefox area and WebKit hard-dimension fallbacks", () => {
    const firefox = chooseGlassPolicy({
      engine: "firefox",
      desiredBackend: "content-svg",
      quality: "balanced",
      fallback: "tint",
      material,
      width: 1000,
      height: 1000,
      dpr: 1,
    });
    expect(firefox.backend).toBe("native");
    expect(firefox.reason).toBe("provisional-area-budget");
    const webkit = chooseGlassPolicy({
      engine: "webkit",
      desiredBackend: "content-svg",
      quality: "fidelity",
      fallback: "none",
      material,
      width: 1100,
      height: 100,
      dpr: 2,
    });
    expect(webkit.backend).toBe("none");
    expect(webkit.reason).toBe("webkit-hard-dimension");
  });

  it("degrades when filter reach pushes raw-under-budget content over area", () => {
    const result = chooseGlassPolicy({
      engine: "chromium",
      desiredBackend: "content-svg",
      quality: "balanced",
      fallback: "blur",
      material,
      width: 1600,
      height: 1600,
      dpr: 1,
    });
    expect(1600 * 1600).toBeLessThan(result.provisionalBudget);
    expect(result.deviceArea).toBeGreaterThan(result.provisionalBudget);
    expect(result.filterWidth).toBeGreaterThan(1600);
    expect(result.backend).toBe("native");
  });

  it("includes reach in WebKit's hard dimension without expanding backdrop carriers", () => {
    const content = chooseGlassPolicy({
      engine: "webkit",
      desiredBackend: "content-svg",
      quality: "fidelity",
      fallback: "blur",
      material: { ...material, quality: "fidelity" },
      width: 1900,
      height: 100,
      dpr: 1,
    });
    expect(content.filterWidth).toBeGreaterThan(2048);
    expect(content.reason).toBe("webkit-hard-dimension");

    const backdrop = chooseGlassPolicy({
      engine: "webkit",
      desiredBackend: "backdrop",
      quality: "fidelity",
      fallback: "blur",
      material: { ...material, quality: "fidelity" },
      width: 1900,
      height: 100,
      dpr: 1,
    });
    expect(backdrop.filterWidth).toBe(1900);
    expect(backdrop.backend).toBe("backdrop");
  });
});
