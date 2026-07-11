import { verifyPerfBuild } from "./lib/perf-build.mjs";

await verifyPerfBuild();
console.log(
  "Performance fixture source maps confirm built dist/package-export resolution.",
);
