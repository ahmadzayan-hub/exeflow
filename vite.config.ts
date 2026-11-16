/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const wantsRegister = (env.VITE_DATASET ?? process.env.VITE_DATASET) === "register";
  const privatePath = at("./data/private/register.json");
  if (wantsRegister && !existsSync(privatePath)) {
    throw new Error("VITE_DATASET=register needs data/private/register.json (see docs/data-governance.md)");
  }
  // Absolute URLs for social previews: use the Vercel production host when building there.
  const siteUrl = env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return {
    plugins: [
      react(),
      { name: "site-url", transformIndexHtml: (html: string) => html.replaceAll("%SITE_URL%", siteUrl) },
    ],
    base: "./",
    resolve: {
      // The private register is only bundled when explicitly requested, so public builds never contain it.
      alias: { "@register": wantsRegister ? privatePath : at("./src/data/register-stub.json") },
    },
    server: { proxy: { "/api": "http://127.0.0.1:8000" } },
    build: {
      outDir: "dist",
      sourcemap: false,
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
    test: {
      environment: "jsdom",
      globals: false,
      include: ["src/**/*.test.ts", "src/**/*.test.tsx", "api/**/*.test.ts"],
    },
  };
});
