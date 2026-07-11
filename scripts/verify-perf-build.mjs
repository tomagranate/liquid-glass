import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const assets = resolve("dist/perf/assets");
const files = await readdir(assets);
const maps = files.filter((file) => file.endsWith(".js.map"));
if (!maps.length)
  throw new Error("Performance build emitted no JavaScript source map");
for (const file of maps) {
  const map = JSON.parse(await readFile(join(assets, file), "utf8"));
  const forbidden = map.sources.filter((source) =>
    /(?:^|\/)src\//.test(source),
  );
  if (forbidden.length)
    throw new Error(
      `Performance fixture resolved source aliases instead of dist exports: ${forbidden.join(", ")}`,
    );
  if (!map.sources.some((source) => /chunk-.*\.js$/.test(source)))
    throw new Error(
      "Performance fixture did not consume the built package chunk",
    );
}
console.log(
  "Performance fixture source maps confirm built dist/package-export resolution.",
);
