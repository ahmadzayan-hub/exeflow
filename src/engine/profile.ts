/** Deterministic profiling, mirroring server/execflow/profile.py. */

import type { DatasetMeta } from "../reporting/api";
import type { Bilingual, CellValue, ColumnKind, LocalDataset, LocalTable } from "./table";
import { cellKey, isoDate, ltr, round2 } from "./util";

export const TOP_N = 6;

export interface ColumnProfile {
  name: string;
  kind: ColumnKind;
  non_null: number;
  nulls: number;
  null_pct: number;
  distinct: number;
  min?: number | string | null;
  max?: number | string | null;
  mean?: number | null;
  sum?: number | null;
  top?: { value: string; count: number }[];
}

export interface TableProfile {
  name: string;
  row_count: number;
  columns: ColumnProfile[];
  duplicated_headers: string[];
}

export interface DatasetProfile {
  dataset: DatasetMeta;
  tables: TableProfile[];
  text_preview: string[];
}

export interface CandidateMetrics {
  table: string;
  metrics: string[];
  date_columns: string[];
  dimensions: string[];
}

/** One data quality gap, with a short title and a full sentence in both languages. */
export interface DataGap extends Bilingual {
  kind: "nulls" | "no_numeric" | "duplicate_header";
  table: string;
  column?: string;
  title: Bilingual;
  nulls?: number;
  rows?: number;
  null_pct?: number;
}

const IDENTIFIER_SUFFIX = /(id|no|number|ref)$/i;

/** Column kind from its values, following column_kind() in profile.py. */
export function inferKind(name: string, values: readonly CellValue[]): ColumnKind {
  const present = values.filter((v): v is Exclude<CellValue, null> => v !== null);
  if (present.length === 0) return "text";
  if (present.every((v) => typeof v === "boolean")) return "boolean";
  if (present.every((v) => v instanceof Date)) return "date";
  const distinct = new Set(present.map(cellKey)).size;
  if (present.every((v) => typeof v === "number")) {
    if (distinct === present.length && distinct > 20 && IDENTIFIER_SUFFIX.test(name.toLowerCase())) return "identifier";
    return "numeric";
  }
  const n = Math.max(1, present.length);
  if (distinct <= Math.max(12, 0.2 * n)) return "category";
  if (distinct === n && n > 20) return "identifier";
  return "text";
}

