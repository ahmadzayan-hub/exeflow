// Inlines the Vite build into one HTML file: dist/rmd-dashboard.html
// so the dashboard can be opened from a phone or emailed without a server.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
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
writeFileSync(join(dist, "rmd-dashboard.html"), html);
console.log(`single-file: wrote dist/rmd-dashboard.html (${(html.length / 1024).toFixed(0)} KB)`);
