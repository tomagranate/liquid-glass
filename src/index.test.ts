import { describe, expect, it } from "vitest";
import {
  applyGlass,
  buildGlassFilter,
  createGlassController,
  GlassCompositor,
  GlassFieldGL,
  GlassStage,
  generateDisplacementMap,
  useGlassLens,
  useGlassStage,
  WebGLGlass,
} from "./index.js";

describe("public API", () => {
  it("exports the React kit", () => {
    expect(GlassStage).toBeTypeOf("function");
    expect(useGlassLens).toBeTypeOf("function");
    expect(useGlassStage).toBeTypeOf("function");
  });

  it("exports the core engine (SVG + WebGL renderers)", () => {
    expect(applyGlass).toBeTypeOf("function");
    expect(createGlassController).toBeTypeOf("function");
    expect(generateDisplacementMap).toBeTypeOf("function");
    expect(buildGlassFilter).toBeTypeOf("function");
    expect(GlassFieldGL).toBeTypeOf("function");
    expect(GlassCompositor).toBeTypeOf("function");
    expect(WebGLGlass).toBeTypeOf("function");
  });
});
