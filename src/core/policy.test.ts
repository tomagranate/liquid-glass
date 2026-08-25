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

  it("keeps the desired WebKit backend by clamping a 1080px lens", () => {
    const result = chooseGlassPolicy({
      engine: "webkit",
      desiredBackend: "background-copy",
      quality: "fidelity",
      fallback: "blur",
      material: { ...material, quality: "fidelity" },
      width: 1080,
      height: 51,
      dpr: 2,
    });
    expect(result.backend).toBe("background-copy");
    expect(result.reason).toBe("dpr-clamped-to-dimension-cap");
    expect(result.dpr).toBeLessThan(2);
    expect(result.effectiveMaterial.dpr).toBe(result.dpr);
    expect(result.filterWidth).toBeLessThanOrEqual(2048);
  });

  it("keeps old fallback reasons when no valid DPR exists", () => {
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
      fallback: "blur",
      material: {
        ...material,
        scale: 0,
        blur: 0,
        chroma: 0,
        quality: "fidelity",
      },
      width: 2200,
      height: 100,
      dpr: 2,
    });
    expect(webkit.backend).toBe("native");
    expect(webkit.reason).toBe("webkit-hard-dimension");
  });

  it("clamps a Firefox area-budget decision and its map supersampling", () => {
    const result = chooseGlassPolicy({
      engine: "firefox",
      desiredBackend: "content-svg",
      quality: "balanced",
      fallback: "blur",
      material: { ...material, scale: 0, blur: 0, chroma: 0 },
      width: 800,
      height: 500,
      dpr: 2,
    });
    expect(result.backend).toBe("content-svg");
    expect(result.reason).toBe("dpr-clamped-to-area-budget");
    expect(result.dpr).toBeCloseTo(Math.sqrt(750_000 / (800 * 500)));
    expect(result.effectiveMaterial.dpr).toBe(result.dpr);
    expect(result.deviceArea).toBeCloseTo(result.provisionalBudget);
  });

  it("uses the stricter animated-risk cap for moving Firefox filters", () => {
    const result = chooseGlassPolicy({
      engine: "firefox",
      desiredBackend: "content-svg",
      quality: "balanced",
      fallback: "blur",
      material: { ...material, scale: 0, blur: 0, chroma: 0 },
      width: 600,
      height: 400,
      dpr: 2,
      moving: true,
    });
    expect(result.backend).toBe("content-svg");
    expect(result.reason).toBe("dpr-clamped-to-animated-risk");
    expect(result.dpr).toBe(1.25);
    expect(result.effectiveMaterial.dpr).toBe(1.25);
    expect(result.deviceArea).toBe(result.provisionalBudget * 0.5);
  });

  it("accepts an exact DPR 1 dimension cap but never clamps below it", () => {
    const result = chooseGlassPolicy({
      engine: "webkit",
      desiredBackend: "background-copy",
      quality: "fidelity",
      fallback: "blur",
      material: {
        ...material,
        scale: 0,
        blur: 0,
        chroma: 0,
        quality: "fidelity",
      },
      width: 2048,
      height: 51,
      dpr: 2,
    });
    expect(result.backend).toBe("background-copy");
    expect(result.reason).toBe("dpr-clamped-to-dimension-cap");
    expect(result.dpr).toBe(1);
    expect(result.effectiveMaterial.dpr).toBe(1);
    expect(result.filterWidth).toBe(2048);
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
