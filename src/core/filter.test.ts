import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildBackdropFilter,
  buildGlassFilter,
  isSafariEngine,
  moveFilterLens,
  supportsBackdropUrlFilter,
} from "./filter.js";
import type { SubLens } from "./types.js";

const SAFARI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const HEADLESS_CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const FIREFOX_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0";

const CRIOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1";

function countByName(el: Element, name: string): number {
  return Array.from(el.querySelectorAll("*")).filter(
    (n) => n.localName === name,
  ).length;
}

const lensA: SubLens = {
  id: "a",
  x: 10,
  y: 20,
  width: 100,
  height: 40,
  mapUrl: "data:image/png,a",
};
const lensB: SubLens = {
  id: "b",
  x: 200,
  y: 60,
  width: 80,
  height: 30,
  mapUrl: "data:image/png,b",
};

describe("isSafariEngine", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects real Safari", () => {
    vi.stubGlobal("navigator", { userAgent: SAFARI_UA });
    expect(isSafariEngine()).toBe(true);
  });

  it("does not treat Chrome as Safari", () => {
    vi.stubGlobal("navigator", { userAgent: CHROME_UA });
    expect(isSafariEngine()).toBe(false);
  });

  it("does not treat headless Chrome as Safari", () => {
    vi.stubGlobal("navigator", { userAgent: HEADLESS_CHROME_UA });
    expect(isSafariEngine()).toBe(false);
  });
});

describe("supportsBackdropUrlFilter", () => {
  const supportsUrlBackdrop = {
    supports: (property: string, value: string) =>
      property === "backdrop-filter" && value === "url(#x)",
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects Chromium via userAgentData brands when CSS.supports agrees", () => {
    vi.stubGlobal("navigator", {
      userAgent: CHROME_UA,
      userAgentData: {
        brands: [
          { brand: "Chromium", version: "126" },
          { brand: "Google Chrome", version: "126" },
        ],
      },
    });
    vi.stubGlobal("CSS", supportsUrlBackdrop);
    expect(supportsBackdropUrlFilter()).toBe(true);
  });

  it("falls back to the UA string when userAgentData is absent", () => {
    vi.stubGlobal("navigator", { userAgent: HEADLESS_CHROME_UA });
    vi.stubGlobal("CSS", supportsUrlBackdrop);
    expect(supportsBackdropUrlFilter()).toBe(true);
  });

  it("never engages on Safari, even when CSS.supports claims support", () => {
    vi.stubGlobal("navigator", { userAgent: SAFARI_UA });
    vi.stubGlobal("CSS", { supports: () => true });
    expect(supportsBackdropUrlFilter()).toBe(false);
  });

  it("never engages on Firefox", () => {
    vi.stubGlobal("navigator", { userAgent: FIREFOX_UA });
    vi.stubGlobal("CSS", { supports: () => true });
    expect(supportsBackdropUrlFilter()).toBe(false);
  });

  it("never engages on iOS Chrome (CriOS is WebKit)", () => {
    vi.stubGlobal("navigator", { userAgent: CRIOS_UA });
    vi.stubGlobal("CSS", { supports: () => true });
    expect(supportsBackdropUrlFilter()).toBe(false);
  });

  it("requires CSS.supports to confirm (jsdom-safe when CSS is undefined)", () => {
    vi.stubGlobal("navigator", { userAgent: CHROME_UA });
    vi.stubGlobal("CSS", undefined);
    expect(supportsBackdropUrlFilter()).toBe(false);

    vi.stubGlobal("CSS", { supports: () => false });
    expect(supportsBackdropUrlFilter()).toBe(false);
  });
});

