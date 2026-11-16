/**
 * File ingestion in the browser: CSV, TSV and XLSX into typed tables.
 * Mirrors server/execflow/ingest.py (header detection in the first 15 rows,
 * numeric coercion of "1,050" and "98%", ISO date coercion).
 */

import type { CellValue, DatasetKind, LocalColumn, LocalDataset, LocalRow, LocalTable } from "./table";
import { inferKind } from "./profile";
import { asciiDigits, randomId } from "./util";

export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 200_000;
const HEADER_SCAN_ROWS = 15;
const COERCE_SHARE = 0.8;

const NEEDS_SERVICE = "PDF and DOCX files need the ExecFlow analytics service. This browser-only version reads XLSX, CSV and TSV files.";

// ------------------------------------------------------------------ CSV

type Raw = unknown;
type RawRow = Raw[];

/** RFC 4180 reader: quoted fields, doubled quotes, CRLF/LF/CR, newlines inside quotes. */
function readDelimited(text: string, delimiter: string, maxRows = Infinity): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldHadQuote = false;
  const n = text.length;
  const endField = () => {
    row.push(field);
    field = "";
    fieldHadQuote = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "" && !fieldHadQuote) {
      inQuotes = true;
      fieldHadQuote = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
      if (rows.length >= maxRows) return rows;
    } else if (ch === "\n") {
      endRow();
      if (rows.length >= maxRows) return rows;
    } else {
      field += ch;
    }
  }
  if (field !== "" || fieldHadQuote || row.length > 0) endRow();
  return rows;
}

const CANDIDATE_DELIMITERS = [",", ";", "\t"] as const;

