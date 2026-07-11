import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const temp = await mkdtemp(join(tmpdir(), "liquid-glass-package-"));

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

async function fixture(name, source) {
  const dir = join(temp, name);
  await mkdir(dir);
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name, private: true, type: "module" }),
  );
  await writeFile(join(dir, "index.mjs"), source);
  return dir;
}

try {
  for (const file of ["dist/index.js", "dist/index.cjs", "dist/index.d.ts"]) {
    const emitted = await readFile(join(root, file), "utf8");
    if (
      /\bfrom\s*["']react(?:\/|["'])|\brequire\(["']react(?:\/|["'])/.test(
        emitted,
      )
    ) {
      throw new Error(`${file} unexpectedly imports React`);
    }
  }

  const pack = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--pack-destination", temp], {
      cwd: root,
      encoding: "utf8",
    }),
  );
  const tarball = join(temp, pack[0].filename);

  const vanilla = await fixture(
    "vanilla-consumer",
    `import { createRequire } from "node:module";
import { glass, createSurface } from "@tomagranate/liquid-glass";
if (typeof glass !== "function" || typeof createSurface !== "function") process.exit(1);
const required = createRequire(import.meta.url)("@tomagranate/liquid-glass");
if (typeof required.glass !== "function") process.exit(1);
`,
  );
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-package-lock", tarball],
    vanilla,
  );
  run("node", ["index.mjs"], vanilla);
  try {
    await import(join(vanilla, "node_modules/react/index.js"));
    throw new Error("the vanilla fixture unexpectedly installed React");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("unexpectedly installed")
    )
      throw error;
  }

  const react = await fixture(
    "react-consumer",
    `import { createRequire } from "node:module";
import { Glass, useGlass } from "@tomagranate/liquid-glass/react";
if (typeof Glass !== "function" || typeof useGlass !== "function") process.exit(1);
const required = createRequire(import.meta.url)("@tomagranate/liquid-glass/react");
if (typeof required.Glass !== "function") process.exit(1);
`,
  );
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      tarball,
      "react@18",
      "react-dom@18",
    ],
    react,
  );
  run("node", ["index.mjs"], react);
} finally {
  await rm(temp, { recursive: true, force: true });
}
