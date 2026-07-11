import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "@vitest/browser/context";
import { setBackground } from "./background.js";
import { supportsBackdropUrlFilter } from "./filter.js";
import { glass } from "./glass.js";
import { WebGLGlass } from "./liquid-glass-webgl.js";
import { generateDisplacementMap } from "./map.js";
import { createMediaSurface } from "./media.js";
import { createGlassScope } from "./scope.js";
import { createSurface, isSafariEngine } from "./surfaces.js";
import type { SurfaceHandle } from "./types.js";

/** Compositor promotion is Safari-gated: Playwright's WebKit UA exercises the
 *  promoted branch; chromium and firefox must stay unpromoted. */
function expectSafariGatedPromotion(el: HTMLElement): void {
  if (isSafariEngine()) {
    expect(el.classList.contains("lg-composited")).toBe(true);
    expect(getComputedStyle(el).willChange).toContain("transform");
  } else {
    expect(el.classList.contains("lg-composited")).toBe(false);
    expect(getComputedStyle(el).willChange).toBe("auto");
  }
}

/**
 * Force the painted-copy / content-surface tier on every engine: with
 * `backdrop-filter: url()` reported unsupported, Chromium routes exactly like
 * Safari and Firefox. Lets the copy-path suites keep exercising all three
 * engines.
 */
function stubOutBackdropTier(): void {
  vi.stubGlobal("CSS", { ...window.CSS, supports: () => false });
}

