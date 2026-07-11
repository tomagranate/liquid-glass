/**
 * surfaces.ts
 * -----------
 * Content surfaces: live DOM subtrees registered as refraction sources.
 * A surface carries ONE shared SVG filter with one movable sub-lens per
 * overlapping glass panel — pixels bend in place and stay selectable and
 * clickable. Includes the Safari countermeasures: epsilon-flush after
 * feImage mutation (coalesced per rAF), fresh filter ids per rebuild, the
 * scroller structure warning, and the filter-region size budget that
 * degrades oversized surfaces to the native `backdrop-filter` tier.
 */

import "./liquid-glass.css";
import {
  type BackgroundSubscriber,
  paintBackground,
  subscribeBackground,
} from "./background.js";
import {
  buildGlassFilter,
  filterReach,
  getDefs,
  isSafariEngine,
  moveFilterLens,
  nextId,
} from "./filter.js";
import { notifyGeometry } from "./geometry.js";
import { generateDisplacementMap } from "./map.js";
import type {
  ResolvedLensMaterial,
  SubLens,
  SurfaceHandle,
  SurfaceOptions,
} from "./types.js";

/** Conservative Safari filter-region buffer budget, device px (see ARCHITECTURE). */
export const SAFARI_FILTER_BUDGET = 2048;

export { isSafariEngine };

export function setWebkitFilter(el: HTMLElement, value: string): void {
  el.style.filter = value;
  el.style.setProperty("-webkit-filter", value);
}

function filterValue(id: string, epsilon: boolean): string {
  return epsilon ? `url(#${id}) brightness(1.0001)` : `url(#${id})`;
}

function isScrollableOverflow(value: string): boolean {
  return value === "auto" || value === "scroll" || value === "overlay";
}

function warnIfSurfaceScrolls(surface: HTMLElement): void {
  const style = getComputedStyle(surface);
  if (
    isScrollableOverflow(style.overflowX) ||
    isScrollableOverflow(style.overflowY)
  ) {
    console.warn(
      "liquid-glass: content surfaces must wrap scrollers; do not put scrollable overflow on the filtered surface element.",
    );
  }
}

export interface LensBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Attachment {
  id: string;
  rect: LensBox;
  material: ResolvedLensMaterial;
  mapUrl: string | null;
  mapSig: string;
}

const shapeSig = (rect: LensBox, m: ResolvedLensMaterial): string =>
  [
    rect.width,
    rect.height,
    m.radius,
    m.depth,
    m.scale,
    m.blur,
    m.chroma,
    m.specular,
    m.specularAngle,
    m.dpr,
  ].join("|");

const registry = new Set<ContentSurface>();

/** Every live registered content surface. */
export function listContentSurfaces(): ContentSurface[] {
  return Array.from(registry);
}

export class ContentSurface implements SurfaceHandle {
  readonly kind = "content" as const;
  readonly element: HTMLElement;
  destroyed = false;
  /** Safari over-budget degrade: no SVG filter; lenses use backdrop-filter. */
  nativeTier = false;
  /** Whether auto-routed lenses outside the local DOM island should consider it. */
  readonly routesGlobally: boolean;

  private readonly options: SurfaceOptions;
  private readonly attachments = new Map<object, Attachment>();
  private filterEl: SVGFilterElement | null = null;
  private filterId: string | null = null;
  private readonly originalFilter: string;
  private readonly originalWebkitFilter: string;
  private epsilonFlip = false;
  private flushRaf = 0;
  private warnedBudget = false;

  private bgEl: HTMLElement | null = null;
  private createdBg = false;
  private bgOriginalCss = "";
  private bgSubscriber: BackgroundSubscriber | null = null;
  private unsubscribeBg: (() => void) | null = null;

  constructor(element: HTMLElement, options: SurfaceOptions) {
    this.element = element;
    this.options = options;
    this.originalFilter = element.style.filter;
    this.originalWebkitFilter =
      element.style.getPropertyValue("-webkit-filter");
    this.routesGlobally =
      options.routing === "global" ||
      (options.routing !== "local" && Boolean(options.background));

    element.classList.add("lgs-surface");
    // Composited-layer promotion is Safari-only (see liquid-glass.css).
    if (isSafariEngine()) element.classList.add("lg-composited");
    warnIfSurfaceScrolls(element);
    this.setupBackground();
    registry.add(this);
    // Let already-mounted lenses discover and route to this surface.
    notifyGeometry("resize");
  }

