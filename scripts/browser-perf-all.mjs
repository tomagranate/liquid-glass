import { spawnSync } from "node:child_process";

const extra = process.argv.slice(2);
for (const browser of ["chrome", "firefox", "safari"]) {
  const result = spawnSync(
    process.execPath,
    [
      new URL("browser-perf.mjs", import.meta.url).pathname,
      `--browser=${browser}`,
      ...extra,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
