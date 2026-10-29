import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: "outputs/ccatalog",
  base: process.env.GITHUB_ACTIONS ? "/ccatalog/" : "/",
  plugins: [react()],
  build: { outDir: resolve(import.meta.dirname, "dist"), emptyOutDir: true },
});
