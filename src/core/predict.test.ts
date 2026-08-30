import { afterEach, describe, expect, it } from "vitest";
import { predictRect, setPredictionLead, settle } from "./predict.js";

function movingElement() {
  const element = document.createElement("div");
  let left = 0;
  let top = 0;
  element.getBoundingClientRect = () =>
    new DOMRect(left, top, 40, 20) as DOMRect;
  return {
    element,
    move(nextLeft: number, nextTop = top) {
      left = nextLeft;
      top = nextTop;
    },
  };
}

afterEach(() => setPredictionLead(1));

describe("predictRect", () => {
  it("places constant velocity at the next true position", () => {
    const target = movingElement();
    expect(predictRect(target.element, 0).left).toBe(0);

    target.move(10);
    expect(predictRect(target.element, 16.7).left).toBeCloseTo(20, 5);
  });

  it("returns the exact first sample after a pause", () => {
    const target = movingElement();
    target.move(24, 12);
    expect(predictRect(target.element, 200)).toEqual(
      target.element.getBoundingClientRect(),
    );
  });

  it("returns an exact rect when the previous sample is stale", () => {
    const target = movingElement();
    predictRect(target.element, 0);
    target.move(30, -20);

    const rect = predictRect(target.element, 101);
    expect(rect.left).toBe(30);
    expect(rect.top).toBe(-20);
  });

  it("bounds reversal error to one frame of travel", () => {
    const target = movingElement();
    predictRect(target.element, 0);
    target.move(10);
    predictRect(target.element, 16.7);
    target.move(0);

    const rect = predictRect(target.element, 33.4);
    expect(Math.abs(rect.left - 0)).toBeCloseTo(10, 5);
  });

  it("clamps the lead and axis travel", () => {
    const leadTarget = movingElement();
    setPredictionLead(2);
    predictRect(leadTarget.element, 0);
    leadTarget.move(10);
    expect(predictRect(leadTarget.element, 10).left).toBeCloseTo(35.05, 5);

    const travelTarget = movingElement();
    predictRect(travelTarget.element, 0);
    travelTarget.move(1_000, -1_000);
    const rect = predictRect(travelTarget.element, 1);
    expect(rect.left).toBe(1_120);
    expect(rect.top).toBe(-1_120);
  });

  it("returns an exact rect after settle", () => {
    const target = movingElement();
    predictRect(target.element, 0);
    target.move(10);
    predictRect(target.element, 16.7);
    settle(target.element);
    target.move(20);

    expect(predictRect(target.element, 33.4).left).toBe(20);
  });
});
