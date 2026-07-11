import { describe, expect, it } from "vitest";
import {
  buildGlassFilter,
  createMediaSurface,
  createSurface,
  generateDisplacementMap,
  glass,
  moveFilterLens,
  setBackground,
  WebGLGlass,
} from "./index.js";

describe("public API", () => {
  it("exports the vanilla surface × lens API", () => {
    expect(glass).toBeTypeOf("function");
    expect(createSurface).toBeTypeOf("function");
    expect(createMediaSurface).toBeTypeOf("function");
    expect(setBackground).toBeTypeOf("function");
  });

  it("exports the low-level building blocks", () => {
    expect(generateDisplacementMap).toBeTypeOf("function");
    expect(buildGlassFilter).toBeTypeOf("function");
    expect(moveFilterLens).toBeTypeOf("function");
    expect(WebGLGlass).toBeTypeOf("function");
  });
});
