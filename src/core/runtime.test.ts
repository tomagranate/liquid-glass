import { describe, expect, it, vi } from "vitest";
import {
  BACKDROP_AGGREGATE_THRESHOLDS,
  BACKGROUND_COPY_AGGREGATE_THRESHOLDS,
  BACKGROUND_COPY_LEAN_THRESHOLDS,
  type ScopeRuntime,
  updateBackdropWorkload,
  updateBackgroundCopyWorkload,
} from "./runtime.js";

function fakeRuntime(): ScopeRuntime {
  return {
    content: new Set(),
    media: new Set(),
    lenses: new Set(),
    defaults: {},
    diagnostics: {
      lenses: 0,
      contentSurfaces: 0,
      mediaSurfaces: 0,
      filterRebuilds: 0,
      mapRegenerations: 0,
      geometryRafCallbacks: 0,
      mediaRafCallbacks: 0,
      mediaUploads: 0,
      backdropWorkload: {
        lenses: 0,
        devicePixelPassArea: 0,
        tier: "full",
        reason: "within-aggregate-backdrop-budget",
      },
      backgroundCopyWorkload: {
        lenses: 0,
        devicePixelPassArea: 0,
        tier: "full",
        reason: "within-aggregate-background-copy-budget",
      },
      policy: [],
    },
    backdropWorkloads: new Map(),
    backdropDevicePixelPassArea: 0,
    backdropQualityCounts: { performance: 0, balanced: 0, fidelity: 0 },
    backdropRefreshQueued: false,
    backgroundCopyWorkloads: new Map(),
    backgroundCopyDevicePixelPassArea: 0,
    backgroundCopyRefreshQueued: false,
    background: null,
    destroyed: false,
  };
}

describe("aggregate backdrop workload", () => {
  it("accounts add/remove/resize and coalesces one refresh per tier crossing", async () => {
    const runtime = fakeRuntime();
    const refreshes = Array.from({ length: 8 }, () => vi.fn());
    const keys = refreshes.map(() => ({}));
    for (let index = 0; index < keys.length; index++) {
      updateBackdropWorkload(runtime, keys[index], {
        deviceArea: 100_000,
        passMultiplier: 3,
        quality: "balanced",
        refresh: refreshes[index],
      });
    }
    expect(runtime.diagnostics.backdropWorkload).toMatchObject({
      lenses: 8,
      devicePixelPassArea: 2_400_000,
      tier: "lean",
      reason: "aggregate-backdrop-device-pixel-pass-budget",
    });
    await Promise.resolve();
    expect(refreshes.every((refresh) => refresh.mock.calls.length === 1)).toBe(
      true,
    );

    updateBackdropWorkload(runtime, keys[0], {
      deviceArea: 120_000,
      passMultiplier: 3,
      quality: "balanced",
      refresh: refreshes[0],
    });
    expect(runtime.diagnostics.backdropWorkload.devicePixelPassArea).toBe(
      2_460_000,
    );
    await Promise.resolve();
    expect(refreshes[0]).toHaveBeenCalledTimes(1);

    for (let index = 0; index < 5; index++) {
      updateBackdropWorkload(runtime, keys[index], null);
    }
    expect(runtime.diagnostics.backdropWorkload).toMatchObject({
      lenses: 3,
      devicePixelPassArea: 900_000,
      tier: "full",
    });
    await Promise.resolve();
    expect(
      refreshes.slice(5).every((refresh) => refresh.mock.calls.length === 2),
    ).toBe(true);
  });

  it("keeps quality thresholds monotonic with a fidelity hard cap", () => {
    expect(BACKDROP_AGGREGATE_THRESHOLDS.performance).toBeLessThan(
      BACKDROP_AGGREGATE_THRESHOLDS.balanced,
    );
    expect(BACKDROP_AGGREGATE_THRESHOLDS.balanced).toBeLessThan(
      BACKDROP_AGGREGATE_THRESHOLDS.fidelity,
    );
    expect(BACKDROP_AGGREGATE_THRESHOLDS.fidelity).toBe(3_000_000);
  });
});