function extractFilterId(value: string): string | null {
  return value.match(/#([^)"']+)/)?.[1] ?? null;
}

function findBump(
  surfaceEl: HTMLElement,
  index = 0,
): { filter: Element | null; bump: Element | null } {
  const filterId = extractFilterId(surfaceEl.style.filter);
  const filter = document.getElementById(filterId ?? "");
  const bump = filter?.querySelectorAll("feImage")[index] ?? null;
  return { filter, bump };
}

function createSourceCanvas(size = 64): HTMLCanvasElement {
  const source = document.createElement("canvas");
  source.width = size;
  source.height = size;
  const ctx = source.getContext("2d");
  if (!ctx) throw new Error("2D canvas context not available");
  ctx.fillStyle = "rgb(255, 0, 0)";
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillStyle = "rgb(0, 255, 0)";
  ctx.fillRect(size / 2, 0, size / 2, size / 2);
  ctx.fillStyle = "rgb(0, 0, 255)";
  ctx.fillRect(0, size / 2, size / 2, size / 2);
  ctx.fillStyle = "rgb(255, 255, 255)";
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  return source;
}

function canCreateWebGLGlass(): boolean {
  const canvas = document.createElement("canvas");
  try {
    const g = new WebGLGlass(canvas);
    g.destroy();
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

async function screenshotPixels(element: Element): Promise<ImageData> {
  const base64 = await page.screenshot({ element, save: false });
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D screenshot context unavailable");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

describe("browser: content surfaces", () => {
  beforeEach(stubOutBackdropTier);
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    document.body.style.cssText = "";
    setBackground(null);
  });

  it("filters a registered content surface under a glass lens and moves via feImage x/y", () => {
    document.body.style.cssText = "margin:0;overflow:hidden;";

    const surfaceEl = document.createElement("main");
    surfaceEl.style.cssText = [
      "position:fixed",
      "left:0",
      "top:100px",
      "width:260px",
      "height:180px",
      "background:linear-gradient(90deg, red, blue)",
    ].join(";");
    document.body.appendChild(surfaceEl);

    const nav = document.createElement("nav");
    nav.textContent = "Live nav";
    nav.style.cssText =
      "position:fixed;left:20px;top:120px;width:120px;height:56px;";
    document.body.appendChild(nav);

    const surface = createSurface(surfaceEl);
    const handle = glass(nav, {
      radius: 28,
      depth: 8,
      scale: 18,
      blur: 0,
      chroma: 0,
      surfaces: [surface],
    });

    // The surface element is filtered in place; promotion is Safari-only.
    expect(surfaceEl.style.filter).toContain("url(");
    expectSafariGatedPromotion(surfaceEl);

    const { filter, bump } = findBump(surfaceEl);
    expect(filter?.localName).toBe("filter");
    expect(bump?.getAttribute("result")).toMatch(/^lqbump-/);
    expect(bump?.getAttribute("x")).toBe("20");
    expect(bump?.getAttribute("y")).toBe("20");

    // A move retargets the same filter's feImage — no rebuild.
    nav.style.top = "140px";
    handle.geometryChanged();
    expect(findBump(surfaceEl).filter).toBe(filter);
    expect(bump?.getAttribute("x")).toBe("20");
    expect(bump?.getAttribute("y")).toBe("40");

    handle.destroy();
    expect(surfaceEl.style.filter).toBe("");
    surface.destroy();
  });

  it("bends two lenses over one surface independently (move touches only its own feImage)", () => {
    document.body.style.cssText = "margin:0;overflow:hidden;";

    const surfaceEl = document.createElement("main");
    surfaceEl.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "width:500px",
      "height:400px",
      "background:linear-gradient(90deg, red, blue)",
    ].join(";");
    document.body.appendChild(surfaceEl);

    const lensA = document.createElement("div");
    lensA.style.cssText =
      "position:fixed;left:10px;top:10px;width:100px;height:40px;";
    const lensB = document.createElement("div");
    lensB.style.cssText =
      "position:fixed;left:200px;top:100px;width:80px;height:30px;";
    document.body.append(lensA, lensB);

    const surface = createSurface(surfaceEl);
    const a = glass(lensA, { scale: 90, blur: 0, chroma: 0 });
    const b = glass(lensB, { scale: 45, blur: 0, chroma: 0 });

    const filterId = extractFilterId(surfaceEl.style.filter);
    const filter = document.getElementById(filterId ?? "");
    const bumps = Array.from(filter?.querySelectorAll("feImage") ?? []);
    expect(bumps).toHaveLength(2);
    expect(filter?.querySelectorAll("feFlood")).toHaveLength(1);
    const bumpA = bumps.find((n) => n.getAttribute("width") === "100");
    const bumpB = bumps.find((n) => n.getAttribute("width") === "80");
    expect(bumpA?.getAttribute("x")).toBe("10");
    expect(bumpB?.getAttribute("x")).toBe("200");
    // Per-lens maps are distinct (different amplitude/shape).
    expect(bumpA?.getAttribute("href")).not.toBe(bumpB?.getAttribute("href"));

    lensB.style.left = "260px";
    b.geometryChanged();
    expect(extractFilterId(surfaceEl.style.filter)).toBe(filterId);
    expect(bumpB?.getAttribute("x")).toBe("260");
    expect(bumpA?.getAttribute("x")).toBe("10");

    // Detaching one lens keeps the other registered under a fresh filter id.
    b.destroy();
    const afterId = extractFilterId(surfaceEl.style.filter);
    expect(afterId).toBeTruthy();
    expect(afterId).not.toBe(filterId);
    expect(
      document.getElementById(afterId ?? "")?.querySelectorAll("feImage"),
    ).toHaveLength(1);

    a.destroy();
    surface.destroy();
  });

  it("keeps lens coordinates stable when a fixed surface wraps an inner scroller", () => {
    document.body.style.cssText = "margin:0;overflow:hidden;";

    const surfaceEl = document.createElement("section");
    surfaceEl.style.cssText = [
      "position:fixed",
      "inset:0",
      "width:320px",
      "height:240px",
      "overflow:hidden",
      "background:linear-gradient(90deg, red, blue)",
    ].join(";");
    const scroller = document.createElement("div");
    scroller.style.cssText = "height:240px;overflow-y:auto;";
    const content = document.createElement("div");
    content.style.cssText = "height:1200px;";
    scroller.appendChild(content);
    surfaceEl.appendChild(scroller);
    document.body.appendChild(surfaceEl);

    const nav = document.createElement("nav");
    nav.style.cssText =
      "position:fixed;left:20px;top:20px;width:120px;height:56px;";
    document.body.appendChild(nav);

    const surface = createSurface(surfaceEl);
    const handle = glass(nav, {
      radius: 28,
      depth: 8,
      scale: 18,
      blur: 0,
      chroma: 0,
      surfaces: [surface],
    });

    const { bump } = findBump(surfaceEl);
    expect(bump?.getAttribute("x")).toBe("20");
    expect(bump?.getAttribute("y")).toBe("20");

    scroller.scrollTop = 240;
    handle.geometryChanged();
    expect(bump?.getAttribute("x")).toBe("20");
    expect(bump?.getAttribute("y")).toBe("20");

    handle.destroy();
    surface.destroy();
  });

  it("warns when a fixed lens chases a document-scrolled surface", () => {
    document.body.style.cssText = "margin:0;height:2000px;";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const surfaceEl = document.createElement("main");
    surfaceEl.style.cssText = [
      "position:absolute",
      "left:0",
      "top:100px",
      "width:260px",
      "height:180px",
      "background:linear-gradient(90deg, red, blue)",
    ].join(";");
    document.body.appendChild(surfaceEl);

    const nav = document.createElement("nav");
    nav.style.cssText =
      "position:fixed;left:20px;top:120px;width:120px;height:56px;";
    document.body.appendChild(nav);

    const surface = createSurface(surfaceEl);
    const handle = glass(nav, { surfaces: [surface] });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("fixed lens over a document-scrolled"),
    );

    handle.destroy();
    surface.destroy();
    warn.mockRestore();
  });

  it("generates a real PNG displacement map", () => {
    const mapUrl = generateDisplacementMap({ width: 40, height: 40 });
    expect(mapUrl).toMatch(/^data:image\/png/);
  });
});

