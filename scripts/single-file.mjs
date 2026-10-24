// Inlines the Vite build into one HTML file: release/rmd-dashboard.html
// so the dashboard can be opened from a phone or emailed without a server.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
let html = readFileSync(join(dist, "index.html"), "utf8");
const assets = join(dist, "assets");

for (const file of readdirSync(assets)) {
  const content = readFileSync(join(assets, file), "utf8");
  if (file.endsWith(".js")) {
    html = html.replace(
      new RegExp(`<script type="module"[^>]*src="\\./assets/${file}"[^>]*></script>`),
      () => `<script type="module">${content.replace(/<\/script/g, "<\\/script")}</script>`,
    );
  } else if (file.endsWith(".css")) {
    html = html.replace(
      new RegExp(`<link rel="stylesheet"[^>]*href="\\./assets/${file}"[^>]*>`),
      () => `<style>${content}</style>`,
    );
  }
}
if (/assets\//.test(html)) {
  console.error("single-file: unresolved asset references remain");
  process.exit(1);
}
const release = fileURLToPath(new URL("../release/", import.meta.url));
mkdirSync(release, { recursive: true });
writeFileSync(join(release, "rmd-dashboard.html"), html);
console.log(`single-file: wrote release/rmd-dashboard.html (${(html.length / 1024).toFixed(0)} KB)`);
