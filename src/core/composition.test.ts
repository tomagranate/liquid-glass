import { describe, expect, it } from "vitest";
import { backgroundClipPath } from "./composition.js";

describe("background composition", () => {
  it("builds one outer path and seam-expanded holes in lens coordinates", () => {
    expect(
      backgroundClipPath(
        { left: 100, top: 50, right: 200, bottom: 100 },
        [{ left: 90, top: 60, right: 140, bottom: 90 }],
        10,
      ),
    ).toBe("M0 0H120V70H0ZM9.5 19.5H50.5V50.5H9.5Z");
  });

  it("clips intersections and ignores non-overlapping covers", () => {
    const path = backgroundClipPath(
      { left: 0, top: 0, right: 50, bottom: 50 },
      [
        { left: 100, top: 100, right: 120, bottom: 120 },
        { left: 40, top: 40, right: 80, bottom: 80 },
      ],
      0,
    );
    expect(path).toBe("M0 0H50V50H0ZM39.5 39.5H50V50H39.5Z");
  });
});
