import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetBackground, setBackground } from "./background.js";
import { glass, unionCovers } from "./glass.js";
import { bakeSpecularHighlight, generateDisplacementMap } from "./map.js";
import { createMediaSurface, type MediaSurface } from "./media.js";
import { createGlassScope } from "./scope.js";
import { type ContentSurface, createSurface } from "./surfaces.js";

// jsdom has no canvas rasteriser; stand in a deterministic map generator that
// encodes the inputs we care about (dimensions + per-lens amplitude), and a
// specular bake that encodes its inputs the same way.
vi.mock("./map.js", () => ({
  generateDisplacementMap: vi.fn(
    (o: { width: number; height: number; amplitude?: number }) =>
      `data:image/png,map-${o.width}x${o.height}-a${o.amplitude ?? 1}`,
  ),
  bakeSpecularHighlight: vi.fn(
    async (o: { width: number; height: number; specular: number }) =>
      `data:image/png,spec-${o.width}x${o.height}-s${o.specular}`,
  ),
}));

/** Let the async specular bake (mocked, but still a promise) settle. */
const settleBake = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

const SAFARI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function extractFilterId(value: string): string | null {
  return value.match(/#([^)"']+)/)?.[1] ?? null;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Mock an element's rect; mutate the returned box to "move" it. */
function setRect(el: Element, r: Box): Box {
  const box = { ...r };
  vi.spyOn(el, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        x: box.left,
        y: box.top,
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        right: box.left + box.width,
        bottom: box.top + box.height,
        toJSON: () => ({}),
      }) as DOMRect,
  );
  return box;
}

function addEl(tag = "div"): HTMLElement {
  const el = document.createElement(tag);
  document.body.appendChild(el);
  return el;
}

