// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../reporting/api";
import { analyse } from "./insights";
import { buildNarratePayload, checkNarration } from "./narrate";
import { buildReport, REPORT_HEADINGS } from "./report";
import { loadFixture } from "./testing";

const NOW = Date.UTC(2026, 9, 23);
let en: RunResult;
let ar: RunResult;
let xlsxEn: RunResult;

beforeAll(async () => {
  const csv = await loadFixture("kpi_q2_2026.csv");
  en = analyse(csv, { lang: "en", now: NOW });
  ar = analyse(csv, { lang: "ar", now: NOW });
  xlsxEn = analyse(await loadFixture("kpi_q2_2026.xlsx"), { lang: "en", now: NOW });
});

const headingsOf = (md: string) => md.split("\n").filter((l) => /^#{1,2} /.test(l));

describe("buildReport", () => {
  it("has the six English RMD headings, in order", () => {
    expect(headingsOf(en.report_md)).toEqual(["# Executive summary", "## Key facts", "## Analysis", "## Risks and gaps", "## Recommended actions", "## Next steps"]);
    expect(en.report_md).toBe(buildReport(en, "en"));
  });

  it("has the six Arabic RMD headings, in order", () => {
    expect(headingsOf(ar.report_md)).toEqual(["# الملخص التنفيذي", "## الحقائق الرئيسية", "## التحليل", "## المخاطر والفجوات", "## الإجراءات الموصى بها", "## الخطوات التالية"]);
    expect(REPORT_HEADINGS.ar.summary).toBe("# الملخص التنفيذي");
  });

  it("writes an executive summary of 3 to 5 sentences with the main point first", () => {
    for (const r of [en, ar, xlsxEn]) {
      const md = r.report_md;
      const body = md.split("\n").slice(2, 3)[0];
      const sentences = body.split(/(?<=\.)\s+/).filter(Boolean);
      expect(sentences.length).toBeGreaterThanOrEqual(3);
      expect(sentences.length).toBeLessThanOrEqual(5);
      const firstHigh = r.findings.find((f) => f.severity === "high");
      expect(sentences[0]).toBe(`${firstHigh?.title}.`);
    }
    expect(en.report_md).toContain("7 findings passed the evidence check, 4 of high severity.");
    expect(en.report_md).toContain("The data shows what changed, not why, and it holds no targets.");
  });

  it("states what the data does not show and lists data gaps", () => {
    const risks = xlsxEn.report_md.split("## Risks and gaps")[1].split("## Recommended actions")[0];
    expect(risks).toContain("The data shows what changed, not why.");
    expect(risks).toContain("Data gap: table Cover has no numeric column");
    expect(xlsxEn.report_md).toContain("1 data gap is listed under Risks and gaps.");
  });

  it("lists recommendations as a numbered list without repeats", () => {
    const section = en.report_md.split("## Recommended actions")[1].split("## Next steps")[0];
    const items = section.split("\n").filter((l) => /^\d+\. /.test(l));
    expect(items.length).toBeGreaterThan(0);
    expect(new Set(items.map((l) => l.replace(/^\d+\. /, ""))).size).toBe(items.length);
  });

  it("copies numbers from findings and KPIs only", () => {
    for (const r of [en, ar, xlsxEn]) {
      expect(checkNarration(r.report_md, buildNarratePayload(r))).toEqual({ ok: true });
    }
  });

  it("renders an empty result without throwing", () => {
    const empty: RunResult = { ...en, findings: [], rejected: [], kpis: [], charts: [], evidence: {}, warnings: [] };
    for (const lang of ["en", "ar"] as const) {
      const md = buildReport(empty, lang);
      expect(headingsOf(md)).toHaveLength(6);
    }
    expect(buildReport(empty, "en")).toContain("No finding passed the evidence check.");
  });

  it("notes rejected findings", () => {
    const withRejected: RunResult = { ...en, rejected: [{ ...en.findings[0], reason: "gate: number 5 not found in cited evidence" }] };
    const md = buildReport(withRejected, "en");
    expect(md).toContain("1 further finding did not pass and was left out.");
    expect(md).toContain("Reason: gate: number 5 not found in cited evidence.");
  });
});
