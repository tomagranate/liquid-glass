import { describe, expect, it, vi } from "vitest";
import { buildGlassFilter, generateDisplacementMap } from "./liquid-glass.js";

function countByName(el: Element, name: string): number {
  return Array.from(el.querySelectorAll("*")).filter(
    (n) => n.localName === name,
  ).length;
}

describe("buildGlassFilter", () => {
  it("builds a single displacement pass when chroma is 0", () => {
    const f = buildGlassFilter({
      id: "t1",
      mapUrl: "data:image/png,x",
      scale: 50,
    });
    expect(f.localName).toBe("filter");
    expect(f.id).toBe("t1");
    expect(countByName(f, "feDisplacementMap")).toBe(1);
    expect(f.querySelector("feImage")?.getAttribute("href")).toBe(
      "data:image/png,x",
    );
    expect(f.querySelector("feDisplacementMap")?.getAttribute("result")).toBe(
      "lens",
    );
  });

  it("runs three displacement passes for chromatic aberration", () => {
    const f = buildGlassFilter({
      id: "t2",
      mapUrl: "data:image/png,x",
      scale: 50,
      chroma: 0.5,
    });
    expect(countByName(f, "feDisplacementMap")).toBe(3);
    // R/G/B channel extractions + two recombining composites.
    expect(countByName(f, "feColorMatrix")).toBe(3);
    expect(countByName(f, "feComposite")).toBe(2);
  });

  it("adds a gaussian blur pass when blur > 0", () => {
    const f = buildGlassFilter({
      id: "t3",
      mapUrl: "data:image/png,x",
      scale: 50,
      blur: 3,
    });
    const blur = f.querySelector("feGaussianBlur");
    expect(blur?.getAttribute("stdDeviation")).toBe("3");
  });

  it("adds a specular pass when specular > 0", () => {
    const f = buildGlassFilter({
      id: "t4",
      mapUrl: "data:image/png,x",
      scale: 50,
      specular: 0.6,
    });
    const spec = Array.from(f.querySelectorAll("feColorMatrix")).find(
      (m) => m.getAttribute("result") === "spec",
    );
    expect(spec).toBeTruthy();
  });
});

describe("generateDisplacementMap", () => {
  it("returns null without a 2D canvas context (e.g. jsdom)", () => {
    // jsdom has no canvas backend; the function should degrade gracefully.
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);
    expect(generateDisplacementMap({ width: 40, height: 40 })).toBeNull();
    spy.mockRestore();
  });
});
