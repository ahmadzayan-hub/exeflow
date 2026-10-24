/**
 * Analytics tools, ported from server/execflow/analytics.py. Each call is a
 * pure function of the dataset and its JSON arguments, so a number quoted in a
 * finding can be recomputed. Every result carries an `evidence_id`: a hash of
 * the tool name and its (normalised) arguments.
 */

import type { CellValue, LocalDataset, LocalTable } from "./table";
import { getTable } from "./table";
import { parseDateText, parseNumeric } from "./parse";
import { profileTable, type TableProfile } from "./profile";
import { cellKey, evidenceId, isoDate, pad, round } from "./util";

export const AGGS = ["sum", "mean", "count", "min", "max", "median", "nunique"] as const;
export type Agg = (typeof AGGS)[number];
export const FREQS = ["D", "W", "M", "Q", "Y"] as const;
export type Freq = (typeof FREQS)[number];
export const FILTER_OPS = ["eq", "ne", "in", "gt", "gte", "lt", "lte", "contains"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export const MAX_ROWS = 60;
export const MAX_TREND_ROWS = 400;
export const MAX_OUTLIER_ROWS = 20;
export const Z_THRESHOLD = 2.5;

export interface Filter {
  column: string;
  op?: FilterOp;
  value: unknown;
}

export type ResultValue = string | number | boolean | null;
export type ResultRow = Record<string, ResultValue>;

// ------------------------------------------------------------------ arguments and results

export interface AggregateArgs {
  table: string;
  metric: string;
  agg?: Agg;
  group_by?: string;
  filters?: Filter[];
  top_n?: number;
  sort?: "asc" | "desc";
}
export interface TrendArgs {
  table: string;
  date_column: string;
  metric: string;
  agg?: Agg;
  freq?: Freq;
  group_by?: string;
  filters?: Filter[];
}
export interface DistributionArgs {
  table: string;
  column: string;
  top_n?: number;
  filters?: Filter[];
}
export interface CompareArgs {
  table: string;
  metric: string;
  dimension: string;
  a: unknown;
  b: unknown;
  agg?: Agg;
  filters?: Filter[];
}
export interface OutliersArgs {
  table: string;
  column: string;
  /** Columns whose values are copied onto each outlier row, to name it (a category, a date). */
  label_columns?: string[];
  z_threshold?: number;
  filters?: Filter[];
}
export interface DescribeTableArgs {
  table: string;
}
export type ListTablesArgs = Record<string, never>;

export interface AggregateGrouped {
  rows: ResultRow[];
  row_count: number;
  metric: string;
  agg: Agg;
  group_by: string;
  filtered_rows: number;
  evidence_id: string;
}
export interface AggregateScalar {
  value: number | null;
  metric: string;
  agg: Agg;
  filtered_rows: number;
  evidence_id: string;
}
export type AggregateResult = AggregateGrouped | AggregateScalar;

export interface TrendResult {
  rows: ResultRow[];
  row_count: number;
  metric: string;
  agg: Agg;
  freq: Freq;
  group_by: string | null;
  evidence_id: string;
}
export interface DistributionResult {
  rows: { value: string; count: number; share: number | null }[];
  total: number;
  column: string;
  evidence_id: string;
}
export interface CompareResult {
  metric: string;
  agg: Agg;
  dimension: string;
  a: { value: unknown; result: number | null };
  b: { value: unknown; result: number | null };
  delta: number | null;
  delta_pct: number | null;
  evidence_id: string;
}
export interface OutliersResult {
  rows: ResultRow[];
  row_count: number;
  outlier_count: number;
  column: string;
  n: number;
  mean: number | null;
  std: number | null;
  z_threshold: number;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  lower_fence: number | null;
  upper_fence: number | null;
  iqr_outlier_count: number;
  evidence_id: string;
}
export interface DescribeTableResult extends TableProfile {
  evidence_id: string;
}
export interface ListTablesResult {
  tables: { name: string; row_count: number; columns: string[] }[];
  evidence_id: string;
}

export interface ToolArgsMap {
  aggregate: AggregateArgs;
  trend: TrendArgs;
  distribution: DistributionArgs;
  compare: CompareArgs;
  outliers: OutliersArgs;
  describe_table: DescribeTableArgs;
  list_tables: ListTablesArgs;
}
export interface ToolResultMap {
  aggregate: AggregateResult;
  trend: TrendResult;
  distribution: DistributionResult;
  compare: CompareResult;
  outliers: OutliersResult;
  describe_table: DescribeTableResult;
  list_tables: ListTablesResult;
}
export type ToolName = keyof ToolArgsMap;

export interface ToolRun<T extends ToolName> {
  id: string;
  tool: T;
  args: ToolArgsMap[T];
  result: ToolResultMap[T];
}

// ------------------------------------------------------------------ helpers

/** Removes float noise (0.1 + 0.2) without losing real precision. */
function clean(x: number): number {
  return round(x, 6);
}

function isNumberKind(t: LocalTable, column: string): boolean {
  return t.columns.find((c) => c.name === column)?.kind === "numeric";
}

function isDateKind(t: LocalTable, column: string): boolean {
  return t.columns.find((c) => c.name === column)?.kind === "date";
}

function checkColumns(t: LocalTable, ...cols: (string | undefined)[]): void {
  for (const c of cols) {
    if (c !== undefined && !t.columns.some((x) => x.name === c)) {
      throw new Error(`unknown column '${c}'; available: ${JSON.stringify(t.columns.map((x) => x.name).slice(0, 40))}`);
    }
  }
}

function toNumber(v: CellValue | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return parseNumeric(v);
  return null;
}

function toDate(v: CellValue | undefined): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string") return parseDateText(v);
  return null;
}

