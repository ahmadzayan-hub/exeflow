// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../reporting/api";
import { evidenceGate } from "./gate";
import { analyse } from "./insights";
import { loadBuffer } from "./parse";
import type { LocalDataset } from "./table";
import { csvBytes, loadFixture } from "./testing";

const NOW = Date.UTC(2026, 9, 23);
const DASHES = /[–—]/;
const BANNED = /robust|seamless|leverage|it is important to note/i;

function allText(r: RunResult): string {
  return [
    r.report_md,
    ...r.findings.flatMap((f) => [f.title, f.detail, f.recommendation ?? ""]),
    ...r.kpis.map((k) => `${k.label} ${k.value}`),
    ...r.charts.map((c) => c.title),
    ...r.warnings,
  ].join("\n");
}

let csv: LocalDataset;
let en: RunResult;
let ar: RunResult;

beforeAll(async () => {
  csv = await loadFixture("kpi_q2_2026.csv");
  en = analyse(csv, { lang: "en", now: NOW });
  ar = analyse(csv, { lang: "ar", now: NOW });
});

describe("analyse on the KPI fixture", () => {
  it("returns a RunResult with at least 3 confirmed findings and no gate failures", () => {
    const r: RunResult = en;
    expect(r.findings.length).toBeGreaterThanOrEqual(3);
    expect(r.rejected).toEqual([]);
    expect(r.run_id).toBe(`local-${NOW}`);
    expect(r.lang).toBe("en");
    expect(r.question).toBeNull();
    expect(r.models).toEqual({ analyst: "browser:rules", reviewer: "browser:evidence-gate", reporter: "browser:template" });
    expect(r.memory_used).toEqual([]);
    expect(r.memory_written).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.dataset.tables).toEqual([{ name: "data", columns: ["Month", "System", "Failures", "Delay Minutes", "PM Completion"], row_count: 15 }]);
    expect(Object.keys(r.timings)).toEqual(expect.arrayContaining(["profile_s", "analyst_s", "review_s", "report_s", "total_s"]));
  });

  it("gives every finding its fields and evidence that exists", () => {
    for (const f of en.findings) {
      expect(f.title.length).toBeGreaterThan(5);
      expect(f.detail.length).toBeGreaterThan(5);
      expect(["high", "medium", "low"]).toContain(f.severity);
      expect(f.recommendation).toBeTruthy();
      expect(f.review).toBe("rules + evidence gate");
      expect(f.metric).toBeTruthy();
      expect(f.evidence.length).toBeGreaterThan(0);
      for (const id of f.evidence) expect(en.evidence[id]).toBeDefined();
    }
  });

  it("passes the gate again when re-checked, in both languages", () => {
    for (const r of [en, ar]) {
      for (const f of r.findings) {
        expect(evidenceGate({ title: f.title, detail: f.detail, evidence: f.evidence }, r.evidence)).toMatchObject({ ok: true });
      }
    }
  });

  it("keeps only evidence that something cites", () => {
    const cited = new Set([...en.findings.flatMap((f) => f.evidence), ...en.kpis.map((k) => k.evidence), ...en.charts.map((c) => c.evidence)]);
    expect(new Set(Object.keys(en.evidence))).toEqual(cited);
  });

  it("finds the concentration, trend, mover and outlier cases in the data", () => {
    const titles = en.findings.map((f) => f.title);
    expect(titles).toContain("Signalling holds 51.3% of total Failures");
    expect(titles).toContain("Rolling Stock holds 47.3% of total Delay Minutes");
    expect(titles).toContain("Total Delay Minutes fell 67.4% in 2026-07 compared with 2026-06");
    expect(titles).toContain("Total Failures fell 11.5% in 2026-07 compared with 2026-06");
    expect(titles).toContain("Rolling Stock had the largest change in total Delay Minutes between 2026-06 and 2026-07");
    expect(titles).toContain("1 unusual value in Delay Minutes");
    const outlier = en.findings.find((f) => f.title.startsWith("1 unusual"));
    expect(outlier?.detail).toContain("Rolling Stock, 2026-06-01");
    expect(outlier?.detail).toContain("1050");
    expect(outlier?.severity).toBe("high");
    expect(en.findings.find((f) => f.title.startsWith("Signalling holds"))?.severity).toBe("medium");
    expect(en.findings.find((f) => f.title.startsWith("Total Failures fell"))?.severity).toBe("low");
  });

  it("mentions the peak period in the trend finding", () => {
    const f = en.findings.find((x) => x.title.startsWith("Total Delay Minutes fell"));
    expect(f?.detail).toContain("The peak was 1535 in 2026-06.");
    expect(f?.detail).toContain("From 2026-03 (565) to 2026-07 (500) the change is -11.5%.");
  });

  it("orders findings by severity, with the most telling first", () => {
    const rank = { high: 0, medium: 1, low: 2 } as const;
    const ranks = en.findings.map((f) => rank[f.severity]);
    expect([...ranks].sort()).toEqual(ranks);
    expect(en.findings[0].severity).toBe("high");
  });

  it("writes numbers with at most 2 decimals and no thousands separators", () => {
    const text = en.findings.map((f) => `${f.title} ${f.detail}`).join(" ");
    expect(text).not.toMatch(/\d,\d{3}/);
    expect(text).not.toMatch(/\d\.\d{3,}/);
    expect(text).toContain("1050");
  });

  it("is deterministic", () => {
    const again = analyse(csv, { lang: "en", now: NOW });
    expect({ ...again, timings: {} }).toEqual({ ...en, timings: {} });
  });
});

