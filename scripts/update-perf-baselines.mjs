import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")),
);
if (args.approve !== "true" || !args.browser || !args.summary) {
  console.error(
    "Refusing silent baseline update. Pass --approve=true --browser=<chrome|firefox|safari> --summary=<reviewed summary.json>.",
  );
  process.exit(1);
}
const summary = JSON.parse(await readFile(resolve(args.summary), "utf8"));
if (summary.failures?.length)
  throw new Error("Refusing to baseline a failing run");
const path = resolve(`tests/perf/thresholds/${args.browser}.json`);
const thresholds = JSON.parse(await readFile(path, "utf8"));
thresholds.calibratedFrom = {
  reviewedArtifact: resolve(args.summary),
  updatedAt: new Date().toISOString(),
};
await writeFile(path, `${JSON.stringify(thresholds, null, 2)}\n`);
console.log(
  `Recorded reviewed calibration provenance in ${path}; numeric thresholds remain explicit review edits.`,
);
