import type { ChartSpec } from "./api";

const W = 520;
const H = 220;
const PAD = { l: 48, r: 12, t: 28, b: 44 };

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag;
  const out = [];
  for (let v = 0; v <= max + step * 0.5; v += step) out.push(v);
  return out;
}

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

export function Chart({ spec }: { spec: ChartSpec }) {
  const xs = Array.from(new Set(spec.series.flatMap((s) => s.points.map((p) => p.x))));
  const ys = spec.series.flatMap((s) => s.points.map((p) => p.y)).filter((v) => typeof v === "number" && Number.isFinite(v));
  const max = Math.max(0, ...ys);
  const min = Math.min(0, ...ys);
  const tk = ticks(max);
  const top = tk[tk.length - 1] || 1;
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const yOf = (v: number) => PAD.t + innerH - ((v - min) / (top - min || 1)) * innerH;
  const xOf = (i: number) => PAD.l + (innerW * (i + 0.5)) / Math.max(1, xs.length);
  const labelEvery = Math.ceil(xs.length / 8);

  return (
    <figure className="chart">
      <figcaption>
        {spec.title} <span className="muted small">· {spec.evidence}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title}>
        {tk.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} className="grid" />
            <text x={PAD.l - 6} y={yOf(v) + 4} textAnchor="end" className="tick">
              {fmt(v)}
            </text>
          </g>
        ))}
        {spec.type === "bar"
          ? spec.series.map((s, si) => {
              const bw = (innerW / Math.max(1, xs.length)) * (0.7 / spec.series.length);
              return s.points.map((p) => {
                const i = xs.indexOf(p.x);
                const x = xOf(i) - (bw * spec.series.length) / 2 + si * bw;
                return <rect key={p.x + si} x={x} y={yOf(Math.max(0, p.y))} width={bw} height={Math.abs(yOf(p.y) - yOf(0))} fill={SERIES_COLORS[si % 4]} rx={2} />;
              });
            })
          : spec.series.map((s, si) => {
              const d = s.points.map((p, k) => `${k === 0 ? "M" : "L"}${xOf(xs.indexOf(p.x))},${yOf(p.y)}`).join(" ");
              return (
                <g key={s.name}>
                  <path d={d} fill="none" stroke={SERIES_COLORS[si % 4]} strokeWidth={2.2} strokeLinejoin="round" />
                  {s.points.map((p) => (
                    <circle key={p.x} cx={xOf(xs.indexOf(p.x))} cy={yOf(p.y)} r={3} fill={SERIES_COLORS[si % 4]} />
                  ))}
                </g>
              );
            })}
        {xs.map((x, i) =>
          i % labelEvery === 0 ? (
            <text key={x} x={xOf(i)} y={H - PAD.b + 16} textAnchor="middle" className="tick">
              {x.length > 12 ? `${x.slice(0, 11)}…` : x}
            </text>
          ) : null,
        )}
        {spec.series.length > 1 &&
          spec.series.map((s, si) => (
            <g key={s.name} transform={`translate(${PAD.l + si * 120}, ${H - 8})`}>
              <rect width={10} height={10} y={-9} fill={SERIES_COLORS[si % 4]} rx={2} />
              <text x={14} className="tick">
                {s.name}
              </text>
            </g>
          ))}
      </svg>
    </figure>
  );
}
