// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { diffOf, evidenceGate, numbersIn, pctChange, ratioPct, type EvidenceItem } from "./gate";
import { runTool } from "./tools";
import { loadFixture } from "./testing";

let evidence: Record<string, EvidenceItem>;
let groupedId: string;
let totalId: string;
let trendId: string;

beforeAll(async () => {
  const ds = await loadFixture("kpi_q2_2026.csv");
  evidence = {};
  const add = (run: { id: string; tool: string; args: unknown; result: unknown }) => {
    evidence[run.id] = { tool: run.tool, args: run.args as Record<string, unknown>, result: run.result };
    return run.id;
  };
  groupedId = add(runTool(ds, "aggregate", { table: "data", metric: "Failures", group_by: "System" }));
  totalId = add(runTool(ds, "aggregate", { table: "data", metric: "Failures" }));
  trendId = add(runTool(ds, "trend", { table: "data", date_column: "Month", metric: "Failures" }));
});

describe("numbersIn", () => {
  it("reads integers, decimals, thousands separators and negatives", () => {
    expect(numbersIn("Delay was 1,050 minutes, 98.5% done, change -12.5, 3 of 61.")).toEqual([1050, 98.5, -12.5, 3, 61]);
  });

  it("ignores numbers glued to letters and keeps the parts of a period label", () => {
    expect(numbersIn("In 2026-Q2 and 2026-W07 and 2nd place")).toEqual([2026, 2026]);
    expect(numbersIn("Period 2026-05")).toEqual([2026, 5]);
  });

  it("does not take a full stop as a decimal point", () => {
    expect(numbersIn("The total is 119. Next 4.5.")).toEqual([119, 4.5]);
  });

  it("splits comma lists", () => {
    expect(numbersIn("values 61, 41 and 17")).toEqual([61, 41, 17]);
  });
});

describe("evidenceGate", () => {
  it("accepts numbers that are in the cited evidence", () => {
    const r = evidenceGate({ title: "Signalling had 61 failures", detail: "Total failures were 119 across 3 groups; Rolling Stock had 41.", evidence: [groupedId, totalId] }, evidence);
    expect(r).toEqual({ ok: true, reason: "numbers match evidence" });
  });

  it("rejects a fabricated number", () => {
    const r = evidenceGate({ title: "Signalling had 61 failures", detail: "Failures cost 987654 dirhams.", evidence: [groupedId] }, evidence);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("number 987654 not found in cited evidence");
  });

  it("rejects when a number is only in evidence that was not cited", () => {
    const r = evidenceGate({ title: "Total failures were 119", detail: "", evidence: [groupedId] }, evidence);
    expect(r.ok).toBe(false);
  });

  it("rejects a finding that cites nothing or an unknown id", () => {
    expect(evidenceGate({ title: "x", detail: "y", evidence: [] }, evidence).ok).toBe(false);
    const r = evidenceGate({ title: "61", detail: "", evidence: [groupedId, "deadbeef00"] }, evidence);
    expect(r).toEqual({ ok: false, reason: "cites unknown evidence id deadbeef00" });
  });

  it("accepts a derived percentage change of two evidence numbers", () => {
    // 61 -> 41 is -32.8%; both are in the grouped rows
    const r = evidenceGate({ title: "Rolling Stock recorded 32.8% fewer failures than Signalling", detail: "", evidence: [groupedId] }, evidence);
    expect(r.ok).toBe(true);
    expect(pctChange(61, 41)).toBe(-32.8);
  });

  it("accepts a derived difference and a derived share", () => {
    expect(evidenceGate({ title: "Signalling had 20 more failures than Rolling Stock", detail: "", evidence: [groupedId] }, evidence).ok).toBe(true);
    expect(diffOf(41, 61)).toBe(20);
    expect(evidenceGate({ title: "Signalling holds 51.3% of failures", detail: "", evidence: [groupedId, totalId] }, evidence).ok).toBe(true);
    expect(ratioPct(61, 119)).toBe(51.3);
  });

  it("accepts a period change from trend evidence, signed or not", () => {
    // 26 (2026-06) -> 23 (2026-07)
    expect(evidenceGate({ title: "Failures fell 11.5% in 2026-07", detail: "", evidence: [trendId] }, evidence).ok).toBe(true);
    expect(evidenceGate({ title: "Failures changed by -11.5% in 2026-07", detail: "", evidence: [trendId] }, evidence).ok).toBe(true);
  });

  it("accepts rounding of a large value within 0.5 and rejects beyond it", () => {
    const big: Record<string, EvidenceItem> = { e1: { tool: "aggregate", args: {}, result: { value: 3550 } } };
    expect(evidenceGate({ title: "About 3549.7 minutes", detail: "", evidence: ["e1"] }, big).ok).toBe(true);
    expect(evidenceGate({ title: "About 3548 minutes", detail: "", evidence: ["e1"] }, big).ok).toBe(false);
    const small: Record<string, EvidenceItem> = { e1: { tool: "aggregate", args: {}, result: { value: 35.5 } } };
    expect(evidenceGate({ title: "About 35.9", detail: "", evidence: ["e1"] }, small).ok).toBe(false);
  });

  it("reads numbers inside evidence strings, such as period labels and group names", () => {
    expect(evidenceGate({ title: "Period 2026-07", detail: "", evidence: [trendId] }, evidence).ok).toBe(true);
  });

  it("passes text with no numbers once it cites evidence", () => {
    expect(evidenceGate({ title: "Signalling leads", detail: "No numbers here.", evidence: [groupedId] }, evidence).ok).toBe(true);
  });

  it("does not treat zero as a free pass", () => {
    expect(evidenceGate({ title: "Zero incidents", detail: "0 incidents", evidence: [groupedId] }, evidence).ok).toBe(false);
  });
});
