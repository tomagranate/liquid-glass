import { describe, expect, it } from "vitest";
import { WebGLGlass } from "./liquid-glass-webgl.js";
import { applyGlass, generateDisplacementMap } from "./liquid-glass.js";

function extractFilterId(value: string): string | null {
  return value.match(/#([^)"']+)/)?.[1] ?? null;
}

function createSourceCanvas(): HTMLCanvasElement {
  const source = document.createElement("canvas");
  source.width = 2;
  source.height = 2;
  const ctx = source.getContext("2d");
  if (!ctx) throw new Error("2D canvas context not available");

  ctx.fillStyle = "rgb(255, 0, 0)";
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = "rgb(0, 255, 0)";
  ctx.fillRect(1, 0, 1, 1);
  ctx.fillStyle = "rgb(0, 0, 255)";
  ctx.fillRect(0, 1, 1, 1);
  ctx.fillStyle = "rgb(255, 255, 255)";
  ctx.fillRect(1, 1, 1, 1);

  return source;
}

function canCreateWebGLGlass(): boolean {
  const canvas = document.createElement("canvas");
  try {
    const glass = new WebGLGlass(canvas);
    glass.destroy();
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("WebGL2 not available")
    ) {
      return false;
    }
    throw error;
  }
}

function backgroundPositionY(backdrop: HTMLElement): number {
  const values = Array.from(
    backdrop.style.backgroundPosition.matchAll(/calc\((-?[\d.]+)px/g),
  );
  return Number(values[1]?.[1]);
}

describe("browser SVG rendering", () => {
  it("attaches a real SVG filter and generates a PNG displacement map", () => {
    const host = document.createElement("div");
    host.style.width = "120px";
    host.style.height = "80px";
    document.body.appendChild(host);

    const ctrl = applyGlass(host, {
      backdrop: "linear-gradient(90deg, red, blue)",
    });

    const refraction = host.querySelector<HTMLElement>(".lq-refraction");
    expect(refraction).toBeTruthy();

    const filterValue =
      refraction?.style.filter ||
      refraction?.style.getPropertyValue("-webkit-filter") ||
      "";
    expect(filterValue).toContain("url(");

    const filterId = extractFilterId(filterValue);
    expect(filterId).toBeTruthy();
    expect(document.getElementById(filterId ?? "")?.localName).toBe("filter");
    expect(document.querySelector("svg defs filter")).toBeTruthy();

    const mapUrl = generateDisplacementMap({ width: 40, height: 40 });
    expect(mapUrl).toMatch(/^data:image\/png/);

    ctrl.destroy();
    host.remove();
  });

  it("leads clone alignment while scrolling and settles exact", async () => {
    const suppressScrollEnd = (event: Event) =>
      event.stopImmediatePropagation();
    window.addEventListener("scrollend", suppressScrollEnd, { capture: true });
    document.body.style.minHeight = "2400px";
    document.body.style.backgroundImage =
      "linear-gradient(180deg, rgb(20, 40, 80), rgb(80, 40, 20))";
    const host = document.createElement("div");
    host.style.width = "120px";
    host.style.height = "80px";
    host.style.marginTop = "240px";
    document.body.appendChild(host);
    const ctrl = applyGlass(host);
    const backdrop = host.querySelector<HTMLElement>(".lq-backdrop");
    if (!backdrop) throw new Error("Missing backdrop");

    const stepPx = 18;
    await new Promise<void>((resolve) => {
      let steps = 0;
      const step = () => {
        window.scrollBy(0, stepPx);
        window.dispatchEvent(new Event("scroll"));
        steps += 1;
        if (steps < 6) requestAnimationFrame(step);
        else requestAnimationFrame(() => resolve());
      };
      requestAnimationFrame(step);
    });

    const margin = Math.ceil(0.4 * host.getBoundingClientRect().height + 90);
    const exact = margin - host.getBoundingClientRect().top;
    const lead = backgroundPositionY(backdrop) - exact;
    expect(Math.abs(lead - stepPx)).toBeLessThanOrEqual(2);

    await new Promise((resolve) => setTimeout(resolve, 120));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const settledExact = margin - host.getBoundingClientRect().top;
    expect(backgroundPositionY(backdrop)).toBeCloseTo(settledExact, 1);

    ctrl.destroy();
    host.remove();
    window.removeEventListener("scrollend", suppressScrollEnd, {
      capture: true,
    });
    document.body.style.minHeight = "";
    document.body.style.backgroundImage = "";
    window.scrollTo(0, 0);
  });
});

describe("browser WebGL rendering", () => {
  it.skipIf(!canCreateWebGLGlass())(
    "renders a tiny canvas texture through one lens without throwing",
    () => {
      const canvas = document.createElement("canvas");
      const glass = new WebGLGlass(canvas);

      glass.resize(32, 32, 1);
      glass.setSource(createSourceCanvas());
      glass.setLenses([
        {
          x: 4,
          y: 4,
          w: 24,
          h: 24,
          radius: 8,
          depth: 4,
          scale: 6,
          chroma: 0.2,
          specular: 0.1,
        },
      ]);

      expect(() => glass.render()).not.toThrow();
      glass.destroy();
    },
  );
});