describe("browser: aggregate background-copy policy", () => {
  beforeEach(stubOutBackdropTier);
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    document.body.style.cssText = "";
  });

  it("keeps one full copy but routes dense WebKit copies to native and restores", async () => {
    document.body.style.cssText =
      "margin:0;overflow:hidden;background:linear-gradient(135deg,#f64,#35f);";
    const scope = createGlassScope({ quality: "balanced", fallback: "blur" });
    const elements: HTMLElement[] = [];
    const handles: ReturnType<typeof scope.glass>[] = [];
    const addLens = (): void => {
      const element = document.createElement("div");
      element.style.cssText =
        "position:fixed;left:20px;top:20px;width:240px;height:176px;";
      document.body.appendChild(element);
      elements.push(element);
      handles.push(
        scope.glass(element, {
          background: "linear-gradient(135deg,#f64,#35f)",
          chroma: 0.4,
        }),
      );
    };
    const displacementPasses = (element: HTMLElement): number => {
      const filterId = extractFilterId(
        element.querySelector<HTMLElement>(":scope > .lg-bg")?.style.filter ??
          "",
      );
      return (
        document
          .getElementById(filterId ?? "")
          ?.querySelectorAll("feDisplacementMap").length ?? 0
      );
    };

    addLens();
    expect(handles[0]?.backends).toEqual(["background-copy"]);
    expect(displacementPasses(elements[0])).toBe(3);

    for (let index = 1; index < 4; index++) addLens();
    if (isSafariEngine()) {
      await vi.waitFor(() => {
        expect(handles.every((handle) => handle.backends[0] === "native")).toBe(
          true,
        );
      });
      expect(scope.getDiagnostics().backgroundCopyWorkload).toMatchObject({
        lenses: 4,
        tier: "native",
        reason: "aggregate-background-copy-device-pixel-pass-budget",
      });
      expect(
        elements.every((element) => displacementPasses(element) === 0),
      ).toBe(true);

      while (handles.length > 1) {
        handles.pop()?.destroy();
        elements.pop()?.remove();
      }
      await vi.waitFor(() => {
        expect(handles[0]?.backends).toEqual(["background-copy"]);
        expect(displacementPasses(elements[0])).toBe(3);
      });
    } else {
      expect(
        handles.every((handle) => handle.backends[0] === "background-copy"),
      ).toBe(true);
      expect(scope.getDiagnostics().backgroundCopyWorkload.tier).toBe("full");
    }

    scope.destroy();
  });
});

