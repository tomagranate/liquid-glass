import { describe, expect, it } from "vitest";
import {
  applyGlass,
  buildGlassFilter,
  createGlassController,
  getPredictionLead,
  generateDisplacementMap,
  predictRect,
  setPredictionLead,
  settle,
  useGlass,
  useGlassTexture,
  WebGLGlass,
} from "./index.js";

describe("public API", () => {
  it("exports the React bindings", () => {
    expect(useGlass).toBeTypeOf("function");
    expect(useGlassTexture).toBeTypeOf("function");
  });

  it("exports the SVG `feDisplacementMap` engine", () => {
    expect(applyGlass).toBeTypeOf("function");
    expect(createGlassController).toBeTypeOf("function");
    expect(generateDisplacementMap).toBeTypeOf("function");
    expect(buildGlassFilter).toBeTypeOf("function");
    expect(predictRect).toBeTypeOf("function");
    expect(settle).toBeTypeOf("function");
    expect(setPredictionLead).toBeTypeOf("function");
    expect(getPredictionLead).toBeTypeOf("function");
  });

  it("exports the WebGL texture backend", () => {
    expect(WebGLGlass).toBeTypeOf("function");
  });
});
