import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { By } from "selenium-webdriver";
import { startStaticServer } from "./lib/static-server.mjs";
import { createBrandedDriver, assertBrand } from "./lib/webdriver.mjs";
import { compareRoi, renderRoiDiff } from "./lib/png-proof.mjs";
import {
  evaluateInteractions,
  evaluatePair,
  medianRun,
  summarize,
} from "./lib/perf-analysis.mjs";
import { scenarioMotionMode } from "../tests/perf/motion-policy.js";
import { verifyPerfBuild } from "./lib/perf-build.mjs";
import { clickAndWaitForInteraction } from "./lib/interaction-wait.mjs";
import { assertRenderPreflight } from "./lib/render-preflight.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const browser = args.browser || "chrome";
const quick = args.quick === "true";
const negative = args.negative || "";
const root = resolve(import.meta.dirname, "..");
const artifactRoot = resolve(
  args.artifacts || join(root, "artifacts/performance", browser),
);
await mkdir(artifactRoot, { recursive: true });
const allScenarios = JSON.parse(
  await readFile(join(root, "tests/perf/scenarios.json"), "utf8"),
);
const scenarios = args.scenarios ? args.scenarios.split(",") : allScenarios;
const thresholdFile = JSON.parse(
  await readFile(join(root, `tests/perf/thresholds/${browser}.json`), "utf8"),
);
const thresholds = {
  ...thresholdFile.defaults,
  minFrames: quick
    ? thresholdFile.defaults.minFramesQuick
    : thresholdFile.defaults.minFramesFull,
};
const frames = Number(args.frames || (quick ? 90 : 600));
const repetitions = Number(args.repetitions || (quick ? 3 : 5));
const summary = {
  browser,
  quick,
  frames,
  repetitions,
  provisionalThresholds: true,
  scenarios: [],
  failures: [],
};
const samples = [];
let driver;
let service;
let server;
let environment = {
  browserRequested: browser,
  viewport: { width: 1280, height: 900 },
  driver: "W3C WebDriver",
};
let driverLog = "";
const displayGuard =
  process.platform === "darwin"
    ? spawn("/usr/bin/caffeinate", ["-d", "-i", "-w", String(process.pid)], {
        stdio: "ignore",
      })
    : null;

const executeAsync = (method, value) =>
  driver
    .executeAsyncScript(
      `const done=arguments[arguments.length-1]; Promise.resolve(window.__liquidGlassPerf[${JSON.stringify(method)}](arguments[0])).then(done, e=>done({__error:String(e&&e.stack||e)}));`,
      value,
    )
    .then((result) => {
      if (result?.__error) throw new Error(result.__error);
      return result;
    });

async function screenshot(name) {
  const base64 = await driver.takeScreenshot();
  await writeFile(join(artifactRoot, name), Buffer.from(base64, "base64"));
  return base64;
}

async function browserLogs() {
  try {
    return JSON.stringify(await driver.manage().logs().get("browser"), null, 2);
  } catch (error) {
    return `Browser log endpoint unavailable: ${error.message}`;
  }
}

