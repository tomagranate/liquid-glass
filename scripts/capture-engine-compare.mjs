/**
 * Capture the "One material, a whole interface" vignette in each of the three
 * engines the library targets, for the "The same page, three engines" strip on
 * the browser-support page.
 *
 * This script starts nothing itself — point it at an already-running demo dev
 * server. One-command refresh:
 *
 *   node scripts/capture-engine-compare.mjs [http://localhost:5180]
 *
 * It launches the repo's own Playwright chromium + webkit + firefox (headless),
 * loads the page, scrolls the vignette into view, waits for it to settle, and
 * writes examples/demo/public/compare/<engine>.png. Engines that fail to launch
 * or capture in this environment are skipped with a warning; the support page
 * degrades gracefully (missing <img> is hidden onError).
 *
 * The images are expected to be REGENERATED after the concurrent core change to
 * policy.ts lands — re-run this one command against a fresh dev server.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = join(root, "examples/demo/public/compare");

const url = process.argv[2] || "http://localhost:5180";

// The vignette is the "One material, a whole interface" section (ComposedScene).
const VIGNETTE_SELECTOR = "section.composed";

const ENGINES = [
  { id: "chromium", launcher: chromium },
  { id: "webkit", launcher: webkit },
  { id: "firefox", launcher: firefox },
];

async function capture({ id, launcher }) {
  let browser;
  try {
    browser = await launcher.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    const section = page.locator(VIGNETTE_SELECTOR).first();
    await section.waitFor({ state: "visible", timeout: 15_000 });
    await section.scrollIntoViewIfNeeded();
    // Let glass backends settle (background copies, budget policy, media).
    await page.waitForTimeout(2_500);
    const target = page.locator(`${VIGNETTE_SELECTOR} .lockscreen`).first();
    const shot = (await target.count()) ? target : section;
    await shot.screenshot({ path: join(outDir, `${id}.png`) });
    console.log(`captured ${id} → compare/${id}.png`);
    return { id, ok: true };
  } catch (error) {
    console.warn(`skipped ${id}: ${error?.message || error}`);
    return { id, ok: false, error: String(error?.message || error) };
  } finally {
    await browser?.close().catch(() => {});
  }
}

await mkdir(outDir, { recursive: true });
const results = [];
for (const engine of ENGINES) {
  results.push(await capture(engine));
}

const ok = results.filter((r) => r.ok).map((r) => r.id);
const failed = results.filter((r) => !r.ok).map((r) => r.id);
console.log(`\nDone. Captured: ${ok.join(", ") || "none"}.`);
if (failed.length) console.log(`Not captured: ${failed.join(", ")}.`);