  private setupBackground(): void {
    const background = this.options.background;
    if (!background) return;
    const existing = Array.from(this.element.children).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains("lgs-bg"),
    );
    this.bgEl = existing ?? document.createElement("div");
    this.createdBg = !existing;
    this.bgOriginalCss = existing?.style.cssText ?? "";
    this.bgEl.classList.add("lgs-bg");
    this.bgEl.setAttribute("aria-hidden", "true");
    if (this.createdBg) this.element.prepend(this.bgEl);
    this.bgSubscriber = {
      element: this.bgEl,
      override: () => (typeof background === "string" ? background : null),
    };
    this.unsubscribeBg = subscribeBackground(this.bgSubscriber);
  }

  /**
   * Register/update a lens over this surface. `key` is the caller's identity
   * for the registration; `rect` is the lens box in surface space. A pure
   * x/y move retargets the existing feImage; anything else rebuilds the
   * shared filter with a fresh id (Safari cache defeat).
   */
  attachLens(
    key: object,
    rect: LensBox,
    material: ResolvedLensMaterial,
    force = false,
  ): void {
    if (this.destroyed) return;
    const existing = this.attachments.get(key);
    if (!existing) {
      this.attachments.set(key, {
        id: nextId(),
        rect,
        material,
        mapUrl: null,
        mapSig: "",
      });
      this.rebuild(force);
      return;
    }

    const changedShape =
      shapeSig(existing.rect, existing.material) !== shapeSig(rect, material);
    const moved = existing.rect.x !== rect.x || existing.rect.y !== rect.y;
    existing.rect = rect;
    existing.material = material;
    if (force || changedShape) {
      this.rebuild(force);
    } else if (moved && this.filterEl) {
      moveFilterLens(this.filterEl, existing.id, rect.x, rect.y);
      this.flushSafariFilterMutation();
    }
  }

  detachLens(key: object): void {
    if (!this.attachments.delete(key)) return;
    if (this.destroyed) return;
    if (this.attachments.size) this.rebuild(false);
    else this.clearFilter();
  }

  hasLens(key: object): boolean {
    return this.attachments.has(key);
  }

  /** Rebuild the shared filter (fresh id) from the current attachments. */
  private rebuild(force: boolean): void {
    if (this.destroyed) return;
    if (!this.attachments.size) {
      this.clearFilter();
      return;
    }
    const surfaceRect = this.element.getBoundingClientRect();
    const sourceWidth = Math.round(surfaceRect.width);
    const sourceHeight = Math.round(surfaceRect.height);
    if (sourceWidth < 2 || sourceHeight < 2) {
      this.clearFilter();
      return;
    }

    const attachments = Array.from(this.attachments.values());
    // Per-lens strength on a shared chain: the chain runs at the strongest
    // lens's scale; weaker lenses bake scale/chainScale into their maps.
    const chainScale = Math.max(...attachments.map((a) => a.material.scale));
    // blur/chroma are per-surface (max of lenses) — documented limitation.
    // A small blur floor antialiases displaced text (feDisplacementMap
    // samples nearest-neighbour, so sharp glyphs alias badly through the bend).
    const blur = Math.max(0.4, ...attachments.map((a) => a.material.blur));
    const chroma = Math.max(...attachments.map((a) => a.material.chroma));
    const specular = Math.max(...attachments.map((a) => a.material.specular));

    if (
      !this.checkSafariBudget(
        sourceWidth,
        sourceHeight,
        chainScale,
        blur,
        chroma,
      )
    ) {
      return;
    }

    const lenses: SubLens[] = [];
    for (const a of attachments) {
      const amplitude = chainScale > 0 ? a.material.scale / chainScale : 1;
      const mapSig = [
        a.rect.width,
        a.rect.height,
        a.material.radius,
        a.material.depth,
        a.material.specular,
        a.material.specularAngle,
        a.material.dpr,
        amplitude,
      ].join("|");
      if (force || !a.mapUrl || a.mapSig !== mapSig) {
        a.mapUrl = generateDisplacementMap({
          width: a.rect.width,
          height: a.rect.height,
          radius: a.material.radius,
          depth: a.material.depth,
          dpr: a.material.dpr,
          specular: a.material.specular,
          specularAngle: a.material.specularAngle,
          amplitude,
          inset: 1,
          maskAlpha: true,
        });
        a.mapSig = mapSig;
      }
      if (a.mapUrl) {
        lenses.push({
          id: a.id,
          x: a.rect.x,
          y: a.rect.y,
          width: a.rect.width,
          height: a.rect.height,
          mapUrl: a.mapUrl,
        });
      }
    }
    if (!lenses.length) {
      this.clearFilter();
      return;
    }

    const id = nextId();
    const filter = buildGlassFilter({
      id,
      lenses,
      scale: chainScale,
      blur,
      chroma,
      specular,
      source: { width: sourceWidth, height: sourceHeight },
    });
    getDefs().appendChild(filter);
    this.filterEl?.remove();
    this.filterEl = filter;
    this.filterId = id;
    this.epsilonFlip = false;
    setWebkitFilter(this.element, filterValue(id, false));
  }

  /**
   * Safari filter-region buffer budget (rule 5). Returns false when the
   * surface entered the native tier (filter removed; lenses over it show a
   * `backdrop-filter` background instead).
   */
  private checkSafariBudget(
    sourceWidth: number,
    sourceHeight: number,
    scale: number,
    blur: number,
    chroma: number,
  ): boolean {
    if (!isSafariEngine()) return true;
    const reach = filterReach(scale, blur, chroma);
    const dpr = window.devicePixelRatio || 1;
    const budgetX = (sourceWidth + 2 * reach) * dpr;
    const budgetY = (sourceHeight + 2 * reach) * dpr;
    const overBudget =
      budgetX > SAFARI_FILTER_BUDGET || budgetY > SAFARI_FILTER_BUDGET;
    if (overBudget && !this.nativeTier) {
      this.nativeTier = true;
      this.clearFilter();
      if (!this.warnedBudget) {
        this.warnedBudget = true;
        console.warn(
          `liquid-glass: content surface exceeds the Safari filter budget (${Math.round(budgetX)}x${Math.round(budgetY)} device px > ${SAFARI_FILTER_BUDGET}); degrading to native backdrop-filter for lenses over it.`,
        );
      }
      this.notifyTierChange();
    } else if (!overBudget && this.nativeTier) {
      this.nativeTier = false;
      this.notifyTierChange();
    }
    if (this.nativeTier) {
      this.clearFilter();
      return false;
    }
    return true;
  }

  private notifyTierChange(): void {
    // Re-route lenses outside the current sync pass.
    queueMicrotask(() => {
      if (!this.destroyed) notifyGeometry("resize");
    });
  }

  /** Safari flakes on bare feImage x/y mutation: alternate the CSS filter
   *  string with an epsilon brightness() term, coalesced per rAF (rule 3). */
  private flushSafariFilterMutation(): void {
    if (!isSafariEngine() || !this.filterId || this.flushRaf) return;
    const flush = () => {
      this.flushRaf = 0;
      if (!this.filterId || this.destroyed) return;
      this.epsilonFlip = !this.epsilonFlip;
      setWebkitFilter(
        this.element,
        filterValue(this.filterId, this.epsilonFlip),
      );
    };
    if (typeof requestAnimationFrame === "function") {
      this.flushRaf = requestAnimationFrame(flush);
    } else {
      flush();
    }
  }

  private clearFilter(): void {
    if (this.flushRaf && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.flushRaf);
      this.flushRaf = 0;
    }
    this.filterEl?.remove();
    this.filterEl = null;
    this.filterId = null;
    this.epsilonFlip = false;
    this.element.style.filter = this.originalFilter;
    this.element.style.setProperty("-webkit-filter", this.originalWebkitFilter);
  }

  refresh(): void {
    if (this.destroyed) return;
    if (this.bgSubscriber) paintBackground(this.bgSubscriber);
    if (this.attachments.size) this.rebuild(true);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    registry.delete(this);
    this.attachments.clear();
    this.clearFilter();
    this.element.classList.remove("lgs-surface", "lg-composited");
    this.unsubscribeBg?.();
    this.unsubscribeBg = null;
    if (this.bgEl) {
      if (this.createdBg) this.bgEl.remove();
      else this.bgEl.style.cssText = this.bgOriginalCss;
      this.bgEl = null;
    }
    // Overlapping lenses fall back to the background-copy path.
    notifyGeometry("resize");
  }
}

/** Register a live DOM subtree as a refraction source for glass lenses. */
export function createSurface(
  element: HTMLElement,
  options: SurfaceOptions = {},
): SurfaceHandle {
  return new ContentSurface(element, options);
}
