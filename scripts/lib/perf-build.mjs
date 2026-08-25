import { access, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const BUILD_COMMAND = "npm run build && npm run build:perf";

function preflightError(detail) {
  return new Error(
    `Performance fixture preflight failed: ${detail}. Run \`${BUILD_COMMAND}\` immediately before the branded-browser benchmark. The harness does not rebuild automatically so artifact provenance remains explicit.`,
  );
}

function localReferences(html) {
  return [...html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)]
    .map((match) => match[1].split("?")[0])
    .filter(
      (reference) =>
        reference &&
        !reference.startsWith("data:") &&
        !reference.startsWith("http:") &&
        !reference.startsWith("https:") &&
        !reference.startsWith("//"),
    );
}

/** Verify the exact production fixture the branded browser will receive. */
export async function verifyPerfBuild(projectRoot = process.cwd()) {
  const fixtureRoot = resolve(projectRoot, "dist/perf");
  const indexPath = join(fixtureRoot, "index.html");
  let html;
  try {
    html = await readFile(indexPath, "utf8");
  } catch {
    throw preflightError(`missing ${relative(projectRoot, indexPath)}`);
  }

  for (const reference of localReferences(html)) {
    const assetPath = reference.startsWith("/")
      ? resolve(fixtureRoot, `.${reference}`)
      : resolve(dirname(indexPath), reference);
    if (
      isAbsolute(assetPath) &&
      relative(fixtureRoot, assetPath).startsWith("..")
    ) {
      throw preflightError(
        `index references an asset outside dist/perf: ${reference}`,
      );
    }
    try {
      await access(assetPath);
    } catch {
      throw preflightError(`index references missing asset ${reference}`);
    }
  }

  const assets = join(fixtureRoot, "assets");
  let files;
  try {
    files = await readdir(assets);
  } catch {
    throw preflightError(`missing ${relative(projectRoot, assets)}`);
  }
  const maps = files.filter((file) => file.endsWith(".js.map"));
  if (!maps.length)
    throw preflightError("production fixture emitted no JavaScript source map");
  for (const file of maps) {
    const map = JSON.parse(await readFile(join(assets, file), "utf8"));
    const forbidden = map.sources.filter((source) =>
      /(?:^|\/)src\//.test(source),
    );
    if (forbidden.length)
      throw preflightError(
        `fixture resolved source aliases instead of dist exports: ${forbidden.join(", ")}`,
      );
    if (!map.sources.some((source) => /chunk-.*\.js$/.test(source)))
      throw preflightError("fixture did not consume the built package chunk");
  }
}
