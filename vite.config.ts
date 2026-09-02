/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  build: {
    outDir: "dist",
    sourcemap: false,
    // one JS chunk keeps the single-file bundle simple
    rollupOptions: { output: { manualChunks: undefined } },
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