describe("glass routing", () => {
  const cleanups: Array<() => void> = [];
  let rafQueue: FrameRequestCallback[] = [];
  const flushRaf = (): void => {
    const q = rafQueue;
    rafQueue = [];
    for (const cb of q) cb(0);
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.style.cssText = "";
    __resetBackground();
    rafQueue = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    for (const c of cleanups.splice(0).reverse()) c();
    __resetBackground();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers a sub-lens in an overlapping content surface and moves it via two attribute writes", () => {
    const surfaceEl = addEl("main");
    setRect(surfaceEl, { left: 0, top: 0, width: 400, height: 300 });
    const surface = createSurface(surfaceEl);
    cleanups.push(() => surface.destroy());

    const lensEl = addEl("nav");
    const lensBox = setRect(lensEl, {
      left: 20,
      top: 30,
      width: 120,
      height: 50,
    });
    const handle = glass(lensEl, { scale: 40, blur: 0, chroma: 0 });
    cleanups.push(() => handle.destroy());

    const filterId = extractFilterId(surfaceEl.style.filter);
    expect(filterId).toBeTruthy();
    const filter = document.getElementById(filterId ?? "");
    expect(filter?.localName).toBe("filter");
    const bump = filter?.querySelector("feImage");
    expect(bump?.getAttribute("result")).toMatch(/^lqbump-/);
    expect(bump?.getAttribute("x")).toBe("20");
    expect(bump?.getAttribute("y")).toBe("30");
    expect(bump?.getAttribute("width")).toBe("120");
    expect(bump?.getAttribute("height")).toBe("50");

    // A pure move: same filter (no rebuild), only the bump's x/y change.
    lensBox.left = 44;
    lensBox.top = 60;
    handle.geometryChanged();
    expect(extractFilterId(surfaceEl.style.filter)).toBe(filterId);
    expect(bump?.getAttribute("x")).toBe("44");
    expect(bump?.getAttribute("y")).toBe("60");
  });

  it("shares one filter between two lenses with per-lens amplitude maps and independent moves", () => {
    const surfaceEl = addEl();
    setRect(surfaceEl, { left: 0, top: 0, width: 500, height: 400 });
    const surface = createSurface(surfaceEl);
    cleanups.push(() => surface.destroy());

    const lensAEl = addEl();
    setRect(lensAEl, { left: 10, top: 10, width: 100, height: 40 });
    const a = glass(lensAEl, { scale: 90, blur: 0, chroma: 0 });
    cleanups.push(() => a.destroy());

    const lensBEl = addEl();
    const lensBBox = setRect(lensBEl, {
      left: 200,
      top: 100,
      width: 80,
      height: 30,
    });
    const b = glass(lensBEl, { scale: 45, blur: 0, chroma: 0 });
    cleanups.push(() => b.destroy());

    const filterId = extractFilterId(surfaceEl.style.filter);
    const filter = document.getElementById(filterId ?? "");
    const bumps = Array.from(filter?.querySelectorAll("feImage") ?? []);
    expect(bumps).toHaveLength(2);
    expect(filter?.querySelectorAll("feFlood")).toHaveLength(1);

    // Chain scale = max(90, 45); lens B's map bakes amplitude 45/90 = 0.5.
    const calls = vi.mocked(generateDisplacementMap).mock.calls;
    const forB = calls.filter(([o]) => o.width === 80 && o.height === 30);
    expect(forB[forB.length - 1]?.[0].amplitude).toBe(0.5);
    const forA = calls.filter(([o]) => o.width === 100 && o.height === 40);
    expect(forA[forA.length - 1]?.[0].amplitude).toBe(1);
    const bumpA = bumps.find((n) => n.getAttribute("width") === "100");
    const bumpB = bumps.find((n) => n.getAttribute("width") === "80");
    expect(bumpB?.getAttribute("href")).toContain("a0.5");
    expect(bumpA?.getAttribute("href")).toContain("a1");

    // Moving B touches only B's feImage; no filter rebuild.
    lensBBox.left = 260;
    b.geometryChanged();
    expect(extractFilterId(surfaceEl.style.filter)).toBe(filterId);
    expect(bumpB?.getAttribute("x")).toBe("260");
    expect(bumpA?.getAttribute("x")).toBe("10");
  });

  it("drops the registration (and restores the surface) when overlap ends", () => {
    const surfaceEl = addEl();
    setRect(surfaceEl, { left: 0, top: 0, width: 300, height: 200 });
    surfaceEl.style.filter = "brightness(0.9)";
    const surface = createSurface(surfaceEl);
    cleanups.push(() => surface.destroy());

    const lensEl = addEl();
    const lensBox = setRect(lensEl, {
      left: 10,
      top: 10,
      width: 80,
      height: 40,
    });
    const handle = glass(lensEl);
    cleanups.push(() => handle.destroy());
    expect(surfaceEl.style.filter).toContain("url(");

    lensBox.left = 900; // no longer overlapping
    handle.geometryChanged();
    expect(surfaceEl.style.filter).toBe("brightness(0.9)");
  });

  it("never registers a descendant/ancestor pair; warns once only when explicit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const surfaceEl = addEl();
    setRect(surfaceEl, { left: 0, top: 0, width: 400, height: 300 });
    const surface = createSurface(surfaceEl);
    cleanups.push(() => surface.destroy());

    // The lens lives INSIDE the surface subtree.
    const lensEl = document.createElement("div");
    surfaceEl.appendChild(lensEl);
    setRect(lensEl, { left: 50, top: 50, width: 100, height: 40 });

    const auto = glass(lensEl);
    expect(surfaceEl.style.filter).toBe("");
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("cannot refract"),
    );
    auto.destroy();

    const explicit = glass(lensEl, { surfaces: [surface] });
    cleanups.push(() => explicit.destroy());
    expect(surfaceEl.style.filter).toBe("");
    explicit.geometryChanged();
    explicit.geometryChanged();
    const exclusionWarns = warn.mock.calls.filter(([m]) =>
      String(m).includes("cannot refract"),
    );
    expect(exclusionWarns).toHaveLength(1);
    warn.mockRestore();
  });

  it("routes only to explicitly listed surfaces", () => {
    const s1El = addEl();
    setRect(s1El, { left: 0, top: 0, width: 200, height: 200 });
    const s1 = createSurface(s1El);
    cleanups.push(() => s1.destroy());
    const s2El = addEl();
    setRect(s2El, { left: 0, top: 0, width: 200, height: 200 });
    const s2 = createSurface(s2El);
    cleanups.push(() => s2.destroy());

    const lensEl = addEl();
    setRect(lensEl, { left: 10, top: 10, width: 50, height: 50 });
    const handle = glass(lensEl, { surfaces: [s1] });
    cleanups.push(() => handle.destroy());

    expect(s1El.style.filter).toContain("url(");
    expect(s2El.style.filter).toBe("");
  });

  it("auto-routes every overlapping surface regardless of DOM island", () => {
    const localIsland = addEl();
    const localSurfaceEl = document.createElement("div");
    localIsland.appendChild(localSurfaceEl);
    setRect(localSurfaceEl, { left: 0, top: 0, width: 200, height: 200 });
    const localSurface = createSurface(localSurfaceEl);
    cleanups.push(() => localSurface.destroy());

    const otherIsland = addEl();
    const unrelatedLensEl = document.createElement("div");
    otherIsland.appendChild(unrelatedLensEl);
    setRect(unrelatedLensEl, { left: 20, top: 20, width: 50, height: 50 });
    const unrelated = glass(unrelatedLensEl);
    cleanups.push(() => unrelated.destroy());
    expect(localSurfaceEl.style.filter).toContain("url(");

    const siblingLensEl = document.createElement("div");
    localIsland.appendChild(siblingLensEl);
    setRect(siblingLensEl, { left: 20, top: 20, width: 50, height: 50 });
    const sibling = glass(siblingLensEl);
    cleanups.push(() => sibling.destroy());
    expect(localSurfaceEl.style.filter).toContain("url(");

    const globalSurfaceEl = addEl();
    setRect(globalSurfaceEl, { left: 0, top: 0, width: 200, height: 200 });
    const globalSurface = createSurface(globalSurfaceEl);
    cleanups.push(() => globalSurface.destroy());
    unrelated.geometryChanged();
    expect(globalSurfaceEl.style.filter).toContain("url(");
  });

  it("isolates scoped auto-routing across remote DOM islands", () => {
    const first = createGlassScope();
    const second = createGlassScope();
    cleanups.push(
      () => first.destroy(),
      () => second.destroy(),
    );
    const firstSurfaceEl = addEl();
    const secondSurfaceEl = addEl();
    setRect(firstSurfaceEl, { left: 0, top: 0, width: 200, height: 200 });
    setRect(secondSurfaceEl, { left: 0, top: 0, width: 200, height: 200 });
    first.createSurface(firstSurfaceEl);
    second.createSurface(secondSurfaceEl);
    const remotePortalHost = addEl();
    const lensEl = document.createElement("div");
    remotePortalHost.appendChild(lensEl);
    setRect(lensEl, { left: 20, top: 20, width: 50, height: 50 });
    first.glass(lensEl, { background: false });
    expect(firstSurfaceEl.style.filter).toContain("url(");
    expect(secondSurfaceEl.style.filter).toBe("");
    expect(first.getDiagnostics()).toMatchObject({
      lenses: 1,
      contentSurfaces: 1,
    });
    first.destroy();
    expect(firstSurfaceEl.style.filter).toBe("");
    expect(first.getDiagnostics()).toMatchObject({
      lenses: 0,
      contentSurfaces: 0,
    });
  });

  it("warns and ignores explicit cross-scope surface handles", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = createGlassScope();
    const second = createGlassScope();
    cleanups.push(
      () => first.destroy(),
      () => second.destroy(),
    );
    const surfaceEl = addEl();
    setRect(surfaceEl, { left: 0, top: 0, width: 200, height: 200 });
    const foreign = second.createSurface(surfaceEl);
    const lensEl = addEl();
    setRect(lensEl, { left: 20, top: 20, width: 50, height: 50 });
    const handle = first.glass(lensEl, {
      background: false,
      surfaces: [foreign],
    });
    handle.geometryChanged();
    handle.geometryChanged();
    expect(surfaceEl.style.filter).toBe("");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("belongs to another scope"),
    );
    expect(
      warn.mock.calls.filter(([message]) =>
        String(message).includes("belongs to another scope"),
      ),
    ).toHaveLength(1);
  });

  it("moves 32 scoped lenses without rebuilding filters or maps after warmup", () => {
    const scope = createGlassScope();
    cleanups.push(() => scope.destroy());
    const surfaceEl = addEl();
    setRect(surfaceEl, { left: 0, top: 0, width: 1000, height: 800 });
    scope.createSurface(surfaceEl);
    const boxes: Box[] = [];
    const handles = Array.from({ length: 32 }, (_, index) => {
      const el = addEl();
      boxes.push(
        setRect(el, {
          left: 10 + (index % 8) * 100,
          top: 10 + Math.floor(index / 8) * 100,
          width: 60,
          height: 30,
        }),
      );
      return scope.glass(el, { background: false, chroma: 0 });
    });
    const warm = scope.getDiagnostics();
    for (let frame = 0; frame < 120; frame++) {
      handles.forEach((handle, index) => {
        boxes[index].left += 0.01;
        handle.geometryChanged();
      });
    }
    const after = scope.getDiagnostics();
    expect(after.filterRebuilds).toBe(warm.filterRebuilds);
    expect(after.mapRegenerations).toBe(warm.mapRegenerations);
    expect(after.geometryRafCallbacks).toBe(0);
  });

  it("runs zero scoped animation callbacks over two idle seconds", () => {
    vi.useFakeTimers();
    const scope = createGlassScope();
    cleanups.push(() => scope.destroy());
    const lensEl = addEl();
    setRect(lensEl, { left: 10, top: 10, width: 80, height: 40 });
    scope.glass(lensEl, { background: false });
    const before = scope.getDiagnostics();
    vi.advanceTimersByTime(2_000);
    const after = scope.getDiagnostics();
    expect(after.geometryRafCallbacks).toBe(before.geometryRafCallbacks);
    expect(after.mediaRafCallbacks).toBe(before.mediaRafCallbacks);
    vi.useRealTimers();
  });

  it("discovers surfaces registered after the lens", () => {
    const lensEl = addEl();
    setRect(lensEl, { left: 10, top: 10, width: 50, height: 50 });
    const handle = glass(lensEl);
    cleanups.push(() => handle.destroy());

    const surfaceEl = addEl();
    setRect(surfaceEl, { left: 0, top: 0, width: 300, height: 300 });
    const surface = createSurface(surfaceEl);
    cleanups.push(() => surface.destroy());

    expect(surfaceEl.style.filter).toContain("url(");
  });

  it("hides .lg-bg under full surface cover and paints it (sized lens + margin) when uncovered", () => {
    const surfaceEl = addEl();
    setRect(surfaceEl, { left: 0, top: 0, width: 400, height: 300 });
    const surface = createSurface(surfaceEl);
    cleanups.push(() => surface.destroy());

    const lensEl = addEl();
    const lensBox = setRect(lensEl, {
      left: 50,
      top: 50,
      width: 120,
      height: 60,
    });
    // scale 10 / blur 0 / chroma 0 → sampling margin = 10.
    const handle = glass(lensEl, { scale: 10, blur: 0, chroma: 0 });
    cleanups.push(() => handle.destroy());

    // Fully covered → the background copy is never shown.
    expect(lensEl.querySelector(":scope > .lg-bg")).toBeNull();

    // Straddle the surface edge → partial cover → paint the copy.
    lensBox.left = 350;
    handle.geometryChanged();
    const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
    expect(bg).toBeTruthy();
    expect(bg?.style.display).not.toBe("none");
    expect(bg?.style.width).toBe("140px"); // 120 + 2 × 10
    expect(bg?.style.height).toBe("80px"); // 60 + 2 × 10
    expect(bg?.style.transform).toContain("translate(-10px, -10px)");
    expect(bg?.style.filter).toContain("url(");

    // Back under full cover → hidden again (element kept).
    lensBox.left = 50;
    handle.geometryChanged();
    expect(bg?.style.display).toBe("none");
  });

  it("treats the union of several surfaces as full cover", () => {
    expect(
      unionCovers({ left: 0, top: 0, right: 100, bottom: 100 }, [
        { left: -10, top: -10, right: 60, bottom: 110 },
        { left: 55, top: -10, right: 110, bottom: 110 },
      ]),
    ).toBe(true);
    expect(
      unionCovers({ left: 0, top: 0, right: 100, bottom: 100 }, [
        { left: -10, top: -10, right: 60, bottom: 50 },
        { left: 55, top: -10, right: 110, bottom: 110 },
      ]),
    ).toBe(false);
    // Per-edge 1px tolerance.
    expect(
      unionCovers({ left: 0, top: 0, right: 100, bottom: 100 }, [
        { left: 0.5, top: 0.5, right: 99.5, bottom: 99.5 },
      ]),
    ).toBe(true);
  });

  it("background: false never paints the copy", () => {
    const lensEl = addEl();
    setRect(lensEl, { left: 10, top: 10, width: 100, height: 50 });
    const handle = glass(lensEl, { background: false });
    cleanups.push(() => handle.destroy());
    expect(lensEl.querySelector(":scope > .lg-bg")).toBeNull();
  });

  it("background: <css string> paints that instead of the page background", () => {
    document.body.style.backgroundColor = "rgb(1, 2, 3)";
    const lensEl = addEl();
    setRect(lensEl, { left: 10, top: 10, width: 100, height: 50 });
    const handle = glass(lensEl, { background: "rgb(200, 100, 0)" });
    cleanups.push(() => handle.destroy());
    const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
    expect(bg?.style.background).toContain("rgb(200, 100, 0)");
  });

  it("setBackground propagates to a mounted lens .lg-bg", () => {
    const lensEl = addEl();
    setRect(lensEl, { left: 10, top: 10, width: 100, height: 50 });
    const handle = glass(lensEl);
    cleanups.push(() => handle.destroy());
    setBackground("rgb(5, 6, 7)");
    const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
    expect(bg?.style.background).toContain("rgb(5, 6, 7)");
  });

  it("treats a WebGL2-less media surface as inert and non-covering", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const video = document.createElement("video");
    document.body.appendChild(video);
    setRect(video, { left: 0, top: 0, width: 400, height: 300 });
    const media = createMediaSurface(video, { live: true });
    cleanups.push(() => media.destroy());
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("WebGL2 unavailable"),
      expect.anything(),
    );

    const lensEl = addEl();
    setRect(lensEl, { left: 50, top: 50, width: 100, height: 50 });
    const handle = glass(lensEl);
    cleanups.push(() => handle.destroy());

    // Rule 5: the inert media surface does not count as cover → the lens
    // falls back to the background copy.
    const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
    expect(bg).toBeTruthy();
    expect(bg?.style.display).not.toBe("none");
    warn.mockRestore();
  });

  it("destroy() restores the lens element and every surface it touched", () => {
    const surfaceEl = addEl();
    setRect(surfaceEl, { left: 0, top: 0, width: 300, height: 200 });
    const surface = createSurface(surfaceEl);
    cleanups.push(() => surface.destroy());

    const lensEl = addEl();
    lensEl.style.borderRadius = "3px";
    setRect(lensEl, { left: 10, top: 10, width: 500, height: 40 });
    const handle = glass(lensEl);
    handle.destroy();

    expect(lensEl.classList.contains("lg")).toBe(false);
    expect(lensEl.querySelector(".lg-sheen")).toBeNull();
    expect(lensEl.querySelector(".lg-bg")).toBeNull();
    expect(lensEl.style.borderRadius).toBe("3px");
    expect(surfaceEl.style.filter).toBe("");
  });

  it("does not promote compositor layers on non-Safari engines", () => {
    const surfaceEl = addEl();
    setRect(surfaceEl, { left: 0, top: 0, width: 400, height: 300 });
    const surface = createSurface(surfaceEl);
    cleanups.push(() => surface.destroy());

    const lensEl = addEl();
    setRect(lensEl, { left: 500, top: 10, width: 80, height: 40 });
    const handle = glass(lensEl); // off-surface → paints .lg-bg
    cleanups.push(() => handle.destroy());

    expect(surfaceEl.classList.contains("lg-composited")).toBe(false);
    const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
    expect(bg?.classList.contains("lg-composited")).toBe(false);
    expect(bg?.style.transform).not.toContain("translateZ");
  });

  describe("Safari", () => {
    beforeEach(() => {
      vi.stubGlobal("navigator", { userAgent: SAFARI_UA });
    });

    it("promotes filtered layers to composited layers (rule 1)", () => {
      const surfaceEl = addEl();
      setRect(surfaceEl, { left: 0, top: 0, width: 400, height: 300 });
      const surface = createSurface(surfaceEl);
      cleanups.push(() => surface.destroy());

      const lensEl = addEl();
      setRect(lensEl, { left: 500, top: 10, width: 80, height: 40 });
      const handle = glass(lensEl); // off-surface → paints .lg-bg
      cleanups.push(() => handle.destroy());

      expect(surfaceEl.classList.contains("lg-composited")).toBe(true);
      const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
      expect(bg?.classList.contains("lg-composited")).toBe(true);
      expect(bg?.style.transform).toContain("translateZ(0)");

      handle.destroy();
      surface.destroy();
      expect(surfaceEl.classList.contains("lg-composited")).toBe(false);
    });

    it("routes an over-budget surface to the native backdrop-filter tier", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const surfaceEl = addEl();
      setRect(surfaceEl, { left: 0, top: 0, width: 3000, height: 500 });
      const surface = createSurface(surfaceEl) as ContentSurface;
      cleanups.push(() => surface.destroy());

      const lensEl = addEl();
      setRect(lensEl, { left: 50, top: 50, width: 100, height: 50 });
      const handle = glass(lensEl);
      cleanups.push(() => handle.destroy());

      expect(surface.nativeTier).toBe(true);
      expect(surfaceEl.style.filter).toBe("");
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("provisional webkit filter budget"),
      );
      const budgetWarns = warn.mock.calls.filter(([m]) =>
        String(m).includes("provisional webkit filter budget"),
      );
      expect(budgetWarns).toHaveLength(1);

      // The lens shows .lg-bg in native mode: visible, no painted copy,
      // no SVG filter.
      const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
      expect(bg).toBeTruthy();
      expect(bg?.style.display).not.toBe("none");
      expect(bg?.style.background).toBe("none");
      expect(bg?.style.filter).toBe("");
      warn.mockRestore();
    });

    it("keeps a visible surface fallback reason observable during repeated routing", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const scope = createGlassScope();
      cleanups.push(() => scope.destroy());
      const surfaceEl = addEl();
      setRect(surfaceEl, { left: 0, top: 0, width: 3000, height: 500 });
      scope.createSurface(surfaceEl);

      const lensEl = addEl();
      setRect(lensEl, { left: 50, top: 50, width: 100, height: 50 });
      const handle = scope.glass(lensEl, {
        background: "linear-gradient(135deg,#f64,#35f)",
      });
      expect(handle.backends).toContain("native");

      // Model a long mixed-scene scroll. Per-lens within-budget decisions used
      // to evict the still-visible surface fallback from the bounded history.
      for (let index = 0; index < 60; index++) handle.geometryChanged();
      const policy = scope.getDiagnostics().policy;
      expect(policy[policy.length - 1]).toMatchObject({
        backend: "native",
        reason: "webkit-hard-dimension",
      });
      expect(policy).toHaveLength(50);
    });

    it("honors tint and none fallbacks for an over-budget surface", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const surfaceEl = addEl();
      setRect(surfaceEl, { left: 0, top: 0, width: 3000, height: 500 });
      const surface = createSurface(surfaceEl) as ContentSurface;
      cleanups.push(() => surface.destroy());

      const tintEl = addEl();
      setRect(tintEl, { left: 50, top: 50, width: 100, height: 50 });
      const tint = glass(tintEl, { fallback: "tint", surfaces: [surface] });
      cleanups.push(() => tint.destroy());
      expect(tint.backends).toEqual(["native"]);
      expect(tintEl.style.background).not.toBe("transparent");
      expect(tintEl.querySelector(":scope > .lg-bg")).toBeNull();

      const noneEl = addEl();
      setRect(noneEl, { left: 170, top: 50, width: 100, height: 50 });
      const none = glass(noneEl, { fallback: "none", surfaces: [surface] });
      cleanups.push(() => none.destroy());
      expect(none.backends).toEqual(["none"]);
      expect(noneEl.style.background).toBe("transparent");
      expect(noneEl.style.boxShadow).toBe("none");
    });

    it("epsilon-flushes the surface filter after a lens move, coalesced per rAF", () => {
      const surfaceEl = addEl();
      setRect(surfaceEl, { left: 0, top: 0, width: 400, height: 300 });
      const surface = createSurface(surfaceEl);
      cleanups.push(() => surface.destroy());

      const lensEl = addEl();
      const lensBox = setRect(lensEl, {
        left: 10,
        top: 10,
        width: 80,
        height: 40,
      });
      const handle = glass(lensEl, { scale: 20, blur: 0, chroma: 0 });
      cleanups.push(() => handle.destroy());
      expect(surfaceEl.style.filter).not.toContain("brightness");

      lensBox.left = 20;
      handle.geometryChanged();
      lensBox.left = 30;
      handle.geometryChanged();
      flushRaf();
      expect(surfaceEl.style.filter).toContain("brightness(1.0001)");

      lensBox.left = 40;
      handle.geometryChanged();
      flushRaf();
      expect(surfaceEl.style.filter).not.toContain("brightness");
      expect(surfaceEl.style.filter).toContain("url(");
    });
  });

  describe("Chromium backdrop tier", () => {
    beforeEach(() => {
      vi.stubGlobal("navigator", {
        userAgent: CHROME_UA,
        userAgentData: { brands: [{ brand: "Chromium", version: "126" }] },
      });
      vi.stubGlobal("CSS", {
        supports: (property: string, value: string) =>
          property === "backdrop-filter" && value === "url(#x)",
      });
    });

    it("routes the bg to backdrop-filter: url() and never registers on surfaces", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const surfaceEl = addEl("main");
      setRect(surfaceEl, { left: 0, top: 0, width: 400, height: 300 });
      const surface = createSurface(surfaceEl);
      cleanups.push(() => surface.destroy());

      const video = document.createElement("video");
      document.body.appendChild(video);
      setRect(video, { left: 0, top: 0, width: 400, height: 300 });
      const media = createMediaSurface(video) as MediaSurface;
      cleanups.push(() => media.destroy());
      const mediaAttach = vi.spyOn(media, "attachLens");

      const lensEl = addEl("nav");
      setRect(lensEl, { left: 20, top: 30, width: 120, height: 50 });
      const handle = glass(lensEl, { scale: 40, blur: 0, chroma: 0 });
      cleanups.push(() => handle.destroy());

      // No double bending: neither the overlapping content surface nor the
      // media surface receives the lens.
      expect(surfaceEl.style.filter).toBe("");
      expect(mediaAttach).not.toHaveBeenCalled();

      // `.lg-bg` is the backdrop carrier: no painted copy, no margin
      // extension, no transform — inset 0 with the host's radius.
      const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
      expect(bg).toBeTruthy();
      expect(bg?.style.backdropFilter).toContain("url(");
      expect(bg?.style.background).toBe("none");
      expect(bg?.style.backgroundPosition).toBe("");
      expect(bg?.style.width).toBe("100%");
      expect(bg?.style.height).toBe("100%");
      expect(bg?.style.transform).toBe("");
      expect(bg?.style.borderRadius).toBe("inherit");
      expect(bg?.style.filter).toBe("");

      const filterId = extractFilterId(bg?.style.backdropFilter ?? "");
      expect(document.getElementById(filterId ?? "")?.localName).toBe("filter");
      const backdropMapCall = [...vi.mocked(generateDisplacementMap).mock.calls]
        .reverse()
        .find(([options]) => options.width === 120 && options.height === 50);
      expect(backdropMapCall?.[0].amplitude).toBe(-1);
      warn.mockRestore();
    });

    it("accounts visible backdrop workload across resize and offscreen removal", () => {
      const scope = createGlassScope();
      cleanups.push(() => scope.destroy());
      const lensEl = addEl();
      const box = setRect(lensEl, {
        left: 10,
        top: 10,
        width: 100,
        height: 50,
      });
      const handle = scope.glass(lensEl);
      expect(scope.getDiagnostics().backdropWorkload).toMatchObject({
        lenses: 1,
        devicePixelPassArea: 15_000,
        tier: "full",
      });
      box.width = 200;
      handle.geometryChanged();
      expect(scope.getDiagnostics().backdropWorkload.devicePixelPassArea).toBe(
        30_000,
      );
      box.left = 2_000;
      handle.geometryChanged();
      expect(scope.getDiagnostics().backdropWorkload).toMatchObject({
        lenses: 0,
        devicePixelPassArea: 0,
      });
    });

    it("resumes an initially offscreen lens from IntersectionObserver and returns idle", () => {
      let intersectionCallback: IntersectionObserverCallback | null = null;
      const disconnect = vi.fn();
      const unobserve = vi.fn();
      let observerConstructions = 0;
      vi.stubGlobal(
        "IntersectionObserver",
        class {
          constructor(callback: IntersectionObserverCallback) {
            observerConstructions++;
            intersectionCallback = callback;
          }
          observe() {}
          unobserve = unobserve;
          disconnect = disconnect;
          takeRecords(): IntersectionObserverEntry[] {
            return [];
          }
          root = null;
          rootMargin = "0px";
          thresholds = [0];
        },
      );
      const scope = createGlassScope();
      cleanups.push(() => scope.destroy());
      const lensEl = addEl();
      const siblingEl = addEl();
      const box = setRect(lensEl, {
        left: 10,
        top: 2_000,
        width: 100,
        height: 50,
      });
      scope.glass(lensEl);
      setRect(siblingEl, { left: 140, top: 20, width: 100, height: 50 });
      scope.glass(siblingEl);

      expect(observerConstructions).toBe(1);

      expect(lensEl.dataset.lgBackend).toBe("none");
      expect(scope.getDiagnostics().backdropWorkload.lenses).toBe(1);

      box.top = 20;
      expect(intersectionCallback).not.toBeNull();
      const callback =
        intersectionCallback as unknown as IntersectionObserverCallback;
      callback(
        [
          {
            target: lensEl,
            isIntersecting: true,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
      expect(lensEl.dataset.lgBackend).toBe("backdrop");
      expect(scope.getDiagnostics().backdropWorkload.lenses).toBe(2);

      box.top = 2_000;
      callback(
        [
          {
            target: lensEl,
            isIntersecting: false,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
      expect(lensEl.dataset.lgBackend).toBe("none");
      expect(scope.getDiagnostics().backdropWorkload.lenses).toBe(1);
      const idle = scope.getDiagnostics().geometryRafCallbacks;
      flushRaf();
      flushRaf();
      expect(scope.getDiagnostics().geometryRafCallbacks).toBe(idle);

      const duplicateEl = addEl();
      const duplicateBox = setRect(duplicateEl, {
        left: 20,
        top: 2_000,
        width: 80,
        height: 40,
      });
      const duplicateA = scope.glass(duplicateEl);
      const duplicateB = scope.glass(duplicateEl);
      duplicateA.destroy();
      expect(
        unobserve.mock.calls.some(([target]) => target === duplicateEl),
      ).toBe(false);
      duplicateBox.top = 30;
      callback(
        [
          {
            target: duplicateEl,
            isIntersecting: true,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
      expect(duplicateB.backends).toContain("backdrop");
      duplicateB.destroy();
      expect(
        unobserve.mock.calls.filter(([target]) => target === duplicateEl),
      ).toHaveLength(1);

      scope.destroy();
      expect(unobserve).toHaveBeenCalledTimes(3);
      expect(disconnect).toHaveBeenCalled();
    });

    it("does no scroll work: a scrolled frame writes nothing on the bg", () => {
      const lensEl = addEl();
      setRect(lensEl, { left: 20, top: 30, width: 120, height: 50 });
      const handle = glass(lensEl);
      cleanups.push(() => handle.destroy());

      const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
      expect(bg).toBeTruthy();
      const before = bg?.style.cssText;

      window.dispatchEvent(new Event("scroll"));
      flushRaf();
      expect(bg?.style.cssText).toBe(before);
      expect(bg?.style.backgroundPosition).toBe("");
    });

    it("regenerates on size change only; position moves are no-ops", () => {
      const lensEl = addEl();
      const lensBox = setRect(lensEl, {
        left: 20,
        top: 30,
        width: 120,
        height: 50,
      });
      const handle = glass(lensEl, { scale: 40, blur: 0, chroma: 0 });
      cleanups.push(() => handle.destroy());

      const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
      const firstId = extractFilterId(bg?.style.backdropFilter ?? "");
      const mapCalls = vi.mocked(generateDisplacementMap).mock.calls.length;

      // Position-only move: the compositor tracks it — no map/filter work.
      lensBox.left = 200;
      lensBox.top = 90;
      handle.geometryChanged();
      expect(extractFilterId(bg?.style.backdropFilter ?? "")).toBe(firstId);
      expect(vi.mocked(generateDisplacementMap).mock.calls.length).toBe(
        mapCalls,
      );

      // Size change: fresh map at the new dimensions + fresh filter.
      lensBox.width = 200;
      handle.geometryChanged();
      const secondId = extractFilterId(bg?.style.backdropFilter ?? "");
      expect(secondId).toBeTruthy();
      expect(secondId).not.toBe(firstId);
      expect(document.getElementById(firstId ?? "")).toBeNull();
      const calls = vi.mocked(generateDisplacementMap).mock.calls;
      const lastMap = calls[calls.length - 1]?.[0];
      expect(lastMap?.width).toBe(200);
      expect(lastMap?.height).toBe(50);
    });

    it("destroy() removes the backdrop filter defs and restores the element", () => {
      const lensEl = addEl();
      setRect(lensEl, { left: 20, top: 30, width: 120, height: 50 });
      const handle = glass(lensEl);

      const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
      const filterId = extractFilterId(bg?.style.backdropFilter ?? "");
      expect(document.getElementById(filterId ?? "")).toBeTruthy();

      handle.destroy();
      expect(document.getElementById(filterId ?? "")).toBeNull();
      expect(lensEl.querySelector(".lg-bg")).toBeNull();
      expect(lensEl.classList.contains("lg")).toBe(false);
    });

    it("background:false opts out of backdrop and routes to content", () => {
      const surfaceEl = addEl();
      setRect(surfaceEl, { left: 0, top: 0, width: 300, height: 200 });
      const surface = createSurface(surfaceEl);
      cleanups.push(() => surface.destroy());
      const lensEl = addEl();
      setRect(lensEl, { left: 10, top: 10, width: 100, height: 50 });
      const handle = glass(lensEl, {
        background: false,
        surfaces: [surface],
      });
      cleanups.push(() => handle.destroy());
      expect(surfaceEl.style.filter).toContain("url(");
      expect(lensEl.querySelector(":scope > .lg-bg")).toBeNull();
      expect(handle.backends).toEqual(["content-svg"]);
      expect(lensEl.dataset.lgBackend).toBe("content-svg");
    });

    it("an explicit CSS-string background routes content and keeps the painted-copy path", () => {
      const surfaceEl = addEl();
      setRect(surfaceEl, { left: 0, top: 0, width: 50, height: 200 });
      const surface = createSurface(surfaceEl);
      cleanups.push(() => surface.destroy());
      const lensEl = addEl();
      setRect(lensEl, { left: 10, top: 10, width: 100, height: 50 });
      const handle = glass(lensEl, {
        background: "rgb(200, 100, 0)",
        surfaces: [surface],
      });
      cleanups.push(() => handle.destroy());
      expect(surfaceEl.style.filter).toContain("url(");
      const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
      expect(bg?.style.background).toContain("rgb(200, 100, 0)");
      expect(bg?.style.filter).toContain("url(");
      expect(bg?.style.backdropFilter).toBe("");
      expect(handle.backends).toEqual(["background-copy", "content-svg"]);
    });

    it("reroutes cleanly across auto -> false -> auto updates", () => {
      const changes: string[] = [];
      const surfaceEl = addEl();
      setRect(surfaceEl, { left: 0, top: 0, width: 300, height: 200 });
      const surface = createSurface(surfaceEl);
      cleanups.push(() => surface.destroy());
      const lensEl = addEl();
      setRect(lensEl, { left: 10, top: 10, width: 100, height: 50 });
      const handle = glass(lensEl, {
        surfaces: [surface],
        onBackendChange: (backends) => changes.push(backends.join(",")),
      });
      cleanups.push(() => handle.destroy());

      expect(handle.backends).toEqual(["backdrop"]);
      expect(surfaceEl.style.filter).toBe("");
      handle.update({ background: false });
      expect(handle.backends).toEqual(["content-svg"]);
      expect(surfaceEl.style.filter).toContain("url(");
      handle.update({ background: "auto" });
      expect(handle.backends).toEqual(["backdrop"]);
      expect(surfaceEl.style.filter).toBe("");
      expect(changes).toEqual(["backdrop", "content-svg", "backdrop"]);
    });

    it("uses presets as defaults while explicit raw values win", () => {
      const lensEl = addEl();
      setRect(lensEl, { left: 10, top: 10, width: 100, height: 50 });
      const handle = glass(lensEl, {
        preset: "prominent",
        scale: 33,
        chroma: 0,
        background: "red",
      });
      cleanups.push(() => handle.destroy());
      const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
      const filterId = extractFilterId(bg?.style.filter ?? "");
      const displacement = document
        .getElementById(filterId ?? "")
        ?.querySelector("feDisplacementMap");
      expect(displacement?.getAttribute("scale")).toBe("33");
      expect(lensEl.style.background).toContain("0.09");
    });

    const backdropFilterOf = (lensEl: HTMLElement): Element | null => {
      const bg = lensEl.querySelector<HTMLElement>(":scope > .lg-bg");
      const id = extractFilterId(bg?.style.backdropFilter ?? "");
      return document.getElementById(id ?? "");
    };

    it("area-adaptive chroma: one displacement pass for big lenses, three for small", () => {
      const bigEl = addEl();
      setRect(bigEl, { left: 0, top: 0, width: 600, height: 300 }); // 180k px²
      const big = glass(bigEl, { chroma: 0.5 });
      cleanups.push(() => big.destroy());

      const smallEl = addEl();
      setRect(smallEl, { left: 0, top: 400, width: 120, height: 50 });
      const small = glass(smallEl, { chroma: 0.5 });
      cleanups.push(() => small.destroy());

      expect(
        backdropFilterOf(bigEl)?.querySelectorAll("feDisplacementMap"),
      ).toHaveLength(1);
      expect(
        backdropFilterOf(smallEl)?.querySelectorAll("feDisplacementMap"),
      ).toHaveLength(3);
    });

    it("bakes specular into a static .lg-spec overlay from the filter's own map", async () => {
      const lensEl = addEl();
      const lensBox = setRect(lensEl, {
        left: 20,
        top: 30,
        width: 120,
        height: 50,
      });
      const callsBefore = vi.mocked(bakeSpecularHighlight).mock.calls.length;
      const handle = glass(lensEl, { specular: 0.5 });
      cleanups.push(() => handle.destroy());

      // No in-chain specular pass on this tier.
      const filter = backdropFilterOf(lensEl);
      expect(filter?.querySelector('[result="spec"]')).toBeNull();

      await settleBake();
      const spec = lensEl.querySelector<HTMLElement>(":scope > .lg-spec");
      expect(spec).toBeTruthy();
      expect(spec?.getAttribute("aria-hidden")).toBe("true");
      expect(spec?.style.backgroundImage).toContain("spec-120x50-s0.5");

      // The bake read the SAME map the filter uses (highlight registration).
      const bakeArgs = vi.mocked(bakeSpecularHighlight).mock.calls[
        callsBefore
      ]?.[0];
      expect(bakeArgs?.mapUrl).toBe(
        filter?.querySelector("feImage")?.getAttribute("href"),
      );

      // Size change regenerates the overlay along with the map/filter.
      lensBox.width = 200;
      handle.geometryChanged();
      await settleBake();
      expect(spec?.style.backgroundImage).toContain("spec-200x50-s0.5");
      expect(lensEl.querySelectorAll(":scope > .lg-spec")).toHaveLength(1);

      // destroy() removes the overlay with everything else.
      handle.destroy();
      expect(lensEl.querySelector(".lg-spec")).toBeNull();
    });

    it("creates no specular overlay when specular is 0", async () => {
      const callsBefore = vi.mocked(bakeSpecularHighlight).mock.calls.length;
      const lensEl = addEl();
      setRect(lensEl, { left: 20, top: 30, width: 120, height: 50 });
      const handle = glass(lensEl); // default specular 0
      cleanups.push(() => handle.destroy());

      await settleBake();
      expect(lensEl.querySelector(".lg-spec")).toBeNull();
      expect(vi.mocked(bakeSpecularHighlight).mock.calls.length).toBe(
        callsBefore,
      );
    });
  });

  describe("auto live tracking", () => {
    const bumpX = (surfaceEl: HTMLElement): string | null | undefined => {
      const id = extractFilterId(surfaceEl.style.filter);
      const filter = id ? document.getElementById(id) : null;
      return filter?.querySelector("feImage")?.getAttribute("x");
    };

    it("follows CSS transitions in the lens subtree without track:'live', then goes idle", () => {
      const surfaceEl = addEl("main");
      setRect(surfaceEl, { left: 0, top: 0, width: 400, height: 300 });
      const surface = createSurface(surfaceEl);
      cleanups.push(() => surface.destroy());

      const lensEl = addEl();
      const lensBox = setRect(lensEl, {
        left: 10,
        top: 10,
        width: 60,
        height: 60,
      });
      let animating = 1;
      (
        lensEl as HTMLElement & { getAnimations: () => unknown[] }
      ).getAnimations = () => new Array(animating);
      const handle = glass(lensEl, { scale: 20, blur: 0, chroma: 0 });
      cleanups.push(() => handle.destroy());
      expect(bumpX(surfaceEl)).toBe("10");

      // A transition starting anywhere in the subtree puts the lens on the
      // shared ticker: geometry is re-read each frame, no manual calls.
      lensEl.dispatchEvent(new Event("transitionrun", { bubbles: true }));
      lensBox.left = 25;
      flushRaf();
      expect(bumpX(surfaceEl)).toBe("25");
      lensBox.left = 40;
      flushRaf();
      expect(bumpX(surfaceEl)).toBe("40");

      // Once the subtree reports no running animations, the subscription
      // drains after two quiet frames and the ticker no longer follows moves.
      animating = 0;
      flushRaf();
      flushRaf();
      flushRaf();
      flushRaf();
      lensBox.left = 90;
      flushRaf();
      expect(bumpX(surfaceEl)).toBe("40");

      // A new transition re-arms tracking.
      animating = 1;
      lensEl.dispatchEvent(new Event("transitionrun", { bubbles: true }));
      flushRaf();
      expect(bumpX(surfaceEl)).toBe("90");
    });
  });
});
