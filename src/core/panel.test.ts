import { describe, expect, it } from "vitest";
import { CHROME_DEFAULTS, createPanel } from "./panel.js";

const chrome = {
  radius: CHROME_DEFAULTS.radius,
  tint: "rgb(1, 2, 3)",
  shadow: "0px 0px 2px red",
  rimLight: 0.6,
  specularAngle: 135,
};

describe("createPanel", () => {
  it("creates missing layers, styles the host, and restores everything on destroy", () => {
    const host = document.createElement("div");
    const child = document.createElement("button");
    child.textContent = "Hi";
    host.appendChild(child);
    host.style.position = "absolute";
    host.style.overflow = "scroll";
    host.style.background = "rgb(9, 9, 9)";
    host.style.borderRadius = "3px";
    document.body.appendChild(host);
    const originalStyle = {
      position: host.style.position,
      overflow: host.style.overflow,
      isolation: host.style.isolation,
      background: host.style.background,
      boxShadow: host.style.boxShadow,
      borderRadius: host.style.borderRadius,
    };

    const panel = createPanel(host);
    panel.applyChrome(chrome);

    expect(host.classList.contains("lg")).toBe(true);
    expect(host.style.overflow).toBe("hidden");
    expect(host.style.isolation).toBe("isolate");
    expect(host.style.background).toBe("rgb(1, 2, 3)");
    expect(host.style.borderRadius).toBe("16px");
    const sheen = host.querySelector(":scope > .lg-sheen");
    expect(sheen).toBeTruthy();
    expect(sheen?.getAttribute("aria-hidden")).toBe("true");
    expect(panel.bg).toBeNull();

    const bg = panel.ensureBg();
    expect(bg.classList.contains("lg-bg")).toBe(true);
    expect(host.firstElementChild).toBe(bg);
    expect(panel.ensureBg()).toBe(bg);

    panel.destroy();
    expect(host.classList.contains("lg")).toBe(false);
    expect(host.querySelector(".lg-sheen")).toBeNull();
    expect(host.querySelector(".lg-bg")).toBeNull();
    expect(Array.from(host.children)).toEqual([child]);
    expect({
      position: host.style.position,
      overflow: host.style.overflow,
      isolation: host.style.isolation,
      background: host.style.background,
      boxShadow: host.style.boxShadow,
      borderRadius: host.style.borderRadius,
    }).toEqual(originalStyle);
    host.remove();
  });

  it("keeps a non-static host position and restores a static one", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const panel = createPanel(host);
    expect(host.style.position).toBe("relative");
    panel.destroy();
    expect(host.style.position).toBe("");
    host.remove();
  });

  it("adopts existing .lg-sheen/.lg-bg children (React owns them) and never removes them", () => {
    const host = document.createElement("div");
    const bg = document.createElement("div");
    bg.className = "lg-bg";
    bg.style.opacity = "0.5";
    const sheen = document.createElement("div");
    sheen.className = "lg-sheen";
    host.append(bg, sheen);
    document.body.appendChild(host);

    const panel = createPanel(host);
    panel.applyChrome(chrome);

    expect(panel.sheen).toBe(sheen);
    expect(panel.ensureBg()).toBe(bg);
    expect(host.querySelectorAll(".lg-sheen")).toHaveLength(1);
    expect(host.querySelectorAll(".lg-bg")).toHaveLength(1);
    expect(sheen.style.boxShadow).not.toBe("");

    panel.destroy();
    // Adopted nodes stay in place with their original inline styles restored.
    expect(Array.from(host.children)).toEqual([bg, sheen]);
    expect(sheen.style.cssText).toBe("");
    expect(bg.style.cssText).toBe("opacity: 0.5;");
    host.remove();
  });
});
