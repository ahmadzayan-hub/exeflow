// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { loadBuffer } from "./parse";
import type { LocalDataset } from "./table";
import { aggregate, applyFilters, compare, describeTable, distribution, outliers, periodLabel, runTool, trend, type AggregateGrouped, type AggregateScalar } from "./tools";
import { evidenceId, fnv1a64 } from "./util";
import { csvBytes, loadFixture } from "./testing";

let ds: LocalDataset;
beforeAll(async () => {
  ds = await loadFixture("kpi_q2_2026.csv");
});

const T = "data";

describe("aggregate", () => {
  it("sums, counts and averages without a group", () => {
    const sum = aggregate(ds, { table: T, metric: "Failures", agg: "sum" });
    expect(sum).toMatchObject({ value: 119, metric: "Failures", agg: "sum", filtered_rows: 15 });
    expect(aggregate(ds, { table: T, metric: "Delay Minutes" }).value).toBe(3550);
    expect(aggregate(ds, { table: T, metric: "Failures", agg: "count" }).value).toBe(15);
    expect(aggregate(ds, { table: T, metric: "Failures", agg: "min" }).value).toBe(2);
    expect(aggregate(ds, { table: T, metric: "Failures", agg: "max" }).value).toBe(15);
    expect(aggregate(ds, { table: T, metric: "Failures", agg: "median" }).value).toBe(8);
    expect(aggregate(ds, { table: T, metric: "Failures", agg: "nunique" }).value).toBe(12);
    expect(aggregate(ds, { table: T, metric: "PM Completion", agg: "mean" }).value).toBe(99.133333);
  });

  it("groups and sorts descending by default", () => {
    const g = aggregate(ds, { table: T, metric: "Failures", group_by: "System" });
    expect(g.rows).toEqual([
      { System: "Signalling", sum_Failures: 61 },
      { System: "Rolling Stock", sum_Failures: 41 },
      { System: "Power Supply", sum_Failures: 17 },
    ]);
    expect(g).toMatchObject({ row_count: 3, group_by: "System", filtered_rows: 15 });
    const d = aggregate(ds, { table: T, metric: "Delay Minutes", group_by: "System" });
    expect(d.rows.map((r) => [r.System, r.sum_Delay_Minutes ?? r["sum_Delay Minutes"]])).toEqual([
      ["Rolling Stock", 1680],
      ["Signalling", 1620],
      ["Power Supply", 250],
    ]);
  });

  it("supports asc sort and top_n", () => {
    const g = aggregate(ds, { table: T, metric: "Failures", group_by: "System", sort: "asc", top_n: 2 });
    expect(g.rows.map((r) => r.System)).toEqual(["Power Supply", "Rolling Stock"]);
    expect(g.row_count).toBe(2);
  });

  it("groups by a date column using ISO days", () => {
    const g = aggregate(ds, { table: T, metric: "Failures", group_by: "Month" });
    expect(g.rows.slice(0, 2)).toEqual([
      { Month: "2026-03-01", sum_Failures: 26 },
      { Month: "2026-06-01", sum_Failures: 26 },
    ]);
  });

  it("rejects unknown tables, columns and aggregations", () => {
    expect(() => aggregate(ds, { table: "nope", metric: "Failures" })).toThrow(/unknown table 'nope'/);
    expect(() => aggregate(ds, { table: T, metric: "Nope" })).toThrow(/unknown column 'Nope'/);
    expect(() => aggregate(ds, { table: T, metric: "Failures", agg: "mode" as never })).toThrow(/agg must be one of/);
  });
});

describe("filters", () => {
  const t = () => ds.tables[0];
  const count = (filters: Parameters<typeof applyFilters>[2]) => applyFilters(t(), t().rows, filters).length;

  it("eq, ne, in", () => {
    expect(count([{ column: "System", value: "Signalling" }])).toBe(5);
    expect(count([{ column: "System", op: "ne", value: "Signalling" }])).toBe(10);
    expect(count([{ column: "System", op: "in", value: ["Signalling", "Power Supply"] }])).toBe(10);
    expect(count([{ column: "Failures", op: "eq", value: 3 }])).toBe(2);
    expect(count([{ column: "Failures", op: "eq", value: "3" }])).toBe(2);
  });

  it("gt, gte, lt, lte on numbers and dates", () => {
    expect(count([{ column: "Failures", op: "gt", value: 11 }])).toBe(3);
    expect(count([{ column: "Failures", op: "gte", value: 11 }])).toBe(5);
    expect(count([{ column: "Failures", op: "lt", value: 3 }])).toBe(1);
    expect(count([{ column: "Failures", op: "lte", value: 3 }])).toBe(3);
    expect(count([{ column: "Month", op: "gte", value: "2026-06-01" }])).toBe(6);
    expect(count([{ column: "Month", op: "lt", value: "2026-04-01" }])).toBe(3);
  });

  it("contains is case-insensitive", () => {
    expect(count([{ column: "System", op: "contains", value: "SIGNAL" }])).toBe(5);
  });

  it("combines filters and feeds aggregates", () => {
    const r = aggregate(ds, { table: T, metric: "Failures", filters: [{ column: "System", value: "Signalling" }, { column: "Month", op: "gte", value: "2026-05-01" }] });
    expect(r).toMatchObject({ value: 36, filtered_rows: 3 });
  });

  it("rejects an unknown operator or column", () => {
    expect(() => count([{ column: "System", op: "like" as never, value: "x" }])).toThrow(/unknown filter op/);
    expect(() => count([{ column: "Nope", value: 1 }])).toThrow(/unknown column/);
  });
});

