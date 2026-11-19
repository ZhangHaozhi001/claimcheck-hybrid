import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built site also works from GitHub Pages subpaths.
  base: "./",
  build: { outDir: "dist", sourcemap: true },
});