try {
  await verifyPerfBuild(root);
  server = await startStaticServer(join(root, "dist/perf"));
  ({ driver, service } = await createBrandedDriver(browser));
  environment = {
    ...environment,
    ...(await assertBrand(driver, browser)),
    os: `${process.platform} ${process.arch}`,
  };
  await driver
    .manage()
    .window()
    .setRect({ width: 1280, height: 900, x: 0, y: 0 });
  await driver.get(server.url);
  await driver.wait(
    async () =>
      driver.executeScript("return Boolean(window.__liquidGlassPerf?.ready)"),
    15_000,
  );
  environment.renderPreflight = await assertRenderPreflight(driver, browser);
  environment.dpr = await driver.executeScript("return devicePixelRatio");
  environment.viewport = await driver.manage().window().getRect();

  for (const scenario of scenarios) {
    const scenarioThresholds = {
      ...thresholds,
      ...(thresholdFile.scenarios?.[scenario] || {}),
    };
    const effectProofRun = await executeAsync("runFrames", {
      scenario,
      effect: true,
      frames: 20,
    });
    if (negative === "blank")
      await driver.executeScript(
        "document.querySelectorAll('.perf-lens').forEach(e=>e.remove())",
      );
    const effectSnapshot =
      (await driver.executeScript(
        "return window.__liquidGlassPerf.snapshot()",
      )) || effectProofRun;
    const effectPng = await screenshot(`${scenario}-effect.png`);
    const actual = effectSnapshot.backends || [];
    const expected = effectSnapshot.expectedBackends || [];
    if (
      !effectSnapshot.roi ||
      !actual.length ||
      !actual.some((item) => expected.includes(item))
    ) {
      throw new Error(
        `${scenario}: backend/output correctness failed; actual=${actual.join(",")} expected family=${expected.join(",")}`,
      );
    }
    if (
      actual.includes("native") &&
      !effectProofRun.diagnostics?.policy?.some(
        (decision) =>
          decision.backend === "native" &&
          decision.reason !== "within-provisional-budget",
      )
    ) {
      throw new Error(
        `${scenario}: native fallback lacked a public policy reason`,
      );
    }
    if (scenario !== "idle-teardown" && effectProofRun.motion < 1)
      throw new Error(`${scenario}: motion proof failed`);
    const motionMode = scenarioMotionMode(scenario);
    if (
      motionMode === "scroll" &&
      (effectProofRun.scrollDistance <= 0 ||
        effectProofRun.manualGeometryChanged !== 0)
    ) {
      throw new Error(
        `${scenario}: scroll architecture invariant failed (distance=${effectProofRun.scrollDistance}, manualGeometryChanged=${effectProofRun.manualGeometryChanged})`,
      );
    }
    if (
      motionMode === "moving-lens" &&
      effectProofRun.manualGeometryChanged <= 0
    ) {
      throw new Error(`${scenario}: moving lens did not notify geometry`);
    }
    if (
      scenario === "idle-teardown" &&
      (effectProofRun.diagnostics?.geometryRafCallbacks !== 0 ||
        effectProofRun.diagnostics?.mediaRafCallbacks !== 0)
    ) {
      throw new Error(`${scenario}: idle library rAF invariant failed`);
    }
    const pageErrors = await driver.executeScript(
      "return window.__liquidGlassPerf.pageErrors",
    );
    if (pageErrors.length)
      throw new Error(
        `${scenario}: page errors before timing: ${pageErrors.join(" | ")}`,
      );

    await executeAsync("runFrames", { scenario, effect: false, frames: 20 });
    const controlPng = await screenshot(`${scenario}-control.png`);
    const screenshotDpr = await driver.executeScript("return devicePixelRatio");
    const proofRoi = Object.fromEntries(
      Object.entries(effectSnapshot.roi).map(([key, value]) => [
        key,
        value * screenshotDpr,
      ]),
    );
    const proof = compareRoi(effectPng, controlPng, proofRoi);
    await writeFile(
      join(artifactRoot, `${scenario}-roi.json`),
      JSON.stringify(proof, null, 2),
    );
    await writeFile(
      join(artifactRoot, `${scenario}-roi-diff.png`),
      renderRoiDiff(effectPng, controlPng, proofRoi),
    );
    if (!proof.pass)
      throw new Error(
        `${scenario}: lens ROI visual proof failed ${JSON.stringify(proof)}`,
      );

    await executeAsync("mount", { scenario, effect: true });
    const resetInteractionCount = await executeAsync("resetInteractions");
    if (resetInteractionCount !== 0)
      throw new Error(
        `${scenario}: interaction fixture reset returned ${resetInteractionCount}`,
      );
    const interactionElement = await driver.findElement(By.id("interaction"));
    for (let interaction = 0; interaction < 5; interaction++) {
      await clickAndWaitForInteraction(
        driver,
        interactionElement,
        interaction + 1,
      );
    }
    await executeAsync("settle");
    const interactions = await driver.executeScript(
      "return window.__liquidGlassPerf.interactionResults",
    );
    const interactionEvaluation = evaluateInteractions(
      interactions,
      scenarioThresholds,
    );

    const effectRuns = [];
    const controlRuns = [];
    for (let repetition = 0; repetition < repetitions; repetition++) {
      const order = repetition % 2 ? [true, false] : [false, true];
      for (const effect of order) {
        for (let warmup = 0; warmup < 2; warmup++)
          await executeAsync("runFrames", { scenario, effect, frames: 20 });
        const raw = await executeAsync("runFrames", {
          scenario,
          effect,
          frames,
          injectWork: negative === "timing" && effect ? 40 : 0,
        });
        const metrics = summarize(raw.deltas, raw.calibratedInterval);
        const entry = {
          scenario,
          effect,
          repetition,
          calibratedInterval: raw.calibratedInterval,
          metrics,
          deltas: raw.deltas,
          diagnostics: raw.diagnostics,
          motion: raw.motion,
          scrollDistance: raw.scrollDistance,
          manualGeometryChanged: raw.manualGeometryChanged,
          mountReady: raw.mountReady,
          mountSecondPaint: raw.mountSecondPaint,
          dpr: await driver.executeScript("return devicePixelRatio"),
        };
        samples.push(entry);
        (effect ? effectRuns : controlRuns).push(metrics);
      }
    }
    let effect = medianRun(effectRuns);
    let control = medianRun(controlRuns);
    let evaluation = evaluatePair(effect, control, scenarioThresholds);
    // One retry is allowed only when the control itself proves the host was
    // unhealthy. Correctness/backend/visual failures above are never retried.
    if (!evaluation.pass && control.p95 > scenarioThresholds.maxP95) {
      const retryControlRaw = await executeAsync("runFrames", {
        scenario,
        effect: false,
        frames,
      });
      const retryEffectRaw = await executeAsync("runFrames", {
        scenario,
        effect: true,
        frames,
        injectWork: negative === "timing" ? 40 : 0,
      });
      const retryControl = summarize(
        retryControlRaw.deltas,
        retryControlRaw.calibratedInterval,
      );
      const retryEffect = summarize(
        retryEffectRaw.deltas,
        retryEffectRaw.calibratedInterval,
      );
      samples.push({
        scenario,
        effect: false,
        hostHealthRetry: true,
        metrics: retryControl,
        deltas: retryControlRaw.deltas,
      });
      samples.push({
        scenario,
        effect: true,
        hostHealthRetry: true,
        metrics: retryEffect,
        deltas: retryEffectRaw.deltas,
      });
      const retryEvaluation = evaluatePair(
        retryEffect,
        retryControl,
        scenarioThresholds,
      );
      if (retryEvaluation.pass) {
        effect = retryEffect;
        control = retryControl;
        evaluation = { ...retryEvaluation, hostHealthRetry: true };
      }
    }
    const teardown = await executeAsync("teardown");
    if (teardown.ownedNodeGrowth !== scenarioThresholds.ownedNodeGrowth)
      evaluation.failures.push(`owned node growth ${teardown.ownedNodeGrowth}`);
    if (effectProofRun.mountSecondPaint > scenarioThresholds.mountSecondPaint)
      evaluation.failures.push(
        `mount second paint ${effectProofRun.mountSecondPaint.toFixed(2)}ms`,
      );
    evaluation.failures.push(...interactionEvaluation.failures);
    evaluation.pass = evaluation.failures.length === 0;
    const result = {
      scenario,
      effect,
      control,
      evaluation,
      visual: proof,
      backends: actual,
      diagnostics: effectProofRun.diagnostics,
      interactions,
      interactionP95: interactionEvaluation.p95,
      interactionWorst: interactionEvaluation.worst,
    };
    summary.scenarios.push(result);
    if (!evaluation.pass)
      summary.failures.push(`${scenario}: ${evaluation.failures.join("; ")}`);
  }
  driverLog = await browserLogs();
} catch (error) {
  summary.failures.push(String(error?.stack || error));
  driverLog += String(error?.stack || error);
  if (driver) driverLog = await browserLogs();
} finally {
  await writeFile(
    join(artifactRoot, "environment.json"),
    JSON.stringify(environment, null, 2),
  );
  await writeFile(
    join(artifactRoot, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  await writeFile(
    join(artifactRoot, "samples.ndjson"),
    `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
  );
  await writeFile(
    join(artifactRoot, "comparison.md"),
    `# ${browser} performance\n\n${summary.scenarios.map((item) => `- ${item.scenario}: ${item.evaluation.pass ? "PASS" : "FAIL"}, p95 ${item.effect.p95.toFixed(2)}ms, ${item.evaluation.ratio.toFixed(2)}× control`).join("\n")}\n\nFailures: ${summary.failures.length}\n`,
  );
  await writeFile(join(artifactRoot, "console-driver.log"), driverLog);
  await driver?.quit().catch(() => {});
  service?.child?.kill();
  displayGuard?.kill();
  await server?.close();
}

if (negative) {
  const expectedFailure =
    negative === "timing"
      ? /paired p95|paired drop ratio/
      : /backend\/output correctness failed|lens ROI visual proof failed/;
  if (!summary.failures.some((failure) => expectedFailure.test(failure))) {
    console.error(
      `Negative mode ${negative} did not reach its intended assertion: ${summary.failures.join(" | ") || "scenario passed"}`,
    );
    process.exit(2);
  }
  console.log(`Negative mode ${negative} failed as expected`);
  process.exit(0);
}
if (summary.failures.length) {
  console.error(summary.failures.join("\n"));
  process.exit(1);
}
console.log(`Performance passed: ${browser} (${scenarios.length} scenarios)`);
