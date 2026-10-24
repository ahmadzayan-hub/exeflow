// Writes data/register.example.json: the fictional showcase frozen at a fixed date.
//   npx vite-node scripts/export-example.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { buildShowcase } from "../src/data/showcase";

const p = buildShowcase(new Date("2026-10-23T00:00:00Z"));
p.dataset = "imported";
p.title = { en: "Example register (fictional)", ar: "سجل نموذجي (خيالي)" };
mkdirSync("data", { recursive: true });
writeFileSync("data/register.example.json", JSON.stringify(p, null, 2) + "\n");
console.log("wrote data/register.example.json");
