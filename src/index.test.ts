import { describe, expect, it } from "vitest";
import {
  buildGlassFilter,
  createGlassMedia,
  createGlassRegion,
  createMediaSurface,
  createGlassScope,
  createSurface,
  generateDisplacementMap,
  glass,
  glassOverMedia,
  glassOverPage,
  glassOverRegion,
  glassOverWallpaper,
  moveFilterLens,
  setBackground,
  WebGLGlass,
} from "./index.js";

describe("public API", () => {
  it("exports the vanilla surface × lens API", () => {
    expect(glass).toBeTypeOf("function");
    expect(glassOverPage).toBeTypeOf("function");
    expect(glassOverRegion).toBeTypeOf("function");
    expect(glassOverMedia).toBeTypeOf("function");
    expect(glassOverWallpaper).toBeTypeOf("function");
    expect(createGlassRegion).toBeTypeOf("function");
    expect(createGlassMedia).toBeTypeOf("function");
    expect(createSurface).toBeTypeOf("function");
    expect(createMediaSurface).toBeTypeOf("function");
    expect(createGlassScope).toBeTypeOf("function");
    expect(setBackground).toBeTypeOf("function");
  });

  it("exports the low-level building blocks", () => {
    expect(generateDisplacementMap).toBeTypeOf("function");
    expect(buildGlassFilter).toBeTypeOf("function");
    expect(moveFilterLens).toBeTypeOf("function");
    expect(WebGLGlass).toBeTypeOf("function");
  });
});