describe("aggregate background-copy workload", () => {
  it("falls back on WebKit and restores below the hysteresis boundary", async () => {
    const runtime = fakeRuntime();
    const first = vi.fn();
    const second = vi.fn();
    const one = {};
    const two = {};
    updateBackgroundCopyWorkload(runtime, one, {
      deviceArea: 343_440,
      passMultiplier: 3,
      engine: "webkit",
      refresh: first,
    });
    expect(runtime.diagnostics.backgroundCopyWorkload.tier).toBe("full");
    updateBackgroundCopyWorkload(runtime, two, {
      deviceArea: 343_440,
      passMultiplier: 3,
      engine: "webkit",
      refresh: second,
    });
    expect(runtime.diagnostics.backgroundCopyWorkload).toMatchObject({
      lenses: 2,
      devicePixelPassArea: 2_060_640,
      tier: "native",
      reason: "aggregate-background-copy-device-pixel-pass-budget",
    });
    await Promise.resolve();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    updateBackgroundCopyWorkload(runtime, two, null);
    expect(runtime.diagnostics.backgroundCopyWorkload.tier).toBe("full");
    await Promise.resolve();
    expect(first).toHaveBeenCalledTimes(2);
  });

  it("keeps Chrome and Firefox dense-copy ceilings above eight calibrated lenses", () => {
    expect(BACKGROUND_COPY_AGGREGATE_THRESHOLDS.chromium).toBe(12_000_000);
    expect(BACKGROUND_COPY_AGGREGATE_THRESHOLDS.firefox).toBe(12_000_000);
    expect(BACKGROUND_COPY_AGGREGATE_THRESHOLDS.chromium).toBeGreaterThan(
      BACKGROUND_COPY_AGGREGATE_THRESHOLDS.webkit,
    );
    expect(BACKGROUND_COPY_LEAN_THRESHOLDS).toEqual({
      chromium: 12_000_000,
      firefox: 6_000_000,
      webkit: 1_500_000,
    });
  });

  it("leans eight Firefox copies, falls back when dense, and restores with hysteresis", async () => {
    const runtime = fakeRuntime();
    const keys = Array.from({ length: 12 }, () => ({}));
    const refresh = vi.fn();
    for (const key of keys.slice(0, 8)) {
      updateBackgroundCopyWorkload(runtime, key, {
        deviceArea: 343_440,
        passMultiplier: 3,
        engine: "firefox",
        refresh,
      });
    }
    expect(runtime.diagnostics.backgroundCopyWorkload).toMatchObject({
      lenses: 8,
      tier: "lean",
      reason: "aggregate-background-copy-lean-device-pixel-pass-budget",
    });
    for (const key of keys.slice(8)) {
      updateBackgroundCopyWorkload(runtime, key, {
        deviceArea: 343_440,
        passMultiplier: 3,
        engine: "firefox",
        refresh,
      });
    }
    expect(runtime.diagnostics.backgroundCopyWorkload).toMatchObject({
      lenses: 12,
      tier: "native",
      reason: "aggregate-background-copy-device-pixel-pass-budget",
    });
    await Promise.resolve();
    for (const key of keys.slice(8))
      updateBackgroundCopyWorkload(runtime, key, null);
    expect(runtime.diagnostics.backgroundCopyWorkload).toMatchObject({
      lenses: 8,
      tier: "lean",
    });
    for (const key of keys.slice(4, 8))
      updateBackgroundCopyWorkload(runtime, key, null);
    expect(runtime.diagnostics.backgroundCopyWorkload).toMatchObject({
      lenses: 4,
      tier: "full",
      reason: "within-aggregate-background-copy-budget",
    });
  });

  it("preserves eight full Chrome copies and routes a dense group to native", () => {
    const runtime = fakeRuntime();
    for (let index = 0; index < 8; index++) {
      updateBackgroundCopyWorkload(
        runtime,
        {},
        {
          deviceArea: 343_440,
          passMultiplier: 3,
          engine: "chromium",
          refresh: vi.fn(),
        },
      );
    }
    expect(runtime.diagnostics.backgroundCopyWorkload.tier).toBe("full");
    for (let index = 8; index < 12; index++) {
      updateBackgroundCopyWorkload(
        runtime,
        {},
        {
          deviceArea: 343_440,
          passMultiplier: 3,
          engine: "chromium",
          refresh: vi.fn(),
        },
      );
    }
    expect(runtime.diagnostics.backgroundCopyWorkload.tier).toBe("native");
  });
});
