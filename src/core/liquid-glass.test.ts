import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  applyGlass,
  buildGlassFilter,
  createGlassController,
  generateDisplacementMap,
} from "./liquid-glass.js";

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

describe("createGlassController", () => {
  // jsdom lacks ResizeObserver and a real rAF; stub them so the controller can
  // wire up without scheduling a live ticker.
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterAll(() => vi.unstubAllGlobals());

  function layers() {
    const host = document.createElement("div");
    const refraction = document.createElement("div");
    const backdrop = document.createElement("div");
    const sheen = document.createElement("div");
    refraction.appendChild(backdrop);
    host.append(refraction, sheen);
    document.body.appendChild(host);
    return { host, refraction, backdrop, sheen };
  }

  it("wires the controller API and tears down cleanly", () => {
    const { host, refraction, backdrop, sheen } = layers();
    const ctrl = createGlassController(host, { refraction, backdrop, sheen });
    expect(ctrl.update).toBeTypeOf("function");
    expect(ctrl.refresh).toBeTypeOf("function");
    expect(ctrl.destroy).toBeTypeOf("function");
    expect(() => ctrl.destroy()).not.toThrow();
  });

  it("accepts refraction-target mode (alignTo) and positions the backdrop", () => {
    const { host, refraction, backdrop, sheen } = layers();
    const target = document.createElement("div");
    document.body.appendChild(target);
    const ctrl = createGlassController(
      host,
      { refraction, backdrop, sheen },
      { alignTo: () => target },
    );
    // In refraction-target mode the backdrop is absolutely positioned and sized
    // to overlay the aligned element. Force a reposition (the live ticker is
    // stubbed off); jsdom rects are all-zero, so it lands at 0px.
    expect(backdrop.style.position).toBe("absolute");
    ctrl._reposition(true);
    expect(backdrop.style.width).toBe("0px");
    ctrl.destroy();
  });
});

describe("applyGlass", () => {
  // jsdom lacks ResizeObserver and a real rAF; stub them so the controller can
  // wire up without scheduling a live ticker.
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterAll(() => vi.unstubAllGlobals());

  it("restores vanilla DOM and styles on repeated destroy", () => {
    const host = document.createElement("div");
    const child = document.createElement("button");
    child.textContent = "Hi";
    host.appendChild(child);
    host.style.position = "absolute";
    host.style.overflow = "scroll";
    host.style.isolation = "auto";
    host.style.background = "rgb(1, 2, 3)";
    host.style.boxShadow = "0px 0px 2px red";
    host.style.borderRadius = "12px";
    const originalStyle = {
      position: host.style.position,
      overflow: host.style.overflow,
      isolation: host.style.isolation,
      background: host.style.background,
      boxShadow: host.style.boxShadow,
      borderRadius: host.style.borderRadius,
    };
    const rectSpy = vi.spyOn(host, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 50,
      width: 100,
      height: 50,
      toJSON: () => {},
    });
    const canvasSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);

    const first = applyGlass(host);
    expect(host.querySelector(".lq-refraction")).toBeTruthy();
    expect(host.querySelector(".lq-sheen")).toBeTruthy();
    expect(host.querySelector(".lq-content")).toBeTruthy();

    first.destroy();
    expect(Array.from(host.children)).toEqual([child]);
    expect(host.querySelector(".lq-refraction")).toBeNull();
    expect(host.querySelector(".lq-sheen")).toBeNull();
    expect(host.querySelector(".lq-content")).toBeNull();
    expect(host.classList.contains("lq")).toBe(false);
    expect({
      position: host.style.position,
      overflow: host.style.overflow,
      isolation: host.style.isolation,
      background: host.style.background,
      boxShadow: host.style.boxShadow,
      borderRadius: host.style.borderRadius,
    }).toEqual(originalStyle);

    const second = applyGlass(host);
    expect(host.querySelectorAll(".lq-content")).toHaveLength(1);
    second.destroy();

    expect(Array.from(host.children)).toEqual([child]);
    expect(host.querySelector(".lq-content")).toBeNull();

    canvasSpy.mockRestore();
    rectSpy.mockRestore();
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
