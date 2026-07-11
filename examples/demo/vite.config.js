import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Development resolves the package name to live source for fast iteration.
// Production deliberately resolves the real package exports from dist so the
// catalogue catches broken entry points before release.
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // The library keeps module-level singletons (filter defs, geometry
    // subscriptions), so hot-swapping its modules leaves two module graphs
    // fighting over the same DOM. Full-reload instead of HMR for core edits.
    {
      name: "full-reload-on-library-change",
      handleHotUpdate({ file, server }) {
        if (file.includes("/src/") && !file.includes("/examples/")) {
          server.ws.send({ type: "full-reload" });
          return [];
        }
      },
    },
  ],
  resolve:
    command === "serve"
      ? {
          alias: [
            {
              find: "@tomagranate/liquid-glass/react",
              replacement: fileURLToPath(
                new URL("../../src/react/index.tsx", import.meta.url),
              ),
            },
            {
              find: "@tomagranate/liquid-glass",
              replacement: fileURLToPath(
                new URL("../../src/index.ts", import.meta.url),
              ),
            },
          ],
        }
      : undefined,
  server: { port: 5180, host: true },
}));
