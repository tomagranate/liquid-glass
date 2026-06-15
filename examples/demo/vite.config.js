import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dogfood the package: import it by its published name, resolved to the live
// TypeScript source so the demo updates without a rebuild. (The components
// import their own CSS, so Vite injects it automatically in dev.)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@tomagranate/liquid-glass": fileURLToPath(
        new URL("../../src/index.ts", import.meta.url),
      ),
    },
  },
  server: { port: 5180, host: true },
});