describe("buildGlassFilter", () => {
  it("builds a neutral flood + one feImage bump per sub-lens, merged over the field", () => {
    const f = buildGlassFilter({
      id: "t1",
      lenses: [lensA, lensB],
      scale: 50,
    });
    expect(f.localName).toBe("filter");
    expect(f.id).toBe("t1");

    const flood = f.querySelector("feFlood");
    expect(flood?.getAttribute("flood-color")).toBe("rgb(128,128,128)");

    const bumps = Array.from(f.querySelectorAll("feImage"));
    expect(bumps).toHaveLength(2);
    expect(bumps[0].getAttribute("result")).toBe("lqbump-a");
    expect(bumps[0].getAttribute("href")).toBe("data:image/png,a");
    expect(bumps[0].getAttribute("x")).toBe("10");
    expect(bumps[0].getAttribute("y")).toBe("20");
    expect(bumps[1].getAttribute("result")).toBe("lqbump-b");
    expect(bumps[1].getAttribute("x")).toBe("200");

    // All bumps merge into "bumpAll" (the union silhouette), then over the
    // flood into the displacement input "map".
    const merges = Array.from(f.querySelectorAll("feMerge"));
    const bumpAll = merges.find((m) => m.getAttribute("result") === "bumpAll");
    expect(bumpAll).toBeTruthy();
    expect(
      Array.from(bumpAll?.children ?? []).map((n) => n.getAttribute("in")),
    ).toEqual(["lqbump-a", "lqbump-b"]);
    const map = merges.find((m) => m.getAttribute("result") === "map");
    expect(
      Array.from(map?.children ?? []).map((n) => n.getAttribute("in")),
    ).toEqual(["lqfield", "bumpAll"]);
  });

  it("builds a single shared displacement pass when chroma is 0", () => {
    const f = buildGlassFilter({ id: "t2", lenses: [lensA], scale: 50 });
    expect(countByName(f, "feDisplacementMap")).toBe(1);
    expect(f.querySelector("feDisplacementMap")?.getAttribute("in2")).toBe(
      "map",
    );
    expect(f.querySelector("feDisplacementMap")?.getAttribute("result")).toBe(
      "lens",
    );
  });

  it("runs three displacement passes for chromatic aberration", () => {
    const f = buildGlassFilter({
      id: "t3",
      lenses: [lensA],
      scale: 50,
      chroma: 0.5,
    });
    expect(countByName(f, "feDisplacementMap")).toBe(3);
    // R/G/B channel extractions + two recombining composites (plus the
    // two silhouette composites).
    expect(countByName(f, "feColorMatrix")).toBe(3);
    expect(countByName(f, "feComposite")).toBe(4);
  });

  it("adds a gaussian blur pass when blur > 0", () => {
    const f = buildGlassFilter({
      id: "t4",
      lenses: [lensA],
      scale: 50,
      blur: 3,
    });
    const blur = f.querySelector("feGaussianBlur");
    expect(blur?.getAttribute("stdDeviation")).toBe("3");
    expect(f.querySelector("feDisplacementMap")?.getAttribute("in")).toBe(
      "blurred",
    );
  });

  it("adds a specular pass when specular > 0", () => {
    const f = buildGlassFilter({
      id: "t5",
      lenses: [lensA],
      scale: 50,
      specular: 0.6,
    });
    const spec = Array.from(f.querySelectorAll("feColorMatrix")).find(
      (m) => m.getAttribute("result") === "spec",
    );
    expect(spec).toBeTruthy();
    // The masked bent graphic must be the specular-composited one.
    const maskComposite = Array.from(f.querySelectorAll("feComposite")).find(
      (c) => c.getAttribute("operator") === "in",
    );
    expect(maskComposite?.getAttribute("in")).toBe("speclens");
  });

  it("masks the bent graphic to the lens-union silhouette and lays it over the crisp source", () => {
    const f = buildGlassFilter({ id: "t6", lenses: [lensA, lensB], scale: 30 });

    const maskComposite = Array.from(f.querySelectorAll("feComposite")).find(
      (c) => c.getAttribute("operator") === "in",
    );
    expect(maskComposite?.getAttribute("in")).toBe("lens");
    expect(maskComposite?.getAttribute("in2")).toBe("bumpAll");
    expect(maskComposite?.getAttribute("result")).toBe("lqbent");

    // The union silhouette is punched out of the crisp original so the
    // undisplaced content can't ghost underneath the bent copy.
    const punchComposite = Array.from(f.querySelectorAll("feComposite")).find(
      (c) => c.getAttribute("operator") === "out",
    );
    expect(punchComposite?.getAttribute("in")).toBe("SourceGraphic");
    expect(punchComposite?.getAttribute("in2")).toBe("bumpAll");
    expect(punchComposite?.getAttribute("result")).toBe("lqcrisp");

    // The last primitive lays the masked bent copy over the punched crisp layer.
    const output = f.lastElementChild;
    expect(output?.localName).toBe("feMerge");
    expect(output?.children[0]?.getAttribute("in")).toBe("lqcrisp");
    expect(output?.children[1]?.getAttribute("in")).toBe("lqbent");
  });

  it("computes a minimal objectBoundingBox filter region from source reach", () => {
    const f = buildGlassFilter({
      id: "t7",
      lenses: [lensA],
      scale: 20,
      source: { width: 200, height: 100 },
    });

    expect(f.getAttribute("x")).toBe("-10%");
    expect(f.getAttribute("y")).toBe("-20%");
    expect(f.getAttribute("width")).toBe("120%");
    expect(f.getAttribute("height")).toBe("140%");
  });
});