type Row = LocalTable["rows"][number];

export function applyFilters(t: LocalTable, rows: Row[], filters: Filter[] | undefined): Row[] {
  let out = rows;
  for (const f of filters ?? []) {
    checkColumns(t, f.column);
    const op: FilterOp = f.op ?? "eq";
    if (!FILTER_OPS.includes(op)) throw new Error(`unknown filter op '${String(op)}'`);
    const col = f.column;
    const numeric = isNumberKind(t, col);
    const date = isDateKind(t, col);
    const val = f.value;
    switch (op) {
      case "eq":
        out = out.filter((r) => (numeric ? toNumber(r[col]) === toNumber(val as CellValue) && r[col] !== null : r[col] !== null && cellKey(r[col]) === String(val)));
        break;
      case "ne":
        out = out.filter((r) => (numeric ? toNumber(r[col]) !== toNumber(val as CellValue) : r[col] !== null && cellKey(r[col]) !== String(val)));
        break;
      case "in": {
        const set = new Set((Array.isArray(val) ? val : [val]).map((x) => String(x)));
        out = out.filter((r) => r[col] !== null && set.has(cellKey(r[col])));
        break;
      }
      case "contains": {
        const needle = String(val).toLowerCase();
        out = out.filter((r) => r[col] !== null && cellKey(r[col]).toLowerCase().includes(needle));
        break;
      }
      default: {
        const cmp = (a: number | string, b: number | string): boolean =>
          op === "gt" ? a > b : op === "gte" ? a >= b : op === "lt" ? a < b : a <= b;
        if (date) {
          const target = val instanceof Date ? val : parseDateText(String(val));
          if (!target) throw new Error(`cannot read '${String(val)}' as a date for column '${col}'`);
          out = out.filter((r) => {
            const d = toDate(r[col]);
            return d !== null && cmp(d.getTime(), target.getTime());
          });
        } else if (numeric) {
          const target = toNumber(val as CellValue);
          if (target === null) throw new Error(`cannot read '${String(val)}' as a number for column '${col}'`);
          out = out.filter((r) => {
            const x = toNumber(r[col]);
            return x !== null && cmp(x, target);
          });
        } else {
          const target = String(val);
          out = out.filter((r) => r[col] !== null && cmp(cellKey(r[col]), target));
        }
      }
    }
  }
  return out;
}

function median(sorted: number[]): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const mid = n >> 1;
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function aggregateCells(cells: CellValue[], agg: Agg): number | null {
  if (agg === "count") return cells.filter((c) => c !== null).length;
  if (agg === "nunique") return new Set(cells.filter((c) => c !== null).map(cellKey)).size;
  const nums = cells.map(toNumber).filter((x): x is number => x !== null);
  switch (agg) {
    case "sum":
      return clean(nums.reduce((a, b) => a + b, 0));
    case "mean":
      return nums.length ? clean(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
    case "min":
      return nums.length ? Math.min(...nums) : null;
    case "max":
      return nums.length ? Math.max(...nums) : null;
    case "median": {
      const m = median([...nums].sort((a, b) => a - b));
      return m === null ? null : clean(m);
    }
  }
}

/** Group key as shown in results: dates as YYYY-MM-DD, null stays null. */
function keyValue(v: CellValue | undefined): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isoDate(v);
  return v;
}

function compareKeys(a: ResultValue, b: ResultValue): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

