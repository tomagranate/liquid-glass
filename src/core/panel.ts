/**
 * panel.ts
 * --------
 * The glass panel's chrome: the `.lg` host (radius/clipping/stacking), its
 * `.lg-sheen` (CSS rim light + directional sheen), `.lg-bg` (bent background
 * copy), and optional core-owned `.lg-chrome` (backdrop-tier tint/shadow)
 * layers. Existing `.lg-sheen`/`.lg-bg` children are ADOPTED (React renders
 * and owns them); missing ones are created. `destroy()` restores every inline
 * style/class this module wrote and removes only the nodes it created.
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
  /** Create the core-owned tint/shadow layer immediately above `.lg-bg`. */
  ensureChromeLayer(): HTMLElement;
  /** Remove the core-owned tint/shadow layer, if present. */
  removeChromeLayer(): void;
  /** Create the native-tier rim-frost layer immediately above `.lg-bg`. */
  ensureFrostLayer(): HTMLElement;
  /** Remove the rim-frost layer, if present. */
  removeFrostLayer(): void;
  /**
   * Apply the CSS-only material (cheap; no filter/map work). `frost` is the
   * native-tier variant: with no refraction to sell the material, the sheen
   * gains a radial dome highlight and a floor on the rim strength.
   */
  applyChrome(
    chrome: PanelChrome,
    carrier?: "host" | "layer",
    frost?: boolean,
  ): void;
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
  let chromeLayer: HTMLElement | null = null;
  let frostLayer: HTMLElement | null = null;
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
    ensureChromeLayer() {
      if (chromeLayer) return chromeLayer;
      chromeLayer = document.createElement("div");
      chromeLayer.classList.add("lg-chrome");
      chromeLayer.setAttribute("aria-hidden", "true");
      if (bg) bg.after(chromeLayer);
      else host.prepend(chromeLayer);
      return chromeLayer;
    },
    removeChromeLayer() {
      chromeLayer?.remove();
      chromeLayer = null;
    },
    ensureFrostLayer() {
      if (frostLayer) return frostLayer;
      frostLayer = document.createElement("div");
      frostLayer.classList.add("lg-frost");
      frostLayer.setAttribute("aria-hidden", "true");
      if (bg) bg.after(frostLayer);
      else host.prepend(frostLayer);
      return frostLayer;
    },
    removeFrostLayer() {
      frostLayer?.remove();
      frostLayer = null;
    },
    applyChrome(chrome, carrier = "host", frost = false) {
      host.style.borderRadius =
        typeof chrome.radius === "string"
          ? chrome.radius
          : `${chrome.radius}px`;
      if (carrier === "layer") {
        const layer = panel.ensureChromeLayer();
        host.style.background = "none";
        host.style.boxShadow = "none";
        layer.style.background = chrome.tint;
        layer.style.boxShadow = chrome.shadow;
      } else {
        panel.removeChromeLayer();
        host.style.background = chrome.tint;
        host.style.boxShadow = chrome.shadow;
      }

      // Frost floors the rim strength (an explicit rimLight: 0 still wins —
      // the consumer asked for no rim) so the degrade tier keeps a glass edge.
      const k =
        frost && chrome.rimLight > 0
          ? Math.max(chrome.rimLight, 0.95)
          : chrome.rimLight;
      sheen.style.boxShadow = [
        `inset 0 1px 1.5px rgba(255,255,255,${0.9 * k})`,
        `inset 1px 0 1px rgba(255,255,255,${0.35 * k})`,
        `inset -1px 0 1px rgba(255,255,255,${0.35 * k})`,
        `inset 0 -1.5px 2px rgba(0,0,0,${0.25 * k})`,
        `inset 0 0 0 1px rgba(255,255,255,${0.25 * k})`,
      ].join(", ");
      const directional = `linear-gradient(${chrome.specularAngle + 90}deg, rgba(255,255,255,${0.18 * k}) 0%, rgba(255,255,255,0) 38%, rgba(255,255,255,0) 64%, rgba(255,255,255,${0.08 * k}) 100%)`;
      // The dome highlight fakes the curvature the missing refraction would
      // otherwise convey; on refractive tiers it would fight the real bend
      // and the baked specular, so it is frost-only.
      sheen.style.background = frost
        ? `radial-gradient(120% 90% at 50% -30%, rgba(255,255,255,${0.2 * k}) 0%, rgba(255,255,255,0) 55%), ${directional}`
        : directional;
    },
    destroy() {
      panel.removeChromeLayer();
      panel.removeFrostLayer();
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
