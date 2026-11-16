// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadBuffer } from "./parse";
import { candidateMetrics, dataQualityGaps, inferKind, profileDataset } from "./profile";
import { csvBytes, loadFixture } from "./testing";

describe("profileDataset", () => {
  it("profiles the fixture like profile.py", async () => {
    const ds = await loadFixture("kpi_q2_2026.csv");
    const p = profileDataset(ds);
    expect(p.dataset.tables).toEqual([{ name: "data", columns: ["Month", "System", "Failures", "Delay Minutes", "PM Completion"], row_count: 15 }]);
    const t = p.tables[0];
    const kinds = Object.fromEntries(t.columns.map((c) => [c.name, c.kind]));
    expect(kinds).toEqual({ Month: "date", System: "category", Failures: "numeric", "Delay Minutes": "numeric", "PM Completion": "numeric" });

    const failures = t.columns.find((c) => c.name === "Failures");
    expect(failures).toMatchObject({ non_null: 15, nulls: 0, distinct: 12, min: 2, max: 15, sum: 119, mean: 7.9333 });
    const delay = t.columns.find((c) => c.name === "Delay Minutes");
    expect(delay).toMatchObject({ sum: 3550, max: 1050, min: 30 });
    const month = t.columns.find((c) => c.name === "Month");
    expect(month).toMatchObject({ min: "2026-03-01", max: "2026-07-01", distinct: 5 });
    const system = t.columns.find((c) => c.name === "System");
    expect(system?.top).toEqual([
      { value: "Signalling", count: 5 },
      { value: "Rolling Stock", count: 5 },
      { value: "Power Supply", count: 5 },
    ]);
  });

  it("lists candidate metrics, date columns and dimensions", async () => {
    const ds = await loadFixture("kpi_q2_2026.csv");
    const c = candidateMetrics(profileDataset(ds));
    expect(c).toEqual([{ table: "data", metrics: ["Failures", "Delay Minutes", "PM Completion"], date_columns: ["Month"], dimensions: ["System"] }]);
    expect(candidateMetrics(ds)).toEqual(c);
  });

  it("counts nulls", async () => {
    const ds = await loadBuffer("n.csv", csvBytes("A,B\nx,1\ny,\nz,3\n"));
    const b = profileDataset(ds).tables[0].columns.find((c) => c.name === "B");
    expect(b).toMatchObject({ nulls: 1, non_null: 2, null_pct: 33.33 });
  });
});

describe("inferKind", () => {
  it("marks unique numeric ids with an id-like name as identifier", () => {
    const values = Array.from({ length: 30 }, (_, i) => 1000 + i);
    expect(inferKind("Ticket No", values)).toBe("identifier");
    expect(inferKind("Amount", values)).toBe("numeric");
    expect(inferKind("Ticket No", values.slice(0, 10))).toBe("numeric");
  });

  it("marks unique long text as identifier, repeated text as category, mixed as text", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `REF-${i}`);
    expect(inferKind("Contract", ids)).toBe("identifier");
    expect(inferKind("Owner", Array.from({ length: 40 }, (_, i) => ["a", "b", "c"][i % 3]))).toBe("category");
    expect(inferKind("Notes", Array.from({ length: 16 }, (_, i) => `note number ${i} ${"x".repeat(i)}`))).toBe("text");
  });

  it("recognises booleans and dates", () => {
    expect(inferKind("Done", [true, false, true])).toBe("boolean");
    expect(inferKind("When", [new Date(0), null, new Date(1000)])).toBe("date");
  });
});

describe("dataQualityGaps", () => {
  it("reports columns with more than 10% empty cells, in both languages", async () => {
    const ds = await loadBuffer("n.csv", csvBytes("Site,Qty,Note\nA,1,x\nB,2,\nC,3,\nD,4,y\nE,5,z\nF,6,w\nG,7,v\nH,8,u\nI,9,t\nJ,10,s\n"));
    const gaps = dataQualityGaps(ds);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ kind: "nulls", table: "data", column: "Note", nulls: 2, rows: 10, null_pct: 20 });
    expect(gaps[0].en).toBe("Column Note in table data has 2 empty cells out of 10 rows (20%). Totals and averages that use it cover the filled rows only.");
    expect(gaps[0].ar).toContain("Note");
    expect(gaps[0].ar).toMatch(/[؀-ۿ]/);
    expect(gaps[0].title.en).toBe("Data gap: 20% of Note is empty");
  });

  it("does not report a column at exactly 10%", async () => {
    const lines = ["A,B"];
    for (let i = 0; i < 10; i++) lines.push(`k${i % 3},${i === 0 ? "" : i}`);
    const ds = await loadBuffer("n.csv", csvBytes(lines.join("\n")));
    expect(dataQualityGaps(ds)).toEqual([]);
  });

  it("reports a table with no numeric column", async () => {
    const xlsx = await loadFixture("kpi_q2_2026.xlsx");
    const gaps = dataQualityGaps(xlsx);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ kind: "no_numeric", table: "Cover" });
    expect(gaps[0].en).toContain("no numeric column");
  });

  it("reports repeated header names", async () => {
    const ds = await loadBuffer("d.csv", csvBytes("Site,Site,Qty\n1,2,3\n4,5,6\n"));
    const gaps = dataQualityGaps(ds);
    expect(gaps.map((g) => g.kind)).toEqual(["duplicate_header"]);
    expect(gaps[0].en).toContain("Site");
  });

  it("finds nothing wrong with the clean fixture", async () => {
    expect(dataQualityGaps(await loadFixture("kpi_q2_2026.csv"))).toEqual([]);
  });
});
