import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedLensMaterial } from "./types.js";

interface MockWebGLGlass {
  resize: ReturnType<typeof vi.fn>;
  setSource: ReturnType<typeof vi.fn>;
  setLenses: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

const instances = vi.hoisted(() => [] as MockWebGLGlass[]);

vi.mock("./liquid-glass-webgl.js", () => ({
  WebGLGlass: class {
    resize = vi.fn();
    setSource = vi.fn();
    setLenses = vi.fn();
    render = vi.fn();
    destroy = vi.fn();

    constructor(_canvas: HTMLCanvasElement) {
      instances.push(this);
    }
  },
}));

import { MediaSurface } from "./media.js";

const material: ResolvedLensMaterial = {
  radius: 8,
  depth: 4,
  scale: 10,
  blur: 0,
  chroma: 0,
  specular: 0,
  specularAngle: 135,
  dpr: 1,
  quality: "balanced",
  fallback: "blur",
};

describe("media context lifecycle", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    instances.length = 0;
  });

  it("never reactivates stale WebGL resources and rebuilds after restore", () => {
    const host = document.createElement("div");
    const source = document.createElement("canvas");
    host.appendChild(source);
    document.body.appendChild(host);
    const surface = new MediaSurface(source, {});
    surface.attachLens({}, { x: 0, y: 0, width: 20, height: 20 }, material);
    const stale = instances[0];
    expect(stale.render).toHaveBeenCalledTimes(1);

    const overlay = host.querySelector<HTMLCanvasElement>(".lgm-overlay");
    expect(overlay).toBeTruthy();
    overlay?.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(surface.active).toBe(false);
    expect(stale.destroy).toHaveBeenCalledTimes(1);

    overlay?.dispatchEvent(new Event("webglcontextrestored"));
    expect(instances).toHaveLength(2);
    expect(surface.active).toBe(true);
    expect(stale.render).toHaveBeenCalledTimes(1);
    expect(instances[1].setLenses).toHaveBeenCalled();
    expect(instances[1].render).toHaveBeenCalledTimes(1);
    surface.destroy();
  });
});
