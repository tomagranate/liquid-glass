import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dogfood the package: import it by its published name, resolved to the live
// TypeScript source so the demo updates without a rebuild. (The components
// import their own CSS, so Vite injects it automatically in dev.)
export default defineConfig({
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
  resolve: {
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
  },
  server: { port: 5180, host: true },
});
