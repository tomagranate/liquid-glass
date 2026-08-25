import assert from "node:assert/strict";
import test from "node:test";
import { clickAndWaitForInteraction } from "./interaction-wait.mjs";

function fixture({ dispatch = true } = {}) {
  let count = 0;
  let clicks = 0;
  const driver = {
    async executeScript(script) {
      return script.includes("elementFromPoint")
        ? {
            resultCount: count,
            startCount: dispatch ? count : 0,
            centerTarget: "interaction",
            hidden: false,
            focused: true,
          }
        : count;
    },
    async wait(condition, _timeout, message) {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (await condition()) return true;
      }
      throw new Error(message);
    },
  };
  const element = {
    async click() {
      clicks++;
      if (dispatch) count++;
    },
    async isDisplayed() {
      return true;
    },
    async isEnabled() {
      return true;
    },
    async getRect() {
      return { x: 10, y: 20, width: 100, height: 40 };
    },
  };
  return {
    driver,
    element,
    get clicks() {
      return clicks;
    },
  };
}

test("uses one native click and waits for the expected interaction count", async () => {
  const state = fixture();
  await clickAndWaitForInteraction(state.driver, state.element, 1, 10);
  assert.equal(state.clicks, 1);
});

test("fails with element and sample diagnostics when native click does not dispatch", async () => {
  const state = fixture({ dispatch: false });
  await assert.rejects(
    clickAndWaitForInteraction(state.driver, state.element, 1, 10),
    /displayed.*true.*enabled.*true.*rect.*width.*100.*resultCount.*0.*centerTarget.*interaction/,
  );
  assert.equal(state.clicks, 1);
});