describe("buildBackdropFilter", () => {
  it("builds the exact-region single-lens backdrop chain", () => {
    const f = buildBackdropFilter({
      id: "bd1",
      width: 120,
      height: 60,
      mapUrl: "data:image/png,m",
      scale: 40,
    });
    expect(f.getAttribute("filterUnits")).toBe("userSpaceOnUse");
    expect(f.getAttribute("x")).toBe("0");
    expect(f.getAttribute("y")).toBe("0");
    expect(f.getAttribute("width")).toBe("120");
    expect(f.getAttribute("height")).toBe("60");

    const map = f.querySelector("feImage");
    expect(map?.getAttribute("result")).toBe("map");
    expect(map?.getAttribute("href")).toBe("data:image/png,m");
    expect(map?.getAttribute("x")).toBe("0");
    expect(map?.getAttribute("y")).toBe("0");
    expect(map?.getAttribute("width")).toBe("120");
    expect(map?.getAttribute("height")).toBe("60");
    expect(map?.getAttribute("preserveAspectRatio")).toBe("none");

    // No expanded neutral field or silhouette compositing on this tier.
    expect(f.querySelector("feFlood")).toBeNull();
    const disp = f.querySelector("feDisplacementMap");
    expect(disp?.getAttribute("in")).toBe("SourceGraphic");
    expect(disp?.getAttribute("in2")).toBe("map");
    expect(disp?.getAttribute("scale")).toBe("40");
    expect(f.lastElementChild).toBe(disp);
  });

  it("uses the oversized carrier region while keeping the map on the lens box", () => {
    const f = buildBackdropFilter({
      id: "bd-margin",
      width: 120,
      height: 60,
      mapUrl: "data:image/png,m",
      scale: 40,
      margin: 44,
    });
    expect(f.getAttribute("x")).toBe("0");
    expect(f.getAttribute("y")).toBe("0");
    expect(f.getAttribute("width")).toBe("208");
    expect(f.getAttribute("height")).toBe("148");
    const map = f.querySelector('feImage[result="map"]');
    expect(map?.getAttribute("x")).toBe("44");
    expect(map?.getAttribute("y")).toBe("44");
    expect(map?.getAttribute("width")).toBe("120");
    expect(map?.getAttribute("height")).toBe("60");
  });

  it("includes the lens's own blur and chroma in the chain", () => {
    const f = buildBackdropFilter({
      id: "bd2",
      width: 100,
      height: 50,
      mapUrl: "data:image/png,m",
      scale: 40,
      blur: 2,
      chroma: 0.5,
    });
    expect(
      f.querySelector("feGaussianBlur")?.getAttribute("stdDeviation"),
    ).toBe("2");
    expect(countByName(f, "feDisplacementMap")).toBe(3);
  });

  it("collapses chroma to one pass above the area limit (per-frame backdrop cost)", () => {
    const small = buildBackdropFilter({
      id: "bd3",
      width: 300,
      height: 300, // 90k px² — under BACKDROP_CHROMA_AREA_LIMIT
      mapUrl: "data:image/png,m",
      scale: 40,
      chroma: 0.5,
    });
    expect(countByName(small, "feDisplacementMap")).toBe(3);

    const big = buildBackdropFilter({
      id: "bd4",
      width: 600,
      height: 300, // 180k px² — over the limit
      mapUrl: "data:image/png,m",
      scale: 40,
      chroma: 0.5,
    });
    expect(countByName(big, "feDisplacementMap")).toBe(1);
    // The single pass runs at the base scale, not a chroma-split one.
    expect(big.querySelector("feDisplacementMap")?.getAttribute("scale")).toBe(
      "40",
    );
  });

  it("adds a baked specular image to the bent result inside the chain", () => {
    const withSpec = buildBackdropFilter({
      id: "bd5",
      width: 100,
      height: 50,
      mapUrl: "data:image/png,m",
      scale: 40,
      margin: 42,
      specUrl: "data:image/png,s",
    });
    const spec = withSpec.querySelector('feImage[result="spec"]');
    expect(spec?.getAttribute("href")).toBe("data:image/png,s");
    expect(spec?.getAttribute("x")).toBe("42");
    expect(spec?.getAttribute("y")).toBe("42");
    expect(spec?.getAttribute("width")).toBe("100");
    expect(spec?.getAttribute("height")).toBe("50");
    expect(spec?.getAttribute("preserveAspectRatio")).toBe("none");

    const composite = withSpec.lastElementChild;
    expect(composite?.localName).toBe("feComposite");
    expect(composite?.getAttribute("in")).toBe("spec");
    expect(composite?.getAttribute("in2")).toBe("lens");
    expect(composite?.getAttribute("operator")).toBe("arithmetic");
    expect(composite?.getAttribute("k1")).toBe("0");
    expect(composite?.getAttribute("k2")).toBe("1");
    expect(composite?.getAttribute("k3")).toBe("1");
    expect(composite?.getAttribute("k4")).toBe("0");

    const withoutSpec = buildBackdropFilter({
      id: "bd6",
      width: 100,
      height: 50,
      mapUrl: "data:image/png,m",
      scale: 40,
      specUrl: null,
    });
    expect(withoutSpec.querySelector('[result="spec"]')).toBeNull();
    expect(withoutSpec.querySelectorAll("feImage")).toHaveLength(1);
  });
});

describe("moveFilterLens", () => {
  it("retargets only the addressed sub-lens, touching only x/y", () => {
    const f = buildGlassFilter({
      id: "t8",
      lenses: [lensA, lensB],
      scale: 50,
    });
    const before = f.outerHTML;

    moveFilterLens(f, "b", 300, 90);

    const bumps = Array.from(f.querySelectorAll("feImage"));
    expect(bumps[0].getAttribute("x")).toBe("10");
    expect(bumps[0].getAttribute("y")).toBe("20");
    expect(bumps[1].getAttribute("x")).toBe("300");
    expect(bumps[1].getAttribute("y")).toBe("90");
    expect(bumps[1].getAttribute("width")).toBe("80");
    expect(bumps[1].getAttribute("height")).toBe("30");

    // Nothing else in the filter changed.
    moveFilterLens(f, "b", 200, 60);
    expect(f.outerHTML).toBe(before);
  });

  it("ignores unknown lens ids", () => {
    const f = buildGlassFilter({ id: "t9", lenses: [lensA], scale: 50 });
    expect(() => moveFilterLens(f, "nope", 1, 2)).not.toThrow();
    expect(f.querySelector("feImage")?.getAttribute("x")).toBe("10");
  });
});
