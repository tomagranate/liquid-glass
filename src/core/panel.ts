/**
 * panel.ts
 * --------
 * The glass panel's chrome: the `.lg` host (radius/tint/shadow, clipping,
 * stacking) plus its `.lg-sheen` (CSS rim light + directional sheen) and
 * `.lg-bg` (bent background copy) layers. Existing `.lg-sheen`/`.lg-bg`
 * children are ADOPTED (React renders and owns them); missing ones are
 * created. `destroy()` restores every inline style/class this module wrote
 * and removes only the nodes it created.
 */

import { isSafariEngine } from "./filter.js";
import type { GlassMaterial } from "./types.js";

export interface PanelChrome {
  radius: number | string;
  tint: string;
  shadow: string;
  rimLight: number;
  specularAngle: number;
}

export interface Panel {
  readonly host: HTMLElement;
  readonly sheen: HTMLElement;
  /** The background-copy layer, once adopted or created. */
  readonly bg: HTMLElement | null;
  /** Adopt or create the `.lg-bg` layer. */
  ensureBg(): HTMLElement;
  /** Apply the CSS-only material (cheap; no filter/map work). */
  applyChrome(chrome: PanelChrome): void;
  destroy(): void;
}

export const CHROME_DEFAULTS: Required<
  Pick<
    GlassMaterial,
    "radius" | "tint" | "shadow" | "rimLight" | "specularAngle"
  >
> = {
  radius: 16,
  tint: "rgba(255,255,255,0.06)",
  shadow: "0 8px 30px rgba(0,0,0,0.25)",
  rimLight: 0.6,
  specularAngle: 135,
};

function directChildByClass(
  element: HTMLElement,
  className: string,
): HTMLElement | null {
  return (
    Array.from(element.children).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains(className),
    ) ?? null
  );
}

export function createPanel(host: HTMLElement): Panel {
  const originalStyle = {
    position: host.style.position,
    overflow: host.style.overflow,
    isolation: host.style.isolation,
    background: host.style.background,
    boxShadow: host.style.boxShadow,
    borderRadius: host.style.borderRadius,
  };
  // jsdom reports "" for an unstyled element's computed position; treat it
  // like "static" (real browsers always resolve a concrete value).
  const computedPosition = getComputedStyle(host).position;
  const shouldRestorePosition =
    computedPosition === "static" || computedPosition === "";

  const adoptedBg = directChildByClass(host, "lg-bg");
  const adoptedBgCss = adoptedBg?.style.cssText ?? "";
  let bg: HTMLElement | null = adoptedBg;
  // Composited-layer promotion is Safari-only (see liquid-glass.css).
  if (adoptedBg && isSafariEngine()) adoptedBg.classList.add("lg-composited");

  const adoptedSheen = directChildByClass(host, "lg-sheen");
  const adoptedSheenCss = adoptedSheen?.style.cssText ?? "";
  const sheen = adoptedSheen ?? document.createElement("div");
  sheen.classList.add("lg-sheen");
  sheen.setAttribute("aria-hidden", "true");
  if (!adoptedSheen) host.prepend(sheen);

  host.classList.add("lg");
  if (shouldRestorePosition) host.style.position = "relative";
  host.style.overflow = "hidden";
  host.style.isolation = "isolate";

  const panel: Panel = {
    host,
    sheen,
    get bg() {
      return bg;
    },
    ensureBg() {
      if (bg) return bg;
      bg = document.createElement("div");
      bg.classList.add("lg-bg");
      // Composited-layer promotion is Safari-only (see liquid-glass.css).
      if (isSafariEngine()) bg.classList.add("lg-composited");
      bg.setAttribute("aria-hidden", "true");
      host.prepend(bg);
      return bg;
    },
    applyChrome(chrome) {
      host.style.borderRadius =
        typeof chrome.radius === "string"
          ? chrome.radius
          : `${chrome.radius}px`;
      host.style.background = chrome.tint;
      host.style.boxShadow = chrome.shadow;

      const k = chrome.rimLight;
      sheen.style.boxShadow = [
        `inset 0 1px 1.5px rgba(255,255,255,${0.9 * k})`,
        `inset 1px 0 1px rgba(255,255,255,${0.35 * k})`,
        `inset -1px 0 1px rgba(255,255,255,${0.35 * k})`,
        `inset 0 -1.5px 2px rgba(0,0,0,${0.25 * k})`,
        `inset 0 0 0 1px rgba(255,255,255,${0.25 * k})`,
      ].join(", ");
      sheen.style.background = `linear-gradient(${chrome.specularAngle + 90}deg, rgba(255,255,255,${0.18 * k}) 0%, rgba(255,255,255,0) 38%, rgba(255,255,255,0) 64%, rgba(255,255,255,${0.08 * k}) 100%)`;
    },
    destroy() {
      host.classList.remove("lg");
      if (shouldRestorePosition) host.style.position = originalStyle.position;
      host.style.overflow = originalStyle.overflow;
      host.style.isolation = originalStyle.isolation;
      host.style.background = originalStyle.background;
      host.style.boxShadow = originalStyle.boxShadow;
      host.style.borderRadius = originalStyle.borderRadius;

      if (adoptedSheen) sheen.style.cssText = adoptedSheenCss;
      else sheen.remove();

      if (bg) {
        if (adoptedBg) {
          bg.style.cssText = adoptedBgCss;
          bg.classList.remove("lg-composited");
        } else bg.remove();
        bg = adoptedBg;
      }
    },
  };
  return panel;
}
