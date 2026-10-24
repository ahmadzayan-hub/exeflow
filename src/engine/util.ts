/** Small pure helpers shared by the engine. No Node APIs: this runs in the browser. */

import type { CellValue } from "./table";

export function round(x: number, digits: number): number {
  const f = 10 ** digits;
  const r = (Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * f)) / f;
  return r === 0 ? 0 : r;
}

export const round1 = (x: number): number => round(x, 1);
export const round2 = (x: number): number => round(x, 2);

/** Number as it is printed in findings: at most 2 decimals, no thousands separators. */
export function fmtNum(x: number): string {
  return String(round2(x));
}

export function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

/** UTC calendar date, YYYY-MM-DD. */
export function isoDate(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Text form of a cell, used for grouping, equality and counting. */
export function cellKey(v: CellValue | undefined): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isoDate(v);
  return String(v);
}

const AR_DIGITS = /[٠-٩۰-۹]/g;

/** Arabic-Indic and Persian digits and separators to ASCII, so "١٬٠٥٠" parses as 1,050. */
export function asciiDigits(s: string): string {
  return s
    .replace(AR_DIGITS, (c) => {
      const code = c.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

/** Deterministic JSON: sorted keys, dates as ISO, undefined dropped, non-finite numbers as null. */
export function stableStringify(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null) return "null";
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (typeof v === "number") return Number.isFinite(v) ? JSON.stringify(v) : "null";
  if (typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => stableStringify(x)).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return "null";
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = (1n << 64n) - 1n;

/** FNV-1a, 64 bit, over the UTF-8 bytes of the text. Returns 16 hex characters. */
export function fnv1a64(text: string): string {
  let h = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= BigInt(byte);
    h = (h * FNV_PRIME) & MASK64;
  }
  return h.toString(16).padStart(16, "0");
}

/** Evidence id: 10 hex characters from the hash of {tool, args}. */
export function evidenceId(tool: string, args: unknown): string {
  return fnv1a64(stableStringify({ tool, args })).slice(-10);
}

export function randomId(len = 12): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "").slice(0, len);
  let s = "";
  while (s.length < len) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

const LRI = "⁦";
const PDI = "⁩";

/**
 * Wraps a Latin or numeric token in a left-to-right isolate so it keeps its
 * order inside Arabic text. Arabic strings are left alone.
 */
export function ltr(s: string): string {
  return /[A-Za-z0-9]/.test(s) && !/[؀-ۿ]/.test(s) ? `${LRI}${s}${PDI}` : s;
}

export function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
