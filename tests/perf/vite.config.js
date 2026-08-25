import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  build: {
    outDir: "../../dist/perf",
    emptyOutDir: true,
    sourcemap: true,
  },
});