describe("Arabic output", () => {
  it("returns the same findings in Arabic, all through the gate", () => {
    expect(ar.lang).toBe("ar");
    expect(ar.findings).toHaveLength(en.findings.length);
    expect(ar.rejected).toEqual([]);
    for (const f of ar.findings) {
      expect(f.title).toMatch(/[؀-ۿ]/);
      expect(f.detail).toMatch(/[؀-ۿ]/);
      expect(f.recommendation).toMatch(/[؀-ۿ]/);
    }
    expect(ar.findings.map((f) => f.evidence)).toEqual(en.findings.map((f) => f.evidence));
    expect(ar.findings.map((f) => f.value)).toEqual(en.findings.map((f) => f.value));
  });

  it("keeps the same numbers", () => {
    const strip = (s: string) => s.replace(/[⁦⁩]/g, "");
    const mover = ar.findings.find((f) => strip(f.title).includes("Rolling Stock") && strip(f.detail).includes("-790"));
    expect(mover).toBeDefined();
    expect(strip(mover?.detail ?? "")).toContain("-75.2%");
  });
});

describe("KPIs and charts", () => {
  it("builds at most 6 KPIs from evidence, with a trend direction", () => {
    expect(en.kpis.length).toBeLessThanOrEqual(6);
    expect(en.kpis[0]).toMatchObject({ label: "Total Failures", value: 119 });
    const latest = en.kpis.find((k) => k.label === "Total Failures, 2026-07");
    expect(latest).toMatchObject({ value: 23, trend: "down" });
    expect(en.kpis.find((k) => k.label.startsWith("Top System"))?.value).toBe("Signalling");
    expect(en.kpis.find((k) => k.label === "Rows analysed")?.value).toBe(15);
    for (const k of en.kpis) expect(en.evidence[k.evidence]).toBeDefined();
  });

  it("builds at most 4 charts whose values equal the evidence rows", () => {
    expect(en.charts.length).toBeGreaterThan(0);
    expect(en.charts.length).toBeLessThanOrEqual(4);
    for (const c of en.charts) {
      const ev = en.evidence[c.evidence];
      expect(ev).toBeDefined();
      const res = ev.result as { rows: Record<string, string | number | null>[]; agg: string; metric: string; group_by: string | null };
      const key = `${res.agg}_${res.metric}`;
      if (c.type === "bar") {
        expect(ev.tool).toBe("aggregate");
        expect(c.series).toHaveLength(1);
        expect(c.series[0].points).toEqual(res.rows.map((r) => ({ x: String(r[res.group_by as string]), y: r[key] })));
      } else {
        expect(ev.tool).toBe("trend");
        const total = c.series.reduce((s, x) => s + x.points.length, 0);
        expect(total).toBe(res.rows.length);
        for (const s of c.series) {
          const rows = res.group_by ? res.rows.filter((r) => String(r[res.group_by as string]) === s.name) : res.rows;
          expect(s.points).toEqual(rows.map((r) => ({ x: String(r.period), y: r[key] })));
        }
      }
    }
    const line = en.charts.find((c) => c.type === "line");
    expect(line?.series.map((s) => s.name).sort()).toEqual(["Power Supply", "Rolling Stock", "Signalling"]);
    expect(line?.series.find((s) => s.name === "Signalling")?.points.map((p) => p.y)).toEqual([14, 11, 12, 15, 9]);
    const bar = en.charts.find((c) => c.type === "bar");
    expect(bar?.series[0].points).toEqual([
      { x: "Signalling", y: 61 },
      { x: "Rolling Stock", y: 41 },
      { x: "Power Supply", y: 17 },
    ]);
  });
});

