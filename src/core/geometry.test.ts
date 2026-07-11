import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getGeometryRect,
  notifyGeometry,
  subscribeGeometry,
  subscribeScrollGeometry,
} from "./geometry.js";

describe("geometry invalidation", () => {
  let rafQueue: FrameRequestCallback[] = [];
  const flushRaf = (): void => {
    const q = rafQueue;
    rafQueue = [];
    for (const cb of q) cb(0);
  };

  beforeEach(() => {
    rafQueue = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("coalesces multiple scroll events into one animation-frame broadcast", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeGeometry((kind) => seen.push(kind));

    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));

    expect(seen).toEqual([]);
    expect(rafQueue).toHaveLength(1);

    flushRaf();
    expect(seen).toEqual(["scroll"]);

    unsubscribe();
  });

  it("runs immediate scroll subscribers before the coalesced broadcast", () => {
    const seen: string[] = [];
    const unsubscribeSync = subscribeScrollGeometry(() => seen.push("sync"));
    const unsubscribe = subscribeGeometry((kind) => seen.push(kind));

    window.dispatchEvent(new Event("scroll"));

    expect(seen).toEqual(["sync"]);
    flushRaf();
    expect(seen).toEqual(["sync", "scroll"]);

    unsubscribe();
    unsubscribeSync();
  });

  it("caches element rects within one geometry broadcast", () => {
    const el = document.createElement("div");
    const rect = {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 10,
      height: 20,
      right: 10,
      bottom: 20,
      toJSON: () => ({}),
    } as DOMRect;
    const spy = vi.spyOn(el, "getBoundingClientRect").mockReturnValue(rect);
    const unsubscribe = subscribeGeometry(() => {
      expect(getGeometryRect(el)).toBe(rect);
      expect(getGeometryRect(el)).toBe(rect);
    });

    notifyGeometry("resize");
    expect(spy).toHaveBeenCalledTimes(1);

    getGeometryRect(el);
    expect(spy).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
