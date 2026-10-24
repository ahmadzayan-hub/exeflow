/**
 * The evidence gate, ported from `evidence_gate` in server/execflow/agents.py.
 * A finding passes only if it cites evidence that exists and every number in
 * its title and detail can be found in, or derived from, that evidence.
 */

import { round1, round2 } from "./util";

export interface EvidenceItem {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface GateInput {
  title?: string;
  detail?: string;
  evidence?: string[];
}

export interface GateResult {
  ok: boolean;
  reason: string;
}

/**
 * Numbers written in text: 14, 1,050, 98.5, -12.5. Numbers glued to letters
 * (Q2, W07, 2nd) are not numbers. A full stop at the end of a sentence is not
 * part of the number.
 */
const NUMBER = /(?<![\w.])-?\d+(?:,\d{3})*(?:\.\d+)?(?!\w)(?!\.\d)/g;

export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of (text ?? "").matchAll(NUMBER)) {
    const x = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(x)) out.push(x);
  }
  return out;
}

// Derivations the gate accepts, shared with the analyst so both compute them the same way.

/** Percentage change from a to b, one decimal. Null when a is zero. */
export function pctChange(a: number, b: number): number | null {
  const x = round2(a);
  return x === 0 ? null : round1(((round2(b) - x) / Math.abs(x)) * 100);
}

/** Difference b minus a, two decimals. */
export function diffOf(a: number, b: number): number {
  return round2(round2(b) - round2(a));
}

/** a as a percentage of b, one decimal. Null when b is zero. */
export function ratioPct(a: number, b: number): number | null {
  const y = round2(b);
  return y === 0 ? null : round1((round2(a) / y) * 100);
}

const MAX_LEAVES = 1000;

interface Pool {
  all: Set<number>;
  leaves: number[];
}

function collect(obj: unknown, pool: Pool, seenLeaves: Set<number>): void {
  if (typeof obj === "boolean" || obj === null || obj === undefined) return;
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) return;
    const v = round2(obj);
    pool.all.add(v);
    if (!seenLeaves.has(v)) {
      seenLeaves.add(v);
      if (v !== 0) pool.leaves.push(v);
    }
  } else if (typeof obj === "string") {
    for (const n of numbersIn(obj)) pool.all.add(round2(n));
  } else if (Array.isArray(obj)) {
    for (const x of obj) collect(x, pool, seenLeaves);
  } else if (typeof obj === "object") {
    for (const x of Object.values(obj as Record<string, unknown>)) collect(x, pool, seenLeaves);
  }
}

function derivedSet(leaves: number[]): Set<number> {
  const out = new Set<number>();
  const vals = leaves.slice(0, MAX_LEAVES);
  // A value against itself: a group that holds the whole total is 100%.
  if (vals.length > 0) out.add(100);
  for (const a of vals) {
    for (const b of vals) {
      if (a === b) continue;
      const p = pctChange(a, b);
      if (p !== null) out.add(Math.abs(p));
      out.add(Math.abs(diffOf(a, b)));
      const r = ratioPct(a, b);
      if (r !== null) out.add(Math.abs(r));
    }
  }
  return out;
}

export function evidenceGate(finding: GateInput, evidence: Record<string, EvidenceItem>): GateResult {
  const cited = finding.evidence ?? [];
  if (cited.length === 0) return { ok: false, reason: "cites no evidence" };
  const missing = cited.find((id) => !(id in evidence));
  if (missing !== undefined) return { ok: false, reason: `cites unknown evidence id ${missing}` };

  const pool: Pool = { all: new Set(), leaves: [] };
  const seen = new Set<number>();
  for (const id of cited) collect(evidence[id].result, pool, seen);
  const poolAbs = new Set([...pool.all].map((x) => Math.abs(x)));
  const largeValues = [...poolAbs].filter((p) => p >= 100);

  let derived: Set<number> | null = null;
  for (const n of numbersIn(`${finding.title ?? ""} ${finding.detail ?? ""}`)) {
    const v = Math.abs(round2(n));
    if (poolAbs.has(v)) continue;
    derived ??= derivedSet(pool.leaves);
    if (derived.has(v)) continue;
    // rounding of large values: 1049.7 quoted as 1050
    if (largeValues.some((p) => Math.abs(v - p) <= 0.5)) continue;
    return { ok: false, reason: `number ${n} not found in cited evidence` };
  }
  return { ok: true, reason: "numbers match evidence" };
}
