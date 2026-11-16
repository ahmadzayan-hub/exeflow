/**
 * Optional narration through a serverless endpoint (`/api/narrate`). The
 * deterministic report always exists; this only offers a smoother rewrite.
 * The reply is checked with the same numeric rule as the evidence gate: a
 * number that is not in the payload sends the caller back to the template
 * report.
 *
 * Contract
 *   GET  /api/narrate -> { enabled: boolean }
 *   POST /api/narrate  { lang, question, dataset, findings, kpis, gaps }
 *        header `x-execflow-key` (optional) -> { report_md: string, model: string }
 */

import type { RunResult } from "../reporting/api";
import { numbersIn } from "./gate";
import { round2 } from "./util";

export const NARRATE_ENDPOINT = "/api/narrate";

export interface NarratePayload {
  lang: "en" | "ar";
  question: string | null;
  dataset: { name: string; tables: { name: string; row_count: number }[] };
  findings: { title: string; detail: string; severity: "high" | "medium" | "low"; recommendation?: string }[];
  kpis: RunResult["kpis"];
  gaps: string[];
}

export interface NarrateOptions {
  fetchImpl?: typeof fetch;
  accessKey?: string;
  endpoint?: string;
}

export type NarrateResult =
  | { ok: true; report_md: string; model: string }
  | { ok: false; reason: string; report_md: undefined };

/** Builds the request body from a finished run. Gap findings go in `gaps`, not in `findings`. */
export function buildNarratePayload(result: RunResult): NarratePayload {
  const isGap = (f: RunResult["findings"][number]): boolean => f.evidence.length > 0 && f.evidence.every((id) => result.evidence[id]?.tool === "describe_table");
  return {
    lang: result.lang,
    question: result.question,
    dataset: { name: result.dataset.name, tables: result.dataset.tables.map((t) => ({ name: t.name, row_count: t.row_count })) },
    findings: result.findings.filter((f) => !isGap(f)).map((f) => ({ title: f.title, detail: f.detail, severity: f.severity, ...(f.recommendation ? { recommendation: f.recommendation } : {}) })),
    kpis: result.kpis,
    gaps: result.findings.filter(isGap).map((f) => `${f.title}. ${f.detail}`),
  };
}

function collectStrings(v: unknown, out: string[]): void {
  if (typeof v === "string") out.push(v);
  else if (typeof v === "number") out.push(String(v));
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach((x) => collectStrings(x, out));
}

/** Numbers the narration may use: everything in the payload, plus counting numbers up to the number of findings. */
export function allowedNumbers(payload: NarratePayload): Set<number> {
  const strings: string[] = [];
  collectStrings(payload, strings);
  const allowed = new Set<number>();
  for (const s of strings) for (const n of numbersIn(s)) allowed.add(Math.abs(round2(n)));
  const limit = payload.findings.length + payload.gaps.length + payload.kpis.length;
  for (let i = 0; i <= limit; i++) allowed.add(i);
  return allowed;
}

/** Markdown list markers (1. 2.) are layout, not claims. */
function withoutListMarkers(md: string): string {
  return md.replace(/^\s*\d+[.)]\s+/gm, "");
}

export function checkNarration(md: string, payload: NarratePayload): { ok: true } | { ok: false; reason: string } {
  const allowed = allowedNumbers(payload);
  for (const n of numbersIn(withoutListMarkers(md))) {
    if (!allowed.has(Math.abs(round2(n)))) return { ok: false, reason: `number ${n} is not in the findings, KPIs or dataset` };
  }
  return { ok: true };
}

function endpointOf(o?: NarrateOptions): string {
  return o?.endpoint ?? NARRATE_ENDPOINT;
}

export async function isNarrationAvailable(fetchImpl?: typeof fetch): Promise<boolean> {
  const f = fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);
  if (!f) return false;
  try {
    const res = await f(NARRATE_ENDPOINT, { method: "GET", headers: { Accept: "application/json" } });
    if (!res.ok) return false;
    const body = (await res.json()) as { enabled?: unknown };
    return body.enabled === true;
  } catch {
    return false;
  }
}

export async function narrate(payload: NarratePayload, opts: NarrateOptions = {}): Promise<NarrateResult> {
  const f = opts.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);
  if (!f) throw new Error("fetch is not available in this environment");
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (opts.accessKey) headers["x-execflow-key"] = opts.accessKey;
  const res = await f(endpointOf(opts), { method: "POST", headers, body: JSON.stringify(payload) });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown; error?: unknown };
      detail = String(body.detail ?? body.error ?? detail);
    } catch {
      /* keep the status text */
    }
    throw new Error(`Narration failed (${res.status}): ${detail}`);
  }
  let body: { report_md?: unknown; model?: unknown };
  try {
    body = (await res.json()) as { report_md?: unknown; model?: unknown };
  } catch {
    throw new Error("Narration failed: the reply was not JSON.");
  }
  if (typeof body.report_md !== "string" || body.report_md.trim() === "") throw new Error("Narration failed: the reply has no report_md.");
  const verdict = checkNarration(body.report_md, payload);
  if (!verdict.ok) return { ok: false, reason: verdict.reason, report_md: undefined };
  return { ok: true, report_md: body.report_md, model: typeof body.model === "string" ? body.model : "unknown" };
}