describe("browser: background copy (.lg-bg)", () => {
  beforeEach(stubOutBackdropTier);
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    document.body.style.cssText = "";
    setBackground(null);
  });

  it("paints a filtered, viewport-registered page-background copy for an uncovered lens", () => {
    document.body.style.cssText =
      "margin:0;overflow:hidden;background:linear-gradient(90deg, rgb(255,0,0), rgb(0,0,255));";
    setBackground(null); // re-detect the freshly set body background

    const lensEl = document.createElement("div");
    lensEl.style.cssText =
      "position:fixed;left:40px;top:30px;width:120px;height:60px;";
    document.body.appendChild(lensEl);

    const handle = glass(lensEl, { scale: 10, blur: 0, chroma: 0 });

    const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
    expect(bg).toBeTruthy();
    if (!bg) throw new Error("no bg");
    expect(bg.style.display).not.toBe("none");
    // ONE element: painted copy + SVG filter, sized lens + margin (reach 10).
    expect(bg.style.width).toBe("140px");
    expect(bg.style.height).toBe("80px");
    expect(bg.style.transform).toContain("translate(-10px, -10px)");
    expect(bg.style.filter).toContain("url(");
    expect(getComputedStyle(bg).backgroundImage).toContain("linear-gradient");
    // Viewport-registered: offset by the copy's own viewport position.
    expect(bg.style.backgroundPosition).toBe("-30px -20px");
    // Composited on Safari only (rule 1).
    expectSafariGatedPromotion(bg);

    const filterId = extractFilterId(bg.style.filter);
    const filter = document.getElementById(filterId ?? "");
    expect(filter?.localName).toBe("filter");
    // The bg filter's single sub-lens sits at the sampling margin.
    const bump = filter?.querySelector("feImage");
    expect(bump?.getAttribute("x")).toBe("10");
    expect(bump?.getAttribute("y")).toBe("10");

    handle.destroy();
    expect(lensEl.querySelector(".lg-bg")).toBeNull();
  });

  it("composes partial overlap without blank pixels and hides under full cover", async () => {
    document.body.style.cssText = "margin:0;overflow:hidden;background:white;";

    const surfaceEl = document.createElement("main");
    surfaceEl.style.cssText =
      "position:fixed;left:0;top:0;width:400px;height:300px;background:linear-gradient(90deg, red, blue);";
    document.body.appendChild(surfaceEl);

    const lensEl = document.createElement("div");
    lensEl.style.cssText =
      "position:fixed;left:50px;top:50px;width:120px;height:60px;";
    document.body.appendChild(lensEl);

    const surface = createSurface(surfaceEl);
    const handle = glass(lensEl, { scale: 10, blur: 0, chroma: 0 });

    expect(lensEl.querySelector(":scope > .lg-bg")).toBeNull();

    // Straddle the surface edge → partial cover → the copy paints.
    lensEl.style.left = "350px";
    handle.geometryChanged();
    const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
    expect(bg).toBeTruthy();
    expect(bg?.style.display).not.toBe("none");
    expect(bg?.style.clipPath).toContain("url(");
    const clipId = bg?.style.clipPath.match(/#([^)'"]+)/)?.[1];
    const clipPath = document.getElementById(clipId ?? "");
    const hole = clipPath?.querySelector("path");
    expect(hole?.getAttribute("fill-rule")).toBe("evenodd");
    const beforeHole = hole?.getAttribute("d");
    const pixels = await screenshotPixels(lensEl);
    const sample = (x: number, y: number): number[] => {
      const offset = (y * pixels.width + x) * 4;
      return Array.from(pixels.data.slice(offset, offset + 4));
    };
    const covered = sample(20, 30);
    const uncovered = sample(100, 30);
    expect(covered[3]).toBeGreaterThan(240);
    expect(uncovered[3]).toBeGreaterThan(240);
    expect(
      Math.abs(covered[0] - uncovered[0]) +
        Math.abs(covered[1] - uncovered[1]) +
        Math.abs(covered[2] - uncovered[2]),
    ).toBeGreaterThan(30);
    const beforeFilter = bg?.style.filter;
    lensEl.style.left = "360px";
    handle.geometryChanged();
    expect(hole?.getAttribute("d")).not.toBe(beforeHole);
    expect(bg?.style.filter).toBe(beforeFilter);

    // Fully covered again → hidden.
    lensEl.style.left = "50px";
    handle.geometryChanged();
    expect(bg?.style.display).toBe("none");

    handle.destroy();
    surface.destroy();
  });
});