describe("trend", () => {
  it("returns monthly totals with period labels", () => {
    const r = trend(ds, { table: T, date_column: "Month", metric: "Failures" });
    expect(r.rows).toEqual([
      { period: "2026-03", sum_Failures: 26 },
      { period: "2026-04", sum_Failures: 22 },
      { period: "2026-05", sum_Failures: 22 },
      { period: "2026-06", sum_Failures: 26 },
      { period: "2026-07", sum_Failures: 23 },
    ]);
    expect(r).toMatchObject({ freq: "M", agg: "sum", metric: "Failures", group_by: null, row_count: 5 });
  });

  it("splits by a dimension", () => {
    const r = trend(ds, { table: T, date_column: "Month", metric: "Failures", group_by: "System" });
    expect(r.row_count).toBe(15);
    expect(r.rows[0]).toEqual({ period: "2026-03", System: "Power Supply", sum_Failures: 3 });
    expect(r.rows.filter((x) => x.System === "Signalling").map((x) => x.sum_Failures)).toEqual([14, 11, 12, 15, 9]);
  });

  it("uses quarterly and yearly labels", () => {
    expect(trend(ds, { table: T, date_column: "Month", metric: "Failures", freq: "Q" }).rows).toEqual([
      { period: "2026-Q1", sum_Failures: 26 },
      { period: "2026-Q2", sum_Failures: 70 },
      { period: "2026-Q3", sum_Failures: 23 },
    ]);
    expect(trend(ds, { table: T, date_column: "Month", metric: "Failures", freq: "Y" }).rows).toEqual([{ period: "2026", sum_Failures: 119 }]);
    expect(trend(ds, { table: T, date_column: "Month", metric: "Failures", freq: "D" }).rows[0].period).toBe("2026-03-01");
  });

  it("uses ISO week labels", () => {
    expect(trend(ds, { table: T, date_column: "Month", metric: "Failures", freq: "W" }).rows[0]).toEqual({ period: "2026-W09", sum_Failures: 26 });
    expect(periodLabel(new Date("2026-02-09T00:00:00Z"), "W")).toBe("2026-W07");
    expect(periodLabel(new Date("2027-01-01T00:00:00Z"), "W")).toBe("2026-W53");
    expect(periodLabel(new Date("2024-12-30T00:00:00Z"), "W")).toBe("2025-W01");
  });

  it("averages per period", () => {
    const r = trend(ds, { table: T, date_column: "Month", metric: "PM Completion", agg: "mean" });
    expect(r.rows.map((x) => x["mean_PM Completion"])).toEqual([99, 99, 99.333333, 98.666667, 99.666667]);
  });

  it("rejects a bad frequency", () => {
    expect(() => trend(ds, { table: T, date_column: "Month", metric: "Failures", freq: "H" as never })).toThrow(/freq must be one of/);
  });
});

describe("distribution", () => {
  it("counts values with shares", () => {
    const r = distribution(ds, { table: T, column: "System" });
    expect(r.total).toBe(15);
    expect(r.rows).toEqual([
      { value: "Signalling", count: 5, share: 0.3333 },
      { value: "Rolling Stock", count: 5, share: 0.3333 },
      { value: "Power Supply", count: 5, share: 0.3333 },
    ]);
    expect(distribution(ds, { table: T, column: "System", top_n: 1 }).rows).toHaveLength(1);
  });

  it("shows blanks", async () => {
    const d = await loadBuffer("b.csv", csvBytes("A,B\nx,1\n,2\nx,3\n"));
    expect(distribution(d, { table: "data", column: "A" }).rows).toEqual([
      { value: "x", count: 2, share: 0.6667 },
      { value: "(blank)", count: 1, share: 0.3333 },
    ]);
  });
});