describe("question boost", () => {
  it("puts findings about the asked metric first", () => {
    const a = analyse(csv, { question: "Why did the delay get worse?", lang: "en", now: NOW });
    expect(a.question).toBe("Why did the delay get worse?");
    expect(a.findings[0].metric).toBe("Delay Minutes");
    const delayCount = a.findings.filter((f) => f.metric === "Delay Minutes").length;
    expect(a.findings.slice(0, delayCount).every((f) => f.metric === "Delay Minutes")).toBe(true);

    const b = analyse(csv, { question: "failures by system", lang: "en", now: NOW });
    expect(b.findings[0].metric).toBe("Failures");
  });

  it("matches Arabic question tokens against English column names", () => {
    const a = analyse(csv, { question: "ما سبب تأخير الإشارات؟", lang: "ar", now: NOW });
    expect(a.findings[0].metric).toBe("Delay Minutes");
    const b = analyse(csv, { question: "الأعطال", lang: "ar", now: NOW });
    expect(b.findings[0].metric).toBe("Failures");
  });

  it("matches Arabic column names directly", async () => {
    const d = await loadBuffer("ar.csv", csvBytes("الشهر,النظام,الأعطال,التكلفة\n2026-01-01,أ,5,100\n2026-01-01,ب,1,900\n2026-02-01,أ,9,120\n2026-02-01,ب,2,950\n2026-03-01,أ,4,110\n2026-03-01,ب,3,990\n"));
    const r = analyse(d, { question: "ما هي التكلفة؟", lang: "ar", now: NOW });
    expect(r.findings[0].metric).toBe("التكلفة");
  });

  it("warns when nothing in the data matches the question", () => {
    const r = analyse(csv, { question: "weather in Paris", lang: "en", now: NOW });
    expect(r.warnings).toContain("No column or group in the data matches the question. The general findings are shown.");
    expect(r.findings.map((f) => f.title)).toEqual(en.findings.map((f) => f.title));
  });

  it("treats a blank question as none", () => {
    expect(analyse(csv, { question: "   ", lang: "en", now: NOW }).question).toBeNull();
  });
});