describe("browser: media surfaces (WebGL)", () => {
  beforeEach(stubOutBackdropTier);
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    document.body.style.cssText = "";
    setBackground(null);
  });

  it.skipIf(!canCreateWebGLGlass())(
    "renders a lens over a canvas media surface through the overlay",
    () => {
      document.body.style.cssText = "margin:0;overflow:hidden;";
      const container = document.createElement("div");
      container.style.cssText =
        "position:relative;width:64px;height:64px;margin:0;";
      const media = createSourceCanvas(64);
      media.style.cssText = "display:block;width:64px;height:64px;";
      container.appendChild(media);
      document.body.appendChild(container);

      const lensEl = document.createElement("div");
      lensEl.style.cssText =
        "position:fixed;left:8px;top:8px;width:32px;height:32px;";
      document.body.appendChild(lensEl);

      const surface: SurfaceHandle = createMediaSurface(media);
      const handle = glass(lensEl, {
        radius: 8,
        depth: 4,
        scale: 6,
        chroma: 0.2,
        specular: 0.1,
        surfaces: [surface],
      });

      const overlay = container.querySelector<HTMLCanvasElement>(
        ":scope > .lgm-overlay",
      );
      expect(overlay).toBeTruthy();
      if (!overlay) throw new Error("no overlay");
      expect(overlay.style.left).toBe("0px");
      expect(overlay.style.top).toBe("0px");
      expect(overlay.width).toBeGreaterThan(0);

      // Pixel stats: the overlay must be non-blank inside the lens.
      const gl = overlay.getContext("webgl2");
      expect(gl).toBeTruthy();
      if (!gl) throw new Error("no gl");
      const pixels = new Uint8Array(overlay.width * overlay.height * 4);
      gl.readPixels(
        0,
        0,
        overlay.width,
        overlay.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      let opaque = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] > 0) opaque++;
      }
      expect(opaque).toBeGreaterThan(100);

      handle.destroy();
      surface.destroy();
      expect(container.querySelector(".lgm-overlay")).toBeNull();
    },
  );

  it.skipIf(!canCreateWebGLGlass())(
    "stops the live media rAF while hidden and resumes when visible",
    async () => {
      let visibility: DocumentVisibilityState = "hidden";
      const visibilitySpy = vi
        .spyOn(document, "visibilityState", "get")
        .mockImplementation(() => visibility);
      const scope = createGlassScope();
      const container = document.createElement("div");
      container.style.cssText =
        "position:fixed;inset:0;width:64px;height:64px;";
      const media = createSourceCanvas(64);
      media.style.cssText = "display:block;width:64px;height:64px;";
      container.appendChild(media);
      const lens = document.createElement("div");
      lens.style.cssText =
        "position:fixed;left:8px;top:8px;width:32px;height:32px;";
      document.body.append(container, lens);
      scope.createMediaSurface(media, { live: true });
      scope.glass(lens, { background: false });
      expect(scope.getDiagnostics().mediaRafCallbacks).toBe(0);

      visibility = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const running = scope.getDiagnostics().mediaRafCallbacks;
      expect(running).toBeGreaterThan(0);
      expect(scope.getDiagnostics().mediaUploads).toBeGreaterThan(0);

      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      expect(scope.getDiagnostics().mediaRafCallbacks).toBe(running);
      scope.destroy();
      visibilitySpy.mockRestore();
    },
  );

  it.skipIf(!canCreateWebGLGlass())(
    "renders a tiny canvas texture through one lens without throwing (low-level API)",
    () => {
      const canvas = document.createElement("canvas");
      const g = new WebGLGlass(canvas);
      g.resize(32, 32, 1);
      g.setSource(createSourceCanvas(2));
      g.setLenses([
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
      expect(() => g.render()).not.toThrow();
      g.destroy();
    },
  );
});