describe("compare", () => {
  it("compares two values of a dimension", () => {
    const r = compare(ds, { table: T, metric: "Failures", dimension: "System", a: "Signalling", b: "Rolling Stock" });
    expect(r).toMatchObject({
      metric: "Failures",
      agg: "sum",
      dimension: "System",
      a: { value: "Signalling", result: 61 },
      b: { value: "Rolling Stock", result: 41 },
      delta: -20,
      delta_pct: -32.79,
    });
  });

  it("compares two months", () => {
    const r = compare(ds, { table: T, metric: "Failures", dimension: "Month", a: "2026-06-01", b: "2026-07-01" });
    expect(r).toMatchObject({ delta: -3, delta_pct: -11.54 });
  });

  it("gives a null percentage when the base is zero", async () => {
    const d = await loadBuffer("z.csv", csvBytes("G,V\na,0\nb,5\na,0\nb,1\n"));
    expect(compare(d, { table: "data", metric: "V", dimension: "G", a: "a", b: "b" })).toMatchObject({ delta: 6, delta_pct: null });
  });
});

describe("outliers", () => {
  it("flags values beyond 2.5 sigma and reports IQR fences", () => {
    const r = outliers(ds, { table: T, column: "Delay Minutes", label_columns: ["System", "Month"] });
    expect(r).toMatchObject({ n: 15, outlier_count: 1, z_threshold: 2.5, mean: 236.67, std: 259.39, q1: 67.5, q3: 315, iqr: 247.5, lower_fence: -303.75, upper_fence: 686.25, iqr_outlier_count: 1 });
    expect(r.rows).toEqual([{ row: 11, value: 1050, z: 3.14, System: "Rolling Stock", Month: "2026-06-01" }]);
  });

  it("finds none in a well-behaved column", () => {
    const r = outliers(ds, { table: T, column: "Failures" });
    expect(r.outlier_count).toBe(0);
    expect(r.rows).toEqual([]);
  });

  it("handles a constant column", async () => {
    const d = await loadBuffer("c.csv", csvBytes("A,V\nx,5\ny,5\nz,5\n"));
    expect(outliers(d, { table: "data", column: "V" })).toMatchObject({ outlier_count: 0, std: 0 });
  });
});

describe("describe_table", () => {
  it("returns the profile with null percentages", () => {
    const r = describeTable(ds, { table: T });
    expect(r.row_count).toBe(15);
    expect(r.columns.find((c) => c.name === "Failures")?.sum).toBe(119);
    expect(r.evidence_id).toMatch(/^[0-9a-f]{10}$/);
  });
});

describe("evidence ids", () => {
  it("is 10 hex characters, stable across calls and datasets", async () => {
    const a = aggregate(ds, { table: T, metric: "Failures" });
    const b = aggregate(ds, { table: T, metric: "Failures" });
    const xlsx = await loadFixture("kpi_q2_2026.xlsx");
    expect(a.evidence_id).toMatch(/^[0-9a-f]{10}$/);
    expect(b.evidence_id).toBe(a.evidence_id);
    expect(aggregate(xlsx, { table: "KPI_Data", metric: "Failures" }).evidence_id).not.toBe(a.evidence_id);
    expect(aggregate(xlsx, { table: "KPI_Data", metric: "Failures" }).value).toBe(119);
  });

  it("ignores key order and spelled-out defaults, and differs for different arguments", () => {
    const base = aggregate(ds, { table: T, metric: "Failures" }).evidence_id;
    expect(aggregate(ds, { metric: "Failures", agg: "sum", table: T, sort: "desc" }).evidence_id).toBe(base);
    expect(aggregate(ds, { table: T, metric: "Failures", agg: "mean" }).evidence_id).not.toBe(base);
    expect(aggregate(ds, { table: T, metric: "Failures", group_by: "System" }).evidence_id).not.toBe(base);
    expect(trend(ds, { table: T, date_column: "Month", metric: "Failures" }).evidence_id).not.toBe(base);
  });

  it("pins the hash function", () => {
    expect(fnv1a64("")).toBe("cbf29ce484222325");
    expect(fnv1a64("a")).toBe("af63dc4c8601ec8c");
    expect(evidenceId("aggregate", { table: "data", metric: "Failures", agg: "sum", sort: "desc" })).toBe(
      aggregate(ds, { table: T, metric: "Failures" }).evidence_id,
    );
  });

  it("runTool returns the same id and the normalised args", () => {
    const run = runTool(ds, "aggregate", { table: T, metric: "Failures", group_by: "System" });
    expect(run.id).toBe(run.result.evidence_id);
    expect(run.args).toMatchObject({ agg: "sum", sort: "desc" });
    const grouped = run.result as AggregateGrouped;
    expect(grouped.rows[0].sum_Failures).toBe(61);
    expect((runTool(ds, "aggregate", { table: T, metric: "Failures" }).result as AggregateScalar).value).toBe(119);
  });
});
