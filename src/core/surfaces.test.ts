import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetBackground } from "./background.js";
import { createSurface } from "./surfaces.js";

vi.mock("./map.js", () => ({
  generateDisplacementMap: vi.fn(() => "data:image/png,map"),
}));

describe("createSurface", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.style.cssText = "";
    __resetBackground();
  });

  afterEach(() => {
    __resetBackground();
    vi.restoreAllMocks();
  });

  it("registers the element with the surface class and restores it on destroy", () => {
    const el = document.createElement("section");
    document.body.appendChild(el);
    const surface = createSurface(el);
    expect(surface.element).toBe(el);
    expect(el.classList.contains("lgs-surface")).toBe(true);
    surface.destroy();
    expect(el.classList.contains("lgs-surface")).toBe(false);
  });

  it("warns when the surface element itself is a scroller (Safari rule 4)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = document.createElement("div");
    el.style.overflowY = "auto";
    document.body.appendChild(el);
    const surface = createSurface(el);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("must wrap scrollers"),
    );
    surface.destroy();
    warn.mockRestore();
  });

  it("creates a painted .lgs-bg first child when background is requested", () => {
    document.body.style.backgroundColor = "rgb(3, 4, 5)";
    const el = document.createElement("div");
    const content = document.createElement("p");
    el.appendChild(content);
    document.body.appendChild(el);

    const surface = createSurface(el, { background: true });
    const bg = el.querySelector<HTMLElement>(":scope > .lgs-bg");
    expect(bg).toBeTruthy();
    expect(el.firstElementChild).toBe(bg);
    expect(bg?.getAttribute("aria-hidden")).toBe("true");
    expect(bg?.style.backgroundColor).toBe("rgb(3, 4, 5)");

    surface.destroy();
    expect(el.querySelector(".lgs-bg")).toBeNull();
    expect(Array.from(el.children)).toEqual([content]);
  });

  it("adopts an existing .lgs-bg child (React owns it) and paints an explicit background string", () => {
    const el = document.createElement("div");
    const bg = document.createElement("div");
    bg.className = "lgs-bg";
    el.appendChild(bg);
    document.body.appendChild(el);

    const surface = createSurface(el, { background: "rgb(120, 0, 120)" });
    expect(el.querySelectorAll(".lgs-bg")).toHaveLength(1);
    expect(bg.style.background).toContain("rgb(120, 0, 120)");

    surface.destroy();
    // Adopted node stays, its inline styles restored.
    expect(Array.from(el.children)).toEqual([bg]);
    expect(bg.style.cssText).toBe("");
  });
});