function sortByValue(rows: ResultRow[], valueKey: string, groupKey: string, dir: "asc" | "desc"): ResultRow[] {
  return [...rows].sort((r1, r2) => {
    const a = r1[valueKey] as number | null;
    const b = r2[valueKey] as number | null;
    if (a === null && b === null) return compareKeys(r1[groupKey], r2[groupKey]);
    if (a === null) return 1;
    if (b === null) return -1;
    const d = dir === "asc" ? a - b : b - a;
    return d !== 0 ? d : compareKeys(r1[groupKey], r2[groupKey]);
  });
}

// ------------------------------------------------------------------ period labels

function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7) };
}

/** 2026-05, 2026-Q2, 2026-W07, 2026 or 2026-05-14. */
export function periodLabel(d: Date, freq: Freq): string {
  const y = d.getUTCFullYear();
  switch (freq) {
    case "D":
      return isoDate(d);
    case "W": {
      const w = isoWeek(d);
      return `${pad(w.year, 4)}-W${pad(w.week)}`;
    }
    case "M":
      return `${pad(y, 4)}-${pad(d.getUTCMonth() + 1)}`;
    case "Q":
      return `${pad(y, 4)}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    case "Y":
      return pad(y, 4);
  }
}

// ------------------------------------------------------------------ the tools

function aggregateCore(ds: LocalDataset, args: Required<Pick<AggregateArgs, "agg" | "sort">> & AggregateArgs): Omit<AggregateGrouped, "evidence_id"> | Omit<AggregateScalar, "evidence_id"> {
  if (!AGGS.includes(args.agg)) throw new Error(`agg must be one of ${JSON.stringify(AGGS)}`);
  const t = getTable(ds, args.table);
  checkColumns(t, args.metric, args.group_by);
  const rows = applyFilters(t, t.rows, args.filters);
  if (args.group_by) {
    const g = args.group_by;
    const groups = new Map<string, { key: ResultValue; cells: CellValue[] }>();
    for (const r of rows) {
      const k = cellKey(r[g]) + (r[g] === null ? "\u0000" : "");
      let e = groups.get(k);
      if (!e) {
        e = { key: keyValue(r[g]), cells: [] };
        groups.set(k, e);
      }
      e.cells.push(r[args.metric]);
    }
    const valueKey = `${args.agg}_${args.metric}`;
    let res: ResultRow[] = [...groups.values()].map((e) => ({ [g]: e.key, [valueKey]: aggregateCells(e.cells, args.agg) }));
    res = sortByValue(res, valueKey, g, args.sort);
    if (args.top_n) res = res.slice(0, Math.floor(args.top_n));
    return { rows: res.slice(0, MAX_ROWS), row_count: res.length, metric: args.metric, agg: args.agg, group_by: g, filtered_rows: rows.length };
  }
  return { value: aggregateCells(rows.map((r) => r[args.metric]), args.agg), metric: args.metric, agg: args.agg, filtered_rows: rows.length };
}

function withId<T extends ToolName, R extends object>(tool: T, args: ToolArgsMap[T], result: R): R & { evidence_id: string } {
  return { ...result, evidence_id: evidenceId(tool, args) };
}

export function normaliseAggregateArgs(a: AggregateArgs): AggregateArgs {
  const out: AggregateArgs = { table: a.table, metric: a.metric, agg: a.agg ?? "sum", sort: a.sort ?? "desc" };
  if (a.group_by) out.group_by = a.group_by;
  if (a.filters?.length) out.filters = a.filters.map(normaliseFilter);
  if (a.top_n) out.top_n = a.top_n;
  return out;
}
function normaliseFilter(f: Filter): Filter {
  return { column: f.column, op: f.op ?? "eq", value: f.value };
}

export function aggregate(ds: LocalDataset, args: AggregateArgs & { group_by: string }): AggregateGrouped;
export function aggregate(ds: LocalDataset, args: AggregateArgs & { group_by?: undefined }): AggregateScalar;
export function aggregate(ds: LocalDataset, args: AggregateArgs): AggregateResult;
export function aggregate(ds: LocalDataset, args: AggregateArgs): AggregateResult {
  const norm = normaliseAggregateArgs(args);
  const res = aggregateCore(ds, norm as Required<Pick<AggregateArgs, "agg" | "sort">> & AggregateArgs);
  return withId("aggregate", norm, res) as AggregateResult;
}

export function normaliseTrendArgs(a: TrendArgs): TrendArgs {
  const out: TrendArgs = { table: a.table, date_column: a.date_column, metric: a.metric, agg: a.agg ?? "sum", freq: a.freq ?? "M" };
  if (a.group_by) out.group_by = a.group_by;
  if (a.filters?.length) out.filters = a.filters.map(normaliseFilter);
  return out;
}

export function trend(ds: LocalDataset, args: TrendArgs): TrendResult {
  const norm = normaliseTrendArgs(args);
  const agg = norm.agg as Agg;
  const freq = norm.freq as Freq;
  if (!FREQS.includes(freq)) throw new Error(`freq must be one of ${JSON.stringify(FREQS)}`);
  if (!AGGS.includes(agg)) throw new Error(`agg must be one of ${JSON.stringify(AGGS)}`);
  const t = getTable(ds, args.table);
  checkColumns(t, args.date_column, args.metric, args.group_by);
  const rows = applyFilters(t, t.rows, norm.filters);
  const buckets = new Map<string, { period: string; group: ResultValue; cells: CellValue[] }>();
  for (const r of rows) {
    const d = toDate(r[args.date_column]);
    if (!d) continue;
    if (args.group_by && r[args.group_by] === null) continue;
    const period = periodLabel(d, freq);
    const group = args.group_by ? keyValue(r[args.group_by]) : null;
    const k = `${period}\u0001${group === null ? "" : String(group)}`;
    let b = buckets.get(k);
    if (!b) {
      b = { period, group, cells: [] };
      buckets.set(k, b);
    }
    b.cells.push(r[args.metric]);
  }
  const valueKey = `${agg}_${args.metric}`;
  const sorted = [...buckets.values()].sort((x, y) => (x.period < y.period ? -1 : x.period > y.period ? 1 : compareKeys(x.group, y.group)));
  const res: ResultRow[] = sorted.map((b) => {
    const row: ResultRow = { period: b.period };
    if (args.group_by) row[args.group_by] = b.group;
    row[valueKey] = aggregateCells(b.cells, agg);
    return row;
  });
  return withId("trend", norm, {
    rows: res.slice(0, MAX_TREND_ROWS),
    row_count: res.length,
    metric: args.metric,
    agg,
    freq,
    group_by: args.group_by ?? null,
  });
}

export function normaliseDistributionArgs(a: DistributionArgs): DistributionArgs {
  const out: DistributionArgs = { table: a.table, column: a.column, top_n: a.top_n ?? 10 };
  if (a.filters?.length) out.filters = a.filters.map(normaliseFilter);
  return out;
}

export function distribution(ds: LocalDataset, args: DistributionArgs): DistributionResult {
  const norm = normaliseDistributionArgs(args);
  const t = getTable(ds, args.table);
  checkColumns(t, args.column);
  const rows = applyFilters(t, t.rows, norm.filters);
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = r[args.column] === null ? "(blank)" : cellKey(r[args.column]);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const total = rows.length;
  const out = [...counts.entries()]
    .map(([value, count], i) => ({ value, count, i }))
    .sort((a, b) => b.count - a.count || a.i - b.i)
    .slice(0, Math.floor(norm.top_n as number))
    .map(({ value, count }) => ({ value, count, share: total ? round(count / total, 4) : null }));
  return withId("distribution", norm, { rows: out, total, column: args.column });
}

export function normaliseCompareArgs(a: CompareArgs): CompareArgs {
  const out: CompareArgs = { table: a.table, metric: a.metric, dimension: a.dimension, a: a.a, b: a.b, agg: a.agg ?? "sum" };
  if (a.filters?.length) out.filters = a.filters.map(normaliseFilter);
  return out;
}

export function compare(ds: LocalDataset, args: CompareArgs): CompareResult {
  const norm = normaliseCompareArgs(args);
  const base = norm.filters ?? [];
  const side = (value: unknown): number | null => {
    const r = aggregateCore(ds, {
      table: norm.table,
      metric: norm.metric,
      agg: norm.agg as Agg,
      sort: "desc",
      filters: [...base, { column: norm.dimension, op: "eq", value }],
    });
    return "value" in r ? r.value : null;
  };
  const va = side(args.a);
  const vb = side(args.b);
  const delta = va === null || vb === null ? null : clean(vb - va);
  const pct = !va || delta === null ? null : round((delta / va) * 100, 2);
  return withId("compare", norm, {
    metric: args.metric,
    agg: norm.agg as Agg,
    dimension: args.dimension,
    a: { value: args.a, result: va },
    b: { value: args.b, result: vb },
    delta,
    delta_pct: pct,
  });
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Z-score outliers (sample standard deviation) plus Tukey IQR fences, for context. */
export function normaliseOutliersArgs(a: OutliersArgs): OutliersArgs {
  const out: OutliersArgs = { table: a.table, column: a.column, z_threshold: a.z_threshold ?? Z_THRESHOLD };
  if (a.label_columns?.length) out.label_columns = a.label_columns;
  if (a.filters?.length) out.filters = a.filters.map(normaliseFilter);
  return out;
}

export function outliers(ds: LocalDataset, args: OutliersArgs): OutliersResult {
  const norm = normaliseOutliersArgs(args);
  const t = getTable(ds, args.table);
  checkColumns(t, args.column, ...(args.label_columns ?? []));
  const rows = applyFilters(t, t.rows, norm.filters);
  const points: { row: number; value: number; rec: Row }[] = [];
  rows.forEach((r, i) => {
    const x = toNumber(r[args.column]);
    if (x !== null) points.push({ row: i + 1, value: x, rec: r });
  });
  const n = points.length;
  const empty = { column: args.column, n, z_threshold: norm.z_threshold as number };
  if (n < 2) {
    return withId("outliers", norm, { ...empty, rows: [], row_count: 0, outlier_count: 0, mean: n ? clean(points[0].value) : null, std: null, q1: null, q3: null, iqr: null, lower_fence: null, upper_fence: null, iqr_outlier_count: 0 });
  }
  const mean = points.reduce((a, p) => a + p.value, 0) / n;
  const std = Math.sqrt(points.reduce((a, p) => a + (p.value - mean) ** 2, 0) / (n - 1));
  const sortedVals = points.map((p) => p.value).sort((a, b) => a - b);
  const q1 = quantile(sortedVals, 0.25);
  const q3 = quantile(sortedVals, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  const flagged =
    std > 0
      ? points
          .map((p) => ({ ...p, z: (p.value - mean) / std }))
          .filter((p) => Math.abs(p.z) > (norm.z_threshold as number))
          .sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || a.row - b.row)
      : [];
  const out: ResultRow[] = flagged.slice(0, MAX_OUTLIER_ROWS).map((p) => {
    const rec: ResultRow = { row: p.row, value: p.value, z: round(p.z, 2) };
    for (const c of norm.label_columns ?? []) rec[c] = keyValue(p.rec[c]);
    return rec;
  });
  return withId("outliers", norm, {
    ...empty,
    rows: out,
    row_count: flagged.length,
    outlier_count: flagged.length,
    mean: round(mean, 2),
    std: round(std, 2),
    q1: round(q1, 2),
    q3: round(q3, 2),
    iqr: round(iqr, 2),
    lower_fence: round(lower, 2),
    upper_fence: round(upper, 2),
    iqr_outlier_count: points.filter((p) => p.value < lower || p.value > upper).length,
  });
}

export function describeTable(ds: LocalDataset, args: DescribeTableArgs): DescribeTableResult {
  const norm: DescribeTableArgs = { table: args.table };
  return withId("describe_table", norm, profileTable(getTable(ds, args.table)));
}

export function listTables(ds: LocalDataset): ListTablesResult {
  return withId("list_tables", {}, { tables: ds.tables.map((t) => ({ name: t.name, row_count: t.rows.length, columns: t.columns.map((c) => c.name) })) });
}

/** Runs a tool by name and returns the call as evidence: id, normalised args and result. */
export function runTool<T extends ToolName>(ds: LocalDataset, tool: T, args: ToolArgsMap[T]): ToolRun<T> {
  let norm: unknown;
  let result: unknown;
  switch (tool) {
    case "aggregate":
      norm = normaliseAggregateArgs(args as AggregateArgs);
      result = aggregate(ds, args as AggregateArgs);
      break;
    case "trend":
      norm = normaliseTrendArgs(args as TrendArgs);
      result = trend(ds, args as TrendArgs);
      break;
    case "distribution":
      norm = normaliseDistributionArgs(args as DistributionArgs);
      result = distribution(ds, args as DistributionArgs);
      break;
    case "compare":
      norm = normaliseCompareArgs(args as CompareArgs);
      result = compare(ds, args as CompareArgs);
      break;
    case "outliers":
      norm = normaliseOutliersArgs(args as OutliersArgs);
      result = outliers(ds, args as OutliersArgs);
      break;
    case "describe_table":
      norm = { table: (args as DescribeTableArgs).table };
      result = describeTable(ds, args as DescribeTableArgs);
      break;
    case "list_tables":
      norm = {};
      result = listTables(ds);
      break;
    default:
      throw new Error(`unknown tool '${String(tool)}'`);
  }
  const typed = result as ToolResultMap[T];
  return { id: (typed as { evidence_id: string }).evidence_id, tool, args: norm as ToolArgsMap[T], result: typed };
}
