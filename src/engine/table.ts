/** Typed in-memory tables. Everything the engine reports is recomputable from these. */

export type CellValue = string | number | boolean | Date | null;

export type ColumnKind = "numeric" | "date" | "category" | "text" | "identifier" | "boolean";

export interface LocalColumn {
  name: string;
  kind: ColumnKind;
}

export type LocalRow = Record<string, CellValue>;

export interface LocalTable {
  name: string;
  columns: LocalColumn[];
  rows: LocalRow[];
  /** Set when the table was cut to the row cap. */
  warning?: string;
  /** Row count in the source before the cap was applied. */
  source_rows?: number;
  /** Header names that occurred more than once in the source (they were renamed with a numeric suffix). */
  duplicated_headers?: string[];
}

export type DatasetKind = "xlsx" | "csv" | "tsv";

export interface LocalDataset {
  id: string;
  name: string;
  filename: string;
  kind: DatasetKind;
  tables: LocalTable[];
  created_at: string;
}

export interface Bilingual {
  en: string;
  ar: string;
}

export function getTable(ds: LocalDataset, name: string): LocalTable {
  const t = ds.tables.find((x) => x.name === name);
  if (!t) throw new Error(`unknown table '${name}'; available: ${JSON.stringify(ds.tables.map((x) => x.name))}`);
  return t;
}