/** Picks the delimiter that gives the most rows of one consistent width above 1. */
export function detectDelimiter(text: string): string {
  const sample = text.length > 200_000 ? text.slice(0, 200_000) : text;
  let best = ",";
  let bestScore = 0;
  for (const d of CANDIDATE_DELIMITERS) {
    const rows = readDelimited(sample, d, 40).filter((r) => r.some((c) => c.trim() !== ""));
    const widths = new Map<number, number>();
    for (const r of rows) widths.set(r.length, (widths.get(r.length) ?? 0) + 1);
    let modeWidth = 0;
    let modeCount = 0;
    for (const [w, c] of widths) {
      if (w >= 2 && (c > modeCount || (c === modeCount && w > modeWidth))) {
        modeWidth = w;
        modeCount = c;
      }
    }
    const score = modeCount * 1000 + modeWidth;
    if (modeWidth >= 2 && score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/** Parses CSV text into raw string rows. The delimiter is detected when not given. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return readDelimited(clean, delimiter ?? detectDelimiter(clean));
}

// ------------------------------------------------------------------ coercion

const NA_TOKENS = new Set(["", "na", "n/a", "#n/a", "nan", "null", "none"]);

function normaliseCell(v: Raw, fromText: boolean): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return null;
    if (fromText && NA_TOKENS.has(s.toLowerCase())) return null;
    return s;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  return String(v);
}

const PLAIN_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const GROUPED_NUMBER = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

/** "1,050" -> 1050, "98%" -> 98. Anything else that is not a plain number gives null. */
export function parseNumeric(input: string): number | null {
  let s = asciiDigits(input).trim();
  if (s.endsWith("%")) s = s.slice(0, -1).trim();
  if (s === "") return null;
  if (GROUPED_NUMBER.test(s)) s = s.replace(/,/g, "");
  if (!PLAIN_NUMBER.test(s)) return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}

const ISO_DATE = /^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const DMY_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

function utcDate(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

/** ISO dates (2026-05-01, 2026/05/01, 2026-05, with optional time). */
export function parseIsoDate(input: string): Date | null {
  const m = ISO_DATE.exec(asciiDigits(input).trim());
  if (!m) return null;
  return utcDate(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 1, Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
}

/**
 * Parses a date written as text. 01/05/2026 style dates are read day first
 * (UAE convention) unless `monthFirst` is set.
 */
export function parseDateText(input: string, monthFirst = false): Date | null {
  const iso = parseIsoDate(input);
  if (iso) return iso;
  const m = DMY_DATE.exec(asciiDigits(input).trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return monthFirst ? utcDate(Number(m[3]), a, b) : utcDate(Number(m[3]), b, a);
}

/** Month-first only when the column proves it (a second part above 12 and no first part above 12). */
function prefersMonthFirst(texts: string[]): boolean {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const t of texts) {
    const m = DMY_DATE.exec(asciiDigits(t).trim());
    if (!m) continue;
    if (Number(m[1]) > 12) firstOver12 = true;
    if (Number(m[2]) > 12) secondOver12 = true;
  }
  return secondOver12 && !firstOver12;
}

function textOf(v: Exclude<CellValue, null>): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** Numbers and dates stored as text become typed columns when at least 80% of the values parse. */
function coerceColumn(values: CellValue[]): CellValue[] {
  const present = values.filter((v) => v !== null);
  if (present.length === 0) return values;
  if (present.every((v) => typeof v === "number" || typeof v === "boolean" || v instanceof Date)) {
    // Nothing stored as text; keep the sheet's own types.
    const mixed = new Set(present.map((v) => (v instanceof Date ? "d" : typeof v)));
    if (mixed.size === 1) return values;
  }
  const texts = values.map((v) => (v === null ? null : typeof v === "string" ? v : textOf(v)));
  const need = Math.max(1, COERCE_SHARE * present.length);

  const nums = values.map((v) => {
    if (v === null) return null;
    if (typeof v === "number") return v;
    if (v instanceof Date || typeof v === "boolean") return null;
    return parseNumeric(v);
  });
  if (nums.filter((x) => x !== null).length >= need) return nums;

  const monthFirst = prefersMonthFirst(texts.filter((t): t is string => t !== null));
  const dates = values.map((v) => {
    if (v === null) return null;
    if (v instanceof Date) return v;
    if (typeof v === "string") return parseDateText(v, monthFirst);
    return null;
  });
  if (dates.filter((x) => x !== null).length >= need) return dates;

  // Stays text: make the column uniform so grouping is predictable.
  return values.map((v) => (v === null ? null : typeof v === "string" ? v : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)));
}

// ------------------------------------------------------------------ header detection

function looksTyped(s: string): boolean {
  return parseNumeric(s) !== null || parseIsoDate(s) !== null;
}

/**
 * Row index that looks like a header: mostly filled cells, mostly text, within
 * the first 15 rows. Numbers and dates written as text count as data, as they
 * would after an Excel read.
 */
export function findHeader(raw: CellValue[][]): number {
  const width = raw.reduce((w, r) => Math.max(w, r.length), 0);
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, raw.length); i++) {
    const row = raw[i];
    const nonNull = row.filter((v) => v !== null).length;
    if (nonNull === 0) continue;
    const strings = row.filter((v) => typeof v === "string" && !looksTyped(v)).length;
    const score = strings / Math.max(1, width) + (nonNull / Math.max(1, width)) * 0.5;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

export function slug(s: string): string {
  const out = String(s)
    .replace(/[^A-Za-z0-9؀-ۿ]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return out.slice(0, 60) || "table";
}

interface Built {
  table: LocalTable | null;
}

function buildTable(name: string, rawRows: RawRow[], fromText: boolean): Built {
  const raw: CellValue[][] = rawRows.map((r) => r.map((v) => normaliseCell(v, fromText)));
  if (raw.length === 0) return { table: null };
  const h = findHeader(raw);
  const width = raw.reduce((w, r) => Math.max(w, r.length), 0);

  // Header names: blanks and "Unnamed" become "col"; repeats get _1, _2 ...
  const seen = new Map<string, number>();
  const duplicated = new Set<string>();
  const names: string[] = [];
  for (let c = 0; c < width; c++) {
    const cell = raw[h][c];
    let n = cell === null || cell === undefined ? "" : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell).trim();
    if (!n || n.toLowerCase().startsWith("unnamed")) n = "col";
    const count = seen.get(n);
    if (count !== undefined) {
      seen.set(n, count + 1);
      duplicated.add(n);
      n = `${n}_${count + 1}`;
    } else {
      seen.set(n, 0);
    }
    names.push(n);
  }

  let body = raw.slice(h + 1).map((r) => {
    const out: CellValue[] = new Array<CellValue>(width).fill(null);
    for (let c = 0; c < width; c++) out[c] = r[c] ?? null;
    return out;
  });
  body = body.filter((r) => r.some((v) => v !== null));
  const keep = names.map((_, c) => body.some((r) => r[c] !== null));
  const keptIdx = keep.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
  if (keptIdx.length === 0 || body.length === 0) return { table: null };

  const sourceRows = body.length;
  let warning: string | undefined;
  if (body.length > MAX_ROWS) {
    body = body.slice(0, MAX_ROWS);
    warning = `Table ${name} has ${sourceRows} rows. Only the first ${MAX_ROWS} rows were read.`;
  }

  const columns: LocalColumn[] = [];
  const cols: CellValue[][] = [];
  for (const c of keptIdx) {
    const coerced = coerceColumn(body.map((r) => r[c]));
    cols.push(coerced);
    columns.push({ name: names[c], kind: inferKind(names[c], coerced) });
  }
  const rows: LocalRow[] = body.map((_, i) => {
    const rec: LocalRow = {};
    columns.forEach((col, k) => {
      rec[col.name] = cols[k][i];
    });
    return rec;
  });
  const table: LocalTable = { name, columns, rows };
  if (warning) {
    table.warning = warning;
    table.source_rows = sourceRows;
  }
  const dups = [...duplicated].filter((d) => keptIdx.some((c) => names[c] === `${d}_1`));
  if (dups.length) table.duplicated_headers = dups;
  return { table };
}

/** Builds a table from raw rows (strings, numbers, booleans, Dates or null). Returns null when nothing usable is there. */
export function tableFromRaw(name: string, rows: Raw[][], fromText = false): LocalTable | null {
  return buildTable(name, rows, fromText).table;
}

// ------------------------------------------------------------------ file loading

function extensionOf(filename: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename.trim());
  return m ? `.${m[1].toLowerCase()}` : "";
}

function stem(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.replace(/\.[^.]+$/, "") || base;
}

function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      // Excel on Arabic Windows writes windows-1256 when "CSV" is chosen instead of "CSV UTF-8".
      return new TextDecoder("windows-1256").decode(bytes);
    } catch {
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
}

function toBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  return data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

async function readXlsxSheets(bytes: Uint8Array): Promise<{ sheet: string; data: unknown[][] }[]> {
  // Loaded on demand so the reader is code-split and only fetched when a workbook is opened.
  const mod = await import("read-excel-file/universal");
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  try {
    const sheets = await mod.default(copy);
    return sheets.map((s) => ({ sheet: s.sheet, data: s.data as unknown as unknown[][] }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`The XLSX file could not be read (${msg}). Check that it is a valid .xlsx workbook and not password protected.`);
  }
}

function uniqueName(name: string, used: Set<string>): string {
  let n = name;
  let i = 2;
  while (used.has(n)) n = `${name}_${i++}`;
  used.add(n);
  return n;
}

/** Loads a file from raw bytes. This is what tests and `loadFile` use. */
export async function loadBuffer(filename: string, data: ArrayBuffer | ArrayBufferView): Promise<LocalDataset> {
  const ext = extensionOf(filename);
  if (ext === ".pdf" || ext === ".docx") throw new Error(NEEDS_SERVICE);
  if (ext === ".xls") throw new Error("Legacy .xls files are not supported. Save the workbook as .xlsx or .csv and open it again.");
  if (![".xlsx", ".xlsm", ".csv", ".tsv"].includes(ext)) {
    throw new Error(`Unsupported file type '${ext || "unknown"}'. Supported: .xlsx, .csv, .tsv. PDF and DOCX need the ExecFlow analytics service.`);
  }
  const bytes = toBytes(data);
  if (bytes.byteLength === 0) throw new Error("The file is empty.");
  if (bytes.byteLength > MAX_BYTES) throw new Error(`The file is larger than ${MAX_BYTES / 1024 / 1024} MB. Split it or remove unused sheets and open it again.`);

  const kind: DatasetKind = ext === ".csv" ? "csv" : ext === ".tsv" ? "tsv" : "xlsx";
  const tables: LocalTable[] = [];
  if (kind === "xlsx") {
    const used = new Set<string>();
    for (const s of await readXlsxSheets(bytes)) {
      const t = tableFromRaw(uniqueName(slug(s.sheet), used), s.data);
      if (t) tables.push(t);
    }
  } else {
    const text = decodeText(bytes);
    if (text.trim() === "") throw new Error("The file is empty.");
    const t = tableFromRaw("data", parseCsv(text, kind === "tsv" ? "\t" : undefined), true);
    if (t) tables.push(t);
  }
  if (tables.length === 0) throw new Error("No table was found in the file. Check that it has a header row and at least one row of data.");

  return { id: randomId(12), name: stem(filename), filename, kind, tables, created_at: new Date().toISOString().slice(0, 19) + "+00:00" };
}

function readBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  // Older DOM implementations (and some test environments) have no Blob.arrayBuffer.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsArrayBuffer(file);
  });
}

/** Loads a file chosen in the browser. */
export async function loadFile(file: File): Promise<LocalDataset> {
  return loadBuffer(file.name, await readBytes(file));
}