describe("other shapes of data", () => {
  it("adds a low severity data gap finding for a sheet with no numeric column", async () => {
    const xlsx = await loadFixture("kpi_q2_2026.xlsx");
    const r = analyse(xlsx, { lang: "en", now: NOW });
    expect(r.rejected).toEqual([]);
    const gap = r.findings.find((f) => f.title.startsWith("Data gap"));
    expect(gap).toMatchObject({ severity: "low" });
    expect(gap?.title).toBe("Data gap: table Cover has no numeric column");
    expect(r.report_md).toContain("Data gap: table Cover has no numeric column");
    expect(r.findings.filter((f) => !f.title.startsWith("Data gap")).length).toBeGreaterThanOrEqual(3);
    expect(r.findings[r.findings.length - 1].title.startsWith("Data gap")).toBe(true);
  });

  it("writes a null gap finding that passes the gate", async () => {
    const d = await loadBuffer("n.csv", csvBytes("Site,Qty,Note\nA,1,x\nB,2,\nC,3,\nD,4,y\nE,5,z\nF,6,w\nG,7,v\nH,8,u\nI,9,t\nJ,10,s\n"));
    for (const lang of ["en", "ar"] as const) {
      const r = analyse(d, { lang, now: NOW });
      expect(r.rejected).toEqual([]);
      const gap = r.findings.find((f) => f.metric === "Note");
      expect(gap).toBeDefined();
      expect(gap?.value).toBe(20);
    }
  });

  it("works without a date column or a dimension", async () => {
    const d = await loadBuffer("flat.csv", csvBytes("Item,Cost\na,10\nb,20\nc,30\nd,40\ne,50\nf,60\n"));
    const r = analyse(d, { lang: "en", now: NOW });
    expect(r.rejected).toEqual([]);
    expect(r.kpis[0]).toMatchObject({ label: "Total Cost", value: 210 });
    expect(r.charts.every((c) => c.type === "bar")).toBe(true);
  });

  it("reports when there is nothing numeric at all", async () => {
    const d = await loadBuffer("text.csv", csvBytes("Name,Note\nA,x\nB,y\n"));
    const r = analyse(d, { lang: "en", now: NOW });
    expect(r.warnings).toContain("No numeric column suitable for totals or trends was found, so no metric findings were produced.");
    expect(r.kpis).toEqual([]);
    expect(r.report_md).toContain("No finding on the numbers passed the evidence check.");
  });

  it("warns when a table was cut to the row cap", () => {
    const d: LocalDataset = {
      ...csv,
      tables: [{ ...csv.tables[0], source_rows: 250_000, warning: "cut" }],
    };
    expect(analyse(d, { lang: "en", now: NOW }).warnings).toEqual(["Table data has 250000 rows. Only the first 15 were analysed."]);
    expect(analyse(d, { lang: "ar", now: NOW }).warnings[0]).toMatch(/250000/);
  });

  it("uses the dataset's weekly cadence", async () => {
    const lines = ["Day,Team,Calls"];
    const base = Date.UTC(2026, 0, 5);
    for (let w = 0; w < 8; w++) for (const team of ["a", "b"]) lines.push(`${new Date(base + w * 7 * 86_400_000).toISOString().slice(0, 10)},${team},${10 + w * 3 + (team === "a" ? 5 : 0)}`);
    const r = analyse(await loadBuffer("w.csv", csvBytes(lines.join("\n"))), { lang: "en", now: NOW });
    const line = r.charts.find((c) => c.type === "line");
    expect(line?.series[0].points[0].x).toMatch(/^2026-W\d\d$/);
  });
});

describe("style", () => {
  it("has no em or en dashes and no filler words anywhere", async () => {
    const xlsx = await analyse(await loadFixture("kpi_q2_2026.xlsx"), { lang: "en", now: NOW });
    const xlsxAr = await analyse(await loadFixture("kpi_q2_2026.xlsx"), { lang: "ar", now: NOW });
    for (const r of [en, ar, xlsx, xlsxAr, analyse(csv, { question: "delay", lang: "en", now: NOW })]) {
      const text = allText(r);
      expect(text).not.toMatch(DASHES);
      expect(text).not.toMatch(BANNED);
    }
  });
});
