import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Peer deps and runtime deps stay external; CSS is emitted to dist/index.css.
  external: ["react", "react-dom", "react/jsx-runtime", "html-to-image"],
});
