export const INTERACTION_WAIT_TIMEOUT_MS = 2_000;

async function interactionDiagnostics(driver, element) {
  const [displayed, enabled, rect, pageState] = await Promise.all([
    element.isDisplayed().catch((error) => `error: ${error.message}`),
    element.isEnabled().catch((error) => `error: ${error.message}`),
    element.getRect().catch((error) => ({ error: error.message })),
    driver
      .executeScript(
        `const element=arguments[0]; const rect=element.getBoundingClientRect();
         const top=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
         return {
           resultCount: window.__liquidGlassPerf?.interactionResults?.length ?? -1,
           startCount: window.__liquidGlassPerf?.interactionStarts ?? -1,
           centerTarget: top?.id || top?.className || top?.tagName || null,
           hidden: document.hidden,
           focused: document.hasFocus(),
         };`,
        element,
      )
      .catch((error) => `error: ${error.message}`),
  ]);
  return { displayed, enabled, rect, pageState };
}

export async function clickAndWaitForInteraction(
  driver,
  element,
  expectedCount,
  timeout = INTERACTION_WAIT_TIMEOUT_MS,
) {
  try {
    await element.click();
    await driver.wait(
      async () => {
        const count = await driver.executeScript(
          "return window.__liquidGlassPerf?.interactionResults?.length ?? -1",
        );
        return count >= expectedCount;
      },
      timeout,
      `native click did not produce interaction sample ${expectedCount}`,
      20,
    );
  } catch (error) {
    const diagnostics = await interactionDiagnostics(driver, element);
    throw new Error(
      `Native WebDriver click failed to produce interaction sample ${expectedCount} within ${timeout}ms; diagnostics=${JSON.stringify(diagnostics)}; cause=${error.message}`,
      { cause: error },
    );
  }
}
