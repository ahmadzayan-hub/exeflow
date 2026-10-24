// Generates the two project illustrations as SVG (deterministic, no dependencies).
//   node docs/assets/src/make-illustrations.mjs
// Then render to PNG with any browser (see docs/assets/README.md).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

// Small deterministic PRNG so the artwork never changes between runs.
let seed = 20261023;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const between = (a, b) => a + (b - a) * rnd();

const RED = "#c8102e";
const NAVY = "#0b3c6e";
const TEAL = "#0091a6";

/* ------------------------------------------------------------------ hero */
function hero() {
  const W = 1600;
  const H = 800;
  // Signalling network in the sky.
  const nodes = Array.from({ length: 34 }, () => [between(520, 1560), between(40, 330)]);
  const edges = [];
  nodes.forEach((a, i) => {
    nodes
      .map((b, j) => ({ j, d: Math.hypot(a[0] - b[0], a[1] - b[1]) }))
      .filter((o) => o.j > i && o.d < 210)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2)
      .forEach((o) => edges.push([a, nodes[o.j]]));
  });
  const net =
    edges.map(([a, b]) => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#9db4e6" stroke-opacity=".28" stroke-width="1.2"/>`).join("") +
    nodes
      .map(([x, y], i) => (i % 5 === 0 ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${RED}" opacity=".35" filter="url(#blur6)"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="#ff7a8c"/>` : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4" fill="#cfe0ff" opacity=".85"/>`))
      .join("");

  const skyline = (base, minH, maxH, fill, windows, step) => {
    let x = -20;
    let g = "";
    while (x < W + 40) {
      const w = between(step[0], step[1]);
      const h = between(minH, maxH);
      g += `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"/>`;
      if (rnd() > 0.82) g += `<rect x="${(x + w / 2 - 1.5).toFixed(1)}" y="${(base - h - 26).toFixed(1)}" width="3" height="26" fill="${fill}"/>`;
      if (windows) {
        for (let wy = base - h + 12; wy < base - 8; wy += 14) {
          for (let wx = x + 6; wx < x + w - 8; wx += 11) if (rnd() > 0.72) g += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="4" height="6" fill="${rnd() > 0.7 ? "#ffd38a" : "#ff9aa8"}" opacity="${between(0.35, 0.8).toFixed(2)}"/>`;
        }
      }
      x += w + between(0, 5);
    }
    return g;
  };

  // Viaduct columns.
  let columns = "";
  for (let x = 40; x < W; x += 170) columns += `<rect x="${x}" y="585" width="26" height="215" fill="url(#concrete)"/><rect x="${x - 14}" y="578" width="54" height="16" rx="3" fill="#161b34"/>`;

  // Train windows.
  let windows = "";
  for (let i = 0; i < 11; i++) windows += `<rect x="${662 + i * 56}" y="486" width="42" height="30" rx="5" fill="#0d1733"/><rect x="${666 + i * 56}" y="489" width="34" height="9" rx="3" fill="#3b5aa8" opacity=".55"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="A metro train crossing a city at dusk under a signalling network">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070d22"/><stop offset=".45" stop-color="#17214f"/><stop offset=".72" stop-color="#5b1a45"/><stop offset=".9" stop-color="#b3153a"/><stop offset="1" stop-color="#e0364f"/></linearGradient>
  <linearGradient id="concrete" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1a2040"/><stop offset=".5" stop-color="#2a3260"/><stop offset="1" stop-color="#12172f"/></linearGradient>
  <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6fb"/><stop offset=".55" stop-color="#c9d0e4"/><stop offset="1" stop-color="#8a93b5"/></linearGradient>
  <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${RED}" stop-opacity="0"/><stop offset=".6" stop-color="#ff5a74" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>
  <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff8aa0" stop-opacity=".75"/><stop offset="1" stop-color="#ff8aa0" stop-opacity="0"/></radialGradient>
  <filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="blur14" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<ellipse cx="1180" cy="610" rx="520" ry="150" fill="url(#sun)"/>
${net}
<g>${skyline(640, 70, 270, "#1c2352", true, [26, 56])}</g>
<g>${skyline(660, 40, 190, "#0d1230", true, [34, 78])}</g>
<rect x="0" y="560" width="${W}" height="240" fill="#090d20"/>
${columns}
<rect x="0" y="566" width="${W}" height="26" fill="#10152e"/>
<rect x="0" y="566" width="${W}" height="4" fill="#3a4378"/>
<g>
  <rect x="640" y="470" width="760" height="86" rx="10" fill="url(#body)"/>
  <path d="M1400 470 H1452 Q1520 486 1548 556 H1400 Z" fill="url(#body)"/>
  <path d="M1426 484 H1450 Q1494 494 1516 530 H1426 Z" fill="#0d1733"/>
  ${windows}
  <rect x="640" y="530" width="908" height="9" fill="${RED}"/>
  <rect x="640" y="542" width="908" height="3" fill="#fff" opacity=".6"/>
  <rect x="640" y="556" width="908" height="10" fill="#10152e"/>
  <ellipse cx="1546" cy="540" rx="60" ry="14" fill="#fff" opacity=".9" filter="url(#blur6)"/>
  <rect x="1500" y="534" width="48" height="10" rx="5" fill="#fff"/>
</g>
<rect x="120" y="531" width="520" height="8" fill="url(#glow)" opacity=".85" filter="url(#blur6)"/>
<rect x="180" y="548" width="460" height="5" fill="url(#glow)" opacity=".7"/>
<ellipse cx="1546" cy="540" rx="200" ry="26" fill="#fff" opacity=".12" filter="url(#blur14)"/>
<rect x="0" y="690" width="${W}" height="110" fill="#05081a" opacity=".55"/>
</svg>`;
}

/* ------------------------------------------------------------- isometric */
function iso() {
  const W = 1600;
  const H = 900;
  const S = 1; // scale
  const C = 0.866;
  const CX = 700;
  const CY = 340;
  const P = (x, y, z = 0) => [CX + (x - y) * C * S, CY + (x + y) * 0.5 * S - z * S];
  const pts = (list) => list.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
  const poly = (list, fill, extra = "") => `<polygon points="${pts(list)}" fill="${fill}" ${extra}/>`;
  const box = (x, y, z, dx, dy, dz, top, left, right, stroke = "") => {
    const t = [P(x, y, z + dz), P(x + dx, y, z + dz), P(x + dx, y + dy, z + dz), P(x, y + dy, z + dz)];
    const l = [P(x, y + dy, z + dz), P(x + dx, y + dy, z + dz), P(x + dx, y + dy, z), P(x, y + dy, z)];
    const r = [P(x + dx, y, z + dz), P(x + dx, y + dy, z + dz), P(x + dx, y + dy, z), P(x + dx, y, z)];
    const s = stroke ? `stroke="${stroke}" stroke-width="1" stroke-linejoin="round"` : "";
    return poly(l, left, s) + poly(r, right, s) + poly(t, top, s);
  };

  // Ground slab 0..620 on both axes.
  const slab = box(-40, -40, -34, 700, 560, 34, "#e8ecf2", "#cfd6e2", "#b9c2d2", "#c3cbd9");
  const field = poly([P(-10, -10, 0), P(650, -10, 0), P(650, 490, 0), P(-10, 490, 0)], "#f7f9fc", 'stroke="#dbe1ea" stroke-width="1"');

  // Two tracks along x at y=250 and y=330, with sleepers.
  let track = "";
  for (const ty of [225, 345]) {
    for (let x = 10; x < 640; x += 18) track += poly([P(x, ty - 22, 0.4), P(x + 6, ty - 22, 0.4), P(x + 6, ty + 22, 0.4), P(x, ty + 22, 0.4)], "#aeb7c8");
    for (const o of [-13, 13]) track += `<polyline points="${pts([P(0, ty + o, 1), P(640, ty + o, 1)])}" stroke="#6c7691" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }

  // Metro train (silver, red band) on track 1 and tram (teal) on track 2.
  const metro = box(150, 207, 1, 330, 36, 40, "#f6f8fc", "#d5dbe8", "#c1c9db") + box(150, 207, 22, 330, 36, 4, "#fff", RED, "#a50d26");
  let metroWin = "";
  for (let i = 0; i < 9; i++) metroWin += poly([P(166 + i * 35, 243, 30), P(188 + i * 35, 243, 30), P(188 + i * 35, 243, 12), P(166 + i * 35, 243, 12)], "#12254d", 'opacity=".9"');
  const tram = box(250, 329, 1, 220, 32, 34, "#e9fbfd", "#bfe9ee", "#a5d9e0") + box(250, 329, 18, 220, 32, 4, "#fff", TEAL, "#00748a");
  let tramWin = "";
  for (let i = 0; i < 6; i++) tramWin += poly([P(262 + i * 35, 361, 26), P(284 + i * 35, 361, 26), P(284 + i * 35, 361, 10), P(262 + i * 35, 361, 10)], "#0f3b52", 'opacity=".9"');

  // Control tower at the back-left.
  const tower =
    box(40, 60, 0, 120, 110, 36, "#ffffff", "#e2e7f0", "#cfd6e4", "#c3cbd9") +
    box(62, 80, 36, 76, 70, 70, "#f4f6fa", "#d9dfeb", "#c6cedd", "#c3cbd9") +
    box(52, 70, 106, 96, 90, 30, "#ffffff", NAVY, "#082c52") +
    box(70, 88, 136, 60, 54, 10, "#e8ecf3", "#ccd3e1", "#b8c1d3");
  let towerWin = "";
  for (let i = 0; i < 4; i++) towerWin += poly([P(60 + i * 20, 160, 70), P(70 + i * 20, 160, 70), P(70 + i * 20, 160, 52), P(60 + i * 20, 160, 52)], "#9fb7e3");
  const dish = `<ellipse cx="${P(120, 116, 160)[0].toFixed(1)}" cy="${P(120, 116, 160)[1].toFixed(1)}" rx="20" ry="9" fill="${RED}"/><line x1="${P(120, 116, 160)[0].toFixed(1)}" y1="${P(120, 116, 160)[1].toFixed(1)}" x2="${P(120, 116, 200)[0].toFixed(1)}" y2="${P(120, 116, 200)[1].toFixed(1)}" stroke="#3a4054" stroke-width="3"/><circle cx="${P(120, 116, 200)[0].toFixed(1)}" cy="${P(120, 116, 200)[1].toFixed(1)}" r="6" fill="${RED}"/>`;

  // Trees (flat discs).
  let trees = "";
  for (const [x, y] of [[560, 60], [600, 100], [585, 410], [520, 440], [40, 410], [90, 450], [330, 440]]) {
    const [tx, ty] = P(x, y, 0);
    trees += `<ellipse cx="${tx.toFixed(1)}" cy="${(ty + 3).toFixed(1)}" rx="14" ry="6" fill="#000" opacity=".08"/><rect x="${(tx - 2).toFixed(1)}" y="${(ty - 16).toFixed(1)}" width="4" height="16" fill="#7a5a44"/><circle cx="${tx.toFixed(1)}" cy="${(ty - 26).toFixed(1)}" r="14" fill="#2f9e6b"/><circle cx="${(tx - 5).toFixed(1)}" cy="${(ty - 30).toFixed(1)}" r="8" fill="#43b982" opacity=".8"/>`;
  }

  // Floating dashboard panels: planes y = const, local 300x190 units.
  const panel = (x0, y, z0, body) => {
    const a = C * S;
    const b = 0.5 * S;
    const e = CX + (x0 - y) * C * S;
    const f = CY + (x0 + y) * 0.5 * S - z0 * S;
    return `<g transform="matrix(${a.toFixed(4)} ${b.toFixed(4)} 0 ${S} ${e.toFixed(1)} ${f.toFixed(1)})">
      <rect x="0" y="0" width="300" height="190" rx="12" fill="#fff" stroke="#d3dae6" stroke-width="2"/>
      <rect x="0" y="0" width="300" height="26" rx="12" fill="${RED}"/><rect x="0" y="14" width="300" height="12" fill="${RED}"/>
      <circle cx="16" cy="13" r="4" fill="#fff" opacity=".9"/><rect x="28" y="9" width="70" height="8" rx="4" fill="#fff" opacity=".85"/>
      ${body}</g>`;
  };
  const bars = [92, 124, 70, 138, 104, 148].map((h, i) => `<rect x="${24 + i * 40}" y="${176 - h * 0.9}" width="26" height="${h * 0.9}" rx="4" fill="${i === 3 ? RED : "#c9d3e6"}"/>`).join("") + `<line x1="16" y1="176" x2="284" y2="176" stroke="#cfd6e2" stroke-width="2"/>`;
  const line = `<polyline points="20,150 70,128 120,138 170,96 220,108 276,60" fill="none" stroke="${NAVY}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="20,160 70,150 120,148 170,132 220,130 276,118" fill="none" stroke="#9db0d0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 9"/><circle cx="276" cy="60" r="8" fill="${RED}"/><line x1="16" y1="176" x2="284" y2="176" stroke="#cfd6e2" stroke-width="2"/>`;
  const ring = `<circle cx="100" cy="108" r="46" fill="none" stroke="#e1e6ef" stroke-width="22"/><circle cx="100" cy="108" r="46" fill="none" stroke="${RED}" stroke-width="22" stroke-dasharray="130 289" transform="rotate(-90 100 108)"/><circle cx="100" cy="108" r="46" fill="none" stroke="${TEAL}" stroke-width="22" stroke-dasharray="64 289" stroke-dashoffset="-130" transform="rotate(-90 100 108)"/><rect x="176" y="70" width="96" height="12" rx="6" fill="#c9d3e6"/><rect x="176" y="96" width="70" height="12" rx="6" fill="#dfe5f0"/><rect x="176" y="122" width="84" height="12" rx="6" fill="#dfe5f0"/>`;

  const panels =
    panel(-90, -10, 255, bars) +
    panel(250, -10, 345, line) +
    panel(590, -10, 255, ring);

  // Data lines from panels down to the assets, with nodes.
  const link = (a, b, c) => `<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)} C ${a[0].toFixed(1)} ${(a[1] + 70).toFixed(1)}, ${b[0].toFixed(1)} ${(b[1] - 70).toFixed(1)}, ${b[0].toFixed(1)} ${b[1].toFixed(1)}" fill="none" stroke="${c}" stroke-width="2.4" stroke-dasharray="6 7" opacity=".85"/><circle cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" r="6" fill="${c}"/><circle cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" r="12" fill="${c}" opacity=".18"/>`;
  const links = link(P(60, -10, 255), P(120, 116, 200), NAVY) + link(P(400, -10, 345), P(330, 225, 44), RED) + link(P(740, -10, 255), P(380, 345, 38), TEAL);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="A railway control tower linked to live dashboard panels above a metro and tram line">
<defs>
  <radialGradient id="bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9edf4"/></radialGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#0b3c6e" flood-opacity=".16"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<g filter="url(#soft)">${slab}</g>
${field}${track}${trees}
${tower}${towerWin}${dish}
${metro}${metroWin}${tram}${tramWin}
${links}
<g filter="url(#soft)">${panels}</g>
</svg>`;
}

writeFileSync(out("hero.svg"), hero());
writeFileSync(out("workflow.svg"), iso());
console.log("wrote hero.svg and workflow.svg");
