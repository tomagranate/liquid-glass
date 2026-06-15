import { describe, expect, it } from "vitest";
import {
  applyGlass,
  buildGlassFilter,
  createGlassController,
  GlassButton,
  GlassCompositor,
  GlassFieldGL,
  GlassSlider,
  GlassStage,
  GlassSwitch,
  GlassToggleGroup,
  generateDisplacementMap,
  Magnifier,
  useGlassLens,
  useGlassStage,
  WebGLGlass,
} from "./index.js";

describe("public API", () => {
  it("exports the React components", () => {
    expect(GlassStage).toBeTypeOf("function");
    expect(GlassButton).toBeTypeOf("function");
    expect(GlassSwitch).toBeTypeOf("function");
    expect(GlassSlider).toBeTypeOf("function");
    expect(GlassToggleGroup).toBeTypeOf("function");
    expect(Magnifier).toBeTypeOf("function");
  });

  it("exports the hooks", () => {
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
