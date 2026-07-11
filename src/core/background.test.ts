import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetBackground,
  paintBackground,
  setBackground,
  subscribeBackground,
} from "./background.js";

/** Minimal Image stand-in: loads asynchronously with a fixed natural size. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 4000;
  naturalHeight = 2000;
  width = 4000;
  height = 2000;
  set src(_v: string) {
    queueMicrotask(() => this.onload?.());
  }
}

function subscriberAt(left: number, top: number): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    x: left,
    y: top,
    left,
    top,
    right: left + 10,
    bottom: top + 10,
    width: 10,
    height: 10,
    toJSON: () => ({}),
  } as DOMRect);
  return el;
}

describe("BackgroundModel", () => {
  const unsubs: Array<() => void> = [];

  beforeEach(() => {
    __resetBackground();
    document.body.innerHTML = "";
    document.body.style.cssText = "";
    vi.stubGlobal("Image", FakeImage);
  });

  afterEach(() => {
    for (const u of unsubs.splice(0)) u();
    __resetBackground();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("auto-detects the body background and offsets each copy by its viewport position", async () => {
    document.body.style.backgroundImage = "url(/wallpaper.jpg)";
    document.body.style.backgroundColor = "rgb(10, 20, 30)";

    const el = subscriberAt(100, 50);
    unsubs.push(subscribeBackground({ element: el }));

    expect(el.style.backgroundImage).toContain("wallpaper.jpg");
    expect(el.style.backgroundColor).toBe("rgb(10, 20, 30)");
    expect(el.style.backgroundRepeat).toBe("no-repeat");

    // Natural size arrives async → cover-fit recomputes for the viewport
    // (jsdom: 1024x768; image 4000x2000 → scale 0.384 → 1536x768, centred
    // at x −256), offset by the copy's own viewport position.
    await Promise.resolve();
    expect(el.style.backgroundSize).toBe("1536px 768px");
    expect(el.style.backgroundPosition).toBe("-356px -50px");
  });

  it("uses viewport-sized placement for gradients/colors", () => {
    document.body.style.backgroundImage =
      "linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))";
    const el = subscriberAt(40, 20);
    unsubs.push(subscribeBackground({ element: el }));

    expect(el.style.backgroundImage).toContain("linear-gradient");
    expect(el.style.backgroundSize).toBe("1024px 768px");
    expect(el.style.backgroundPosition).toBe("-40px -20px");
  });

  it("setBackground(css) propagates to every subscriber; null re-auto-detects", () => {
    document.body.style.backgroundColor = "rgb(1, 2, 3)";
    const a = subscriberAt(0, 0);
    const b = subscriberAt(200, 300);
    unsubs.push(subscribeBackground({ element: a }));
    unsubs.push(subscribeBackground({ element: b }));
    expect(a.style.backgroundColor).toBe("rgb(1, 2, 3)");

    setBackground("linear-gradient(rgb(0, 255, 0), rgb(0, 0, 0))");
    expect(a.style.background).toContain("linear-gradient");
    expect(b.style.background).toContain("linear-gradient");
    expect(b.style.backgroundPosition).toBe("-200px -300px");

    document.body.style.backgroundColor = "rgb(9, 9, 9)";
    setBackground(null);
    expect(a.style.backgroundColor).toBe("rgb(9, 9, 9)");
    expect(b.style.backgroundColor).toBe("rgb(9, 9, 9)");
  });

  it("honours a per-subscriber override instead of the page background", () => {
    document.body.style.backgroundColor = "rgb(1, 2, 3)";
    const el = subscriberAt(10, 10);
    const sub = {
      element: el,
      override: () => "rgb(200, 100, 0)",
    };
    unsubs.push(subscribeBackground(sub));
    expect(el.style.background).toContain("rgb(200, 100, 0)");

    // A global setBackground doesn't displace the override.
    setBackground("rgb(0, 0, 0)");
    expect(el.style.background).toContain("rgb(200, 100, 0)");
  });

  it("repositions subscribers on scroll and repaints on resize", async () => {
    const el = subscriberAt(100, 50);
    const rect = { left: 100, top: 50 };
    vi.spyOn(el, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          x: rect.left,
          y: rect.top,
          left: rect.left,
          top: rect.top,
          right: rect.left + 10,
          bottom: rect.top + 10,
          width: 10,
          height: 10,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    unsubs.push(subscribeBackground({ element: el }));
    expect(el.style.backgroundPosition).toBe("-100px -50px");

    rect.top = 20; // the page scrolled by 30
    window.dispatchEvent(new Event("scroll"));
    expect(el.style.backgroundPosition).toBe("-100px -20px");

    window.dispatchEvent(new Event("resize"));
    expect(el.style.backgroundPosition).toBe("-100px -20px");
    expect(el.style.backgroundSize).toBe("1024px 768px");
  });

  it("repositions inner-scroller descendants even when the scroller lives inside a fixed shell", async () => {
    const shell = document.createElement("div");
    shell.style.position = "fixed";
    const scroller = document.createElement("div");
    const el = document.createElement("div");
    scroller.appendChild(el);
    shell.appendChild(scroller);
    document.body.appendChild(shell);

    const rect = { left: 100, top: 50 };
    vi.spyOn(el, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          x: rect.left,
          y: rect.top,
          left: rect.left,
          top: rect.top,
          right: rect.left + 10,
          bottom: rect.top + 10,
          width: 10,
          height: 10,
          toJSON: () => ({}),
        }) as DOMRect,
    );

    unsubs.push(subscribeBackground({ element: el }));
    expect(el.style.backgroundPosition).toBe("-100px -50px");

    rect.top = 20;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    expect(el.style.backgroundPosition).toBe("-100px -20px");
  });

  it("skips repositioning fixed descendants of the active scroller", async () => {
    const scroller = document.createElement("div");
    const fixed = document.createElement("div");
    fixed.style.position = "fixed";
    const el = document.createElement("div");
    fixed.appendChild(el);
    scroller.appendChild(fixed);
    document.body.appendChild(scroller);

    const rect = { left: 100, top: 50 };
    vi.spyOn(el, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          x: rect.left,
          y: rect.top,
          left: rect.left,
          top: rect.top,
          right: rect.left + 10,
          bottom: rect.top + 10,
          width: 10,
          height: 10,
          toJSON: () => ({}),
        }) as DOMRect,
    );

    unsubs.push(subscribeBackground({ element: el }));
    expect(el.style.backgroundPosition).toBe("-100px -50px");

    rect.top = 20;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    expect(el.style.backgroundPosition).toBe("-100px -50px");
  });

  it("paintBackground repaints a single subscriber on demand", () => {
    const el = subscriberAt(5, 5);
    const sub = { element: el };
    unsubs.push(subscribeBackground(sub));
    el.style.backgroundPosition = "0px 0px";
    paintBackground(sub);
    expect(el.style.backgroundPosition).toBe("-5px -5px");
  });
});