describe("browser: backdrop tier (backdrop-filter: url())", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.body.style.cssText = "";
    setBackground(null);
  });

  it("detection matches the engine (regression: Chromium must keep the tier)", () => {
    const isFirefox = /\bFirefox\//.test(navigator.userAgent);
    if (isSafariEngine() || isFirefox) {
      expect(supportsBackdropUrlFilter()).toBe(false);
    } else {
      // The chromium instance: if this starts failing, Chromium dropped (or
      // stopped advertising) `backdrop-filter: url()` support.
      expect(supportsBackdropUrlFilter()).toBe(true);
    }
  });

  it("routes .lg-bg to the compositor backdrop tier on Chromium, the copy tier elsewhere", () => {
    document.body.style.cssText =
      "margin:0;overflow:hidden;background:linear-gradient(90deg, rgb(255,0,0), rgb(0,0,255));";
    setBackground(null); // re-detect the freshly set body background

    const lensEl = document.createElement("div");
    lensEl.style.cssText =
      "position:fixed;left:40px;top:30px;width:120px;height:60px;";
    document.body.appendChild(lensEl);

    const handle = glass(lensEl, { scale: 10, blur: 0, chroma: 0 });

    const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
    expect(bg).toBeTruthy();
    if (!bg) throw new Error("no bg");
    const style = getComputedStyle(bg);
    if (supportsBackdropUrlFilter()) {
      // Chromium: the compositor samples the real backdrop at composite
      // time — no painted copy, no transform, no scroll work.
      expect(style.backdropFilter).toContain("url(");
      expect(style.backgroundImage).toBe("none");
      expect(bg.style.transform).toBe("");
      // No viewport-registration writes (the copy tier's scroll work).
      expect(bg.style.backgroundPosition).not.toMatch(/px/);
    } else {
      // Safari/Firefox: the painted-copy tier, exactly as before.
      expect(style.backgroundImage).toContain("linear-gradient");
      expect(bg.style.filter).toContain("url(");
      expect(style.backdropFilter || "none").not.toContain("url(");
    }

    handle.destroy();
    expect(lensEl.querySelector(".lg-bg")).toBeNull();
  });

  it.skipIf(!supportsBackdropUrlFilter())(
    "routes explicit content when background:false without mocked detection",
    () => {
      const surfaceEl = document.createElement("main");
      surfaceEl.style.cssText =
        "position:fixed;inset:0;width:300px;height:200px;background:red;";
      const lensEl = document.createElement("div");
      lensEl.style.cssText =
        "position:fixed;left:10px;top:10px;width:100px;height:50px;";
      document.body.append(surfaceEl, lensEl);
      const surface = createSurface(surfaceEl);
      const handle = glass(lensEl, {
        background: false,
        surfaces: [surface],
      });

      expect(surfaceEl.style.filter).toContain("url(");
      expect(lensEl.querySelector(":scope > .lg-bg")).toBeNull();
      expect(handle.backends).toEqual(["content-svg"]);
      handle.destroy();
      surface.destroy();
    },
  );

  it.skipIf(!supportsBackdropUrlFilter())(
    "routes explicit content beside an explicit CSS background",
    () => {
      const surfaceEl = document.createElement("main");
      surfaceEl.style.cssText =
        "position:fixed;left:0;top:0;width:50px;height:200px;background:red;";
      const lensEl = document.createElement("div");
      lensEl.style.cssText =
        "position:fixed;left:10px;top:10px;width:100px;height:50px;";
      document.body.append(surfaceEl, lensEl);
      const surface = createSurface(surfaceEl);
      const handle = glass(lensEl, {
        background: "linear-gradient(90deg, red, blue)",
        surfaces: [surface],
      });

      expect(surfaceEl.style.filter).toContain("url(");
      const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
      expect(bg?.style.filter).toContain("url(");
      expect(getComputedStyle(bg as HTMLElement).backdropFilter).not.toContain(
        "url(",
      );
      expect(handle.backends).toEqual(["background-copy", "content-svg"]);
      handle.destroy();
      surface.destroy();
    },
  );

  it.skipIf(!supportsBackdropUrlFilter())(
    "reroutes auto -> false -> auto using real Chromium detection",
    () => {
      const surfaceEl = document.createElement("main");
      surfaceEl.style.cssText =
        "position:fixed;inset:0;width:300px;height:200px;background:red;";
      const lensEl = document.createElement("div");
      lensEl.style.cssText =
        "position:fixed;left:10px;top:10px;width:100px;height:50px;";
      document.body.append(surfaceEl, lensEl);
      const surface = createSurface(surfaceEl);
      const handle = glass(lensEl, { surfaces: [surface] });

      expect(handle.backends).toEqual(["backdrop"]);
      expect(surfaceEl.style.filter).toBe("");
      handle.update({ background: false });
      expect(handle.backends).toEqual(["content-svg"]);
      expect(surfaceEl.style.filter).toContain("url(");
      handle.update({ background: "auto" });
      expect(handle.backends).toEqual(["backdrop"]);
      expect(surfaceEl.style.filter).toBe("");
      handle.destroy();
      surface.destroy();
    },
  );

  it.skipIf(!supportsBackdropUrlFilter() || !canCreateWebGLGlass())(
    "routes an explicit media surface when background:false",
    () => {
      const container = document.createElement("div");
      container.style.cssText =
        "position:fixed;inset:0;width:64px;height:64px;";
      const media = createSourceCanvas(64);
      media.style.cssText = "display:block;width:64px;height:64px;";
      container.appendChild(media);
      const lensEl = document.createElement("div");
      lensEl.style.cssText =
        "position:fixed;left:8px;top:8px;width:32px;height:32px;";
      document.body.append(container, lensEl);
      const surface = createMediaSurface(media);
      const handle = glass(lensEl, {
        background: false,
        surfaces: [surface],
      });

      expect(container.querySelector(".lgm-overlay")).toBeTruthy();
      expect(handle.backends).toEqual(["media-webgl"]);
      handle.destroy();
      surface.destroy();
    },
  );

  it.skipIf(!supportsBackdropUrlFilter())(
    "backdrop-root leniency: the tier still engages for a lens inside a filtered surface",
    () => {
      // Chromium currently samples the page wallpaper even through a filtered
      // ancestor (which is its own backdrop root per spec). The tier relies
      // on that leniency; this test notices if Chromium tightens it enough to
      // stop rendering the lens.
      document.body.style.cssText =
        "margin:0;overflow:hidden;background:linear-gradient(90deg, rgb(255,0,0), rgb(0,0,255));";
      setBackground(null);

      const surfaceEl = document.createElement("main");
      surfaceEl.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        "width:400px",
        "height:300px",
        "filter:brightness(0.9)",
      ].join(";");
      document.body.appendChild(surfaceEl);
      const surface = createSurface(surfaceEl);

      const lensEl = document.createElement("div");
      lensEl.style.cssText =
        "position:absolute;left:50px;top:50px;width:120px;height:60px;";
      surfaceEl.appendChild(lensEl);

      const handle = glass(lensEl, { scale: 10, blur: 0, chroma: 0 });

      const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
      expect(bg).toBeTruthy();
      if (!bg) throw new Error("no bg");
      expect(getComputedStyle(bg).backdropFilter).toContain("url(");
      // Cheap paint-level sanity: the carrier lays out at the lens size and
      // the referenced filter is live in the document.
      const rect = bg.getBoundingClientRect();
      expect(rect.width).toBe(120);
      expect(rect.height).toBe(60);
      const id = getComputedStyle(bg).backdropFilter.match(/#([^)"']+)/)?.[1];
      expect(document.getElementById(id ?? "")?.isConnected).toBe(true);

      handle.destroy();
      surface.destroy();
    },
  );

  it.skipIf(!supportsBackdropUrlFilter())(
    "keeps the per-frame chain lean: area-adaptive chroma + baked specular overlay",
    async () => {
      // Backdrop filters re-run over the live backdrop every composited
      // frame, so the chain is trimmed: big lenses collapse chroma to one
      // displacement pass and specular is baked to a static overlay.
      document.body.style.cssText =
        "margin:0;overflow:hidden;background:linear-gradient(90deg, rgb(255,0,0), rgb(0,0,255));";
      setBackground(null);

      const bigEl = document.createElement("div");
      bigEl.style.cssText =
        "position:fixed;left:0;top:0;width:600px;height:300px;"; // 180k px²
      const smallEl = document.createElement("div");
      smallEl.style.cssText =
        "position:fixed;left:0;top:320px;width:120px;height:60px;";
      document.body.append(bigEl, smallEl);

      const big = glass(bigEl, {
        scale: 10,
        blur: 0,
        chroma: 0.5,
        specular: 0.4,
      });
      const small = glass(smallEl, { scale: 10, blur: 0, chroma: 0.5 });

      const filterOf = (el: HTMLElement): Element | null => {
        const bg = el.querySelector<HTMLElement>(":scope > .lg-bg");
        const id = bg?.style.backdropFilter.match(/#([^)"']+)/)?.[1];
        return document.getElementById(id ?? "");
      };
      expect(
        filterOf(bigEl)?.querySelectorAll("feDisplacementMap"),
      ).toHaveLength(1);
      expect(
        filterOf(smallEl)?.querySelectorAll("feDisplacementMap"),
      ).toHaveLength(3);
      // No in-chain specular even on the specular lens...
      expect(filterOf(bigEl)?.querySelector('[result="spec"]')).toBeNull();

      // ...it lands async in the static .lg-spec overlay instead.
      const spec = await vi.waitFor(() => {
        const el = bigEl.querySelector<HTMLElement>(":scope > .lg-spec");
        expect(el).toBeTruthy();
        return el as HTMLElement;
      });
      expect(getComputedStyle(spec).mixBlendMode).toBe("plus-lighter");
      expect(spec.style.backgroundImage).toContain("data:image/png");
      // specular 0 → no overlay.
      expect(smallEl.querySelector(".lg-spec")).toBeNull();

      big.destroy();
      small.destroy();
      expect(bigEl.querySelector(".lg-spec")).toBeNull();
    },
  );

  it.skipIf(!supportsBackdropUrlFilter())(
    "adapts aggregate backdrop work once per threshold crossing and restores quality",
    async () => {
      document.body.style.cssText =
        "margin:0;overflow:hidden;background:linear-gradient(90deg, rgb(255,0,0), rgb(0,0,255));";
      setBackground(null);

      const scope = createGlassScope({ quality: "balanced" });
      const elements: HTMLElement[] = [];
      const handles: ReturnType<typeof scope.glass>[] = [];
      const addLens = (): void => {
        const element = document.createElement("div");
        element.style.cssText =
          "position:fixed;left:10px;top:10px;width:200px;height:100px;";
        document.body.appendChild(element);
        elements.push(element);
        handles.push(scope.glass(element, { chroma: 0.5 }));
      };
      const displacementPasses = (element: HTMLElement): number => {
        const bg = element.querySelector<HTMLElement>(":scope > .lg-bg");
        const id = bg?.style.backdropFilter.match(/#([^)"']+)/)?.[1];
        return (
          document
            .getElementById(id ?? "")
            ?.querySelectorAll("feDisplacementMap").length ?? 0
        );
      };

      for (let index = 0; index < 8; index++) addLens();
      expect(scope.getDiagnostics().backdropWorkload.tier).toBe("full");
      expect(
        elements.every((element) => displacementPasses(element) === 3),
      ).toBe(true);

      for (let index = 8; index < 32; index++) addLens();
      await vi.waitFor(() => {
        expect(scope.getDiagnostics().backdropWorkload.tier).toBe("lean");
        expect(
          elements.every((element) => displacementPasses(element) === 1),
        ).toBe(true);
      });
      const leanDiagnostics = scope.getDiagnostics();
      expect(leanDiagnostics.backdropWorkload.reason).toBe(
        "aggregate-backdrop-device-pixel-pass-budget",
      );
      expect(
        leanDiagnostics.policy[leanDiagnostics.policy.length - 1]?.reason,
      ).toBe("aggregate-backdrop-device-pixel-pass-budget");

      // A settled tier is inert: it must not create a rebuild loop.
      const settledRebuilds = leanDiagnostics.filterRebuilds;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      expect(scope.getDiagnostics().filterRebuilds).toBe(settledRebuilds);

      for (let index = handles.length - 1; index >= 8; index--) {
        handles[index]?.destroy();
        handles.pop();
        elements.pop()?.remove();
      }
      await vi.waitFor(() => {
        expect(scope.getDiagnostics().backdropWorkload.tier).toBe("full");
        expect(
          elements.every((element) => displacementPasses(element) === 3),
        ).toBe(true);
      });

      scope.destroy();
    },
  );
});