export function numericValues(t: LocalTable, column: string): number[] {
  const out: number[] = [];
  for (const r of t.rows) {
    const v = r[column];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function profileTable(t: LocalTable): TableProfile {
  const rowCount = t.rows.length;
  const columns = t.columns.map((c): ColumnProfile => {
    const values = t.rows.map((r) => r[c.name] ?? null);
    const present = values.filter((v) => v !== null);
    const info: ColumnProfile = {
      name: c.name,
      kind: c.kind,
      non_null: present.length,
      nulls: values.length - present.length,
      null_pct: rowCount ? round2(((values.length - present.length) / rowCount) * 100) : 0,
      distinct: new Set(present.map(cellKey)).size,
    };
    if (c.kind === "numeric") {
      const nums = present.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (nums.length === 0) {
        Object.assign(info, { min: null, max: null, mean: null, sum: null });
      } else {
        let sum = 0;
        let min = nums[0];
        let max = nums[0];
        for (const x of nums) {
          sum += x;
          if (x < min) min = x;
          if (x > max) max = x;
        }
        Object.assign(info, { min, max, mean: Math.round((sum / nums.length) * 1e4) / 1e4, sum: Math.round(sum * 1e4) / 1e4 });
      }
    } else if (c.kind === "date") {
      const times = present.filter((v): v is Date => v instanceof Date).map((d) => d.getTime());
      if (times.length) {
        info.min = isoDate(new Date(Math.min(...times)));
        info.max = isoDate(new Date(Math.max(...times)));
      } else {
        info.min = null;
        info.max = null;
      }
    } else if (c.kind === "category" || c.kind === "boolean") {
      const counts = new Map<string, number>();
      for (const v of present) counts.set(cellKey(v), (counts.get(cellKey(v)) ?? 0) + 1);
      info.top = [...counts.entries()]
        .map(([value, count], i) => ({ value, count, i }))
        .sort((a, b) => b.count - a.count || a.i - b.i)
        .slice(0, TOP_N)
        .map(({ value, count }) => ({ value, count }));
    }
    return info;
  });
  return { name: t.name, row_count: rowCount, columns, duplicated_headers: t.duplicated_headers ?? [] };
}

export function datasetMeta(ds: LocalDataset): DatasetMeta {
  return {
    id: ds.id,
    name: ds.name,
    filename: ds.filename,
    kind: ds.kind,
    created_at: ds.created_at,
    tables: ds.tables.map((t) => ({ name: t.name, columns: t.columns.map((c) => c.name), row_count: t.rows.length })),
    text_chunks: 0,
  };
}

export function profileDataset(ds: LocalDataset): DatasetProfile {
  return { dataset: datasetMeta(ds), tables: ds.tables.map(profileTable), text_preview: [] };
}

/**
 * Numeric columns that look like measures, plus the date columns and a few
 * dimensions per table. Takes a profile or the dataset itself.
 */
export function candidateMetrics(input: DatasetProfile | LocalDataset): CandidateMetrics[] {
  const profile = "dataset" in input ? input : profileDataset(input);
  const out: CandidateMetrics[] = [];
  for (const t of profile.tables) {
    const numeric = t.columns.filter((c) => c.kind === "numeric").map((c) => c.name);
    const dates = t.columns.filter((c) => c.kind === "date").map((c) => c.name);
    const dims = t.columns.filter((c) => c.kind === "category" || c.kind === "boolean").map((c) => c.name);
    if (numeric.length) out.push({ table: t.name, metrics: numeric.slice(0, 8), date_columns: dates.slice(0, 3), dimensions: dims.slice(0, 6) });
  }
  return out;
}

export const NULL_GAP_THRESHOLD = 0.1;

/** Columns with more than 10% empty cells, tables without a numeric column, repeated header names. */
export function dataQualityGaps(input: DatasetProfile | LocalDataset): DataGap[] {
  const profile = "dataset" in input ? input : profileDataset(input);
  const gaps: DataGap[] = [];
  for (const t of profile.tables) {
    const tn = ltr(t.name);
    if (!t.columns.some((c) => c.kind === "numeric")) {
      gaps.push({
        kind: "no_numeric",
        table: t.name,
        title: {
          en: `Data gap: table ${t.name} has no numeric column`,
          ar: `فجوة في البيانات: لا يحتوي الجدول "${tn}" على عمود رقمي`,
        },
        en: `Table ${t.name} has no numeric column. No totals, trends or outliers can be computed for it.`,
        ar: `لا يحتوي الجدول "${tn}" على أي عمود رقمي، ولذلك يتعذر احتساب الإجماليات أو الاتجاهات أو القيم الشاذة له.`,
      });
    }
    if (t.duplicated_headers.length) {
      const names = t.duplicated_headers.join(", ");
      gaps.push({
        kind: "duplicate_header",
        table: t.name,
        title: {
          en: `Data gap: repeated column names in ${t.name}`,
          ar: `فجوة في البيانات: أسماء أعمدة مكررة في الجدول "${tn}"`,
        },
        en: `Table ${t.name} has repeated column names: ${names}. They were renamed with a numeric suffix.`,
        ar: `يحتوي الجدول "${tn}" على أسماء أعمدة مكررة: ${ltr(names)}. وقد أُعيدت تسميتها بإضافة لاحقة رقمية.`,
      });
    }
    for (const c of t.columns) {
      if (t.row_count > 0 && c.nulls / t.row_count > NULL_GAP_THRESHOLD) {
        const cn = ltr(c.name);
        gaps.push({
          kind: "nulls",
          table: t.name,
          column: c.name,
          nulls: c.nulls,
          rows: t.row_count,
          null_pct: c.null_pct,
          title: {
            en: `Data gap: ${c.null_pct}% of ${c.name} is empty`,
            ar: `فجوة في البيانات: ${c.null_pct}% من قيم "${cn}" فارغة`,
          },
          en: `Column ${c.name} in table ${t.name} has ${c.nulls} empty cells out of ${t.row_count} rows (${c.null_pct}%). Totals and averages that use it cover the filled rows only.`,
          ar: `يحتوي العمود "${cn}" في الجدول "${tn}" على ${c.nulls} خلية فارغة من أصل ${t.row_count} صفاً (${c.null_pct}%). وتغطي الإجماليات والمتوسطات التي تعتمد عليه الصفوف المعبأة فقط.`,
        });
      }
    }
  }
  return gaps;
}
