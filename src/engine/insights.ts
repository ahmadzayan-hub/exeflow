/**
 * The deterministic analyst. It replaces the language model of the Python
 * service: it picks metrics, dimensions and a date column from the profile,
 * runs the analytics tools, and writes findings from fixed rules. Every
 * finding goes through the evidence gate before it is shown. KPIs and charts
 * are built from the evidence rows, never from text.
 */

import type { ChartSpec, Finding, RunResult } from "../reporting/api";
import { evidenceGate, diffOf, pctChange, ratioPct, type EvidenceItem } from "./gate";
import { questionMatcher, type QuestionMatcher } from "./match";
import { datasetMeta, dataQualityGaps, profileTable, type ColumnProfile, type DataGap } from "./profile";
import { buildReport } from "./report";
import type { LocalDataset, LocalTable } from "./table";
import {
  barTitle,
  concentrationText,
  gapRecommendation,
  kpiLabels,
  lineTitle,
  moverText,
  noMatchWarning,
  noMetricWarning,
  outlierText,
  trendText,
  truncationWarning,
  type Lang,
  type MetricRef,
  type Polarity,
  type TextSet,
} from "./text";
import {
  periodLabel,
  runTool,
  type AggregateGrouped,
  type AggregateScalar,
  type Freq,
  type OutliersResult,
  type ToolArgsMap,
  type ToolName,
  type ToolResultMap,
  type TrendResult,
} from "./tools";
import { round2 } from "./util";

export interface AnalyseOptions {
  question?: string | null;
  lang: Lang;
  /** Used for the run id only. Defaults to the current time. */
  now?: Date | number;
}

type Severity = Finding["severity"];
type Kpi = RunResult["kpis"][number];

const MAX_TABLES = 2;
const MAX_METRICS = 3;
const MAX_DIMS = 2;
const MAX_CHARTS = 4;
const MAX_KPIS = 6;
const MAX_GAP_FINDINGS = 4;
const MAX_METRIC_FINDINGS = 12;
const MIN_CHANGE_PCT = 10;
const SHARE_FLOOR = 40;
const MIN_OUTLIER_POINTS = 6;
const MAX_PERIODS = 100;
const MAX_TREND_ROWS = 400;
const MAX_GROUPS_FOR_LINES = 8;

// ------------------------------------------------------------------ metric and dimension choice

const NOT_A_METRIC = /^(?:year|month|day|week|quarter|qtr|yr|sr|serial|no|rank|index|#|السنة|الشهر|اليوم)$/i;
const RATE = /%|(?<![a-z])rates?(?![a-z])|ratio|pct|percent|completion|availability|reliab|punctual|complian|score|avg|average|نسبة|معدل|اكتمال|جاهزية|توافر/i;
const COUNTISH =
  /count|amount|delay|cost|failure|minute|value|qty|quantity|total|number|incident|defect|fault|hours|aed|revenue|spend|budget|cases|events|عدد|مبلغ|تأخير|تكلف|أعطال|عطل|دقائق|قيمة|كمية|إجمالي/i;
const BAD_UP = /fail|delay|cost|incident|defect|fault|overdue|backlog|complaint|breach|late|downtime|outage|accident|error|عطل|أعطال|تأخير|تكلف|حادث|حوادث|خلل/i;
const GOOD_UP = /complet|availab|reliab|punctual|complian|satisf|uptime|score|جاهزية|اكتمال|التزام|توافر/i;

interface MetricInfo extends MetricRef {
  score: number;
  unit?: "%";
}

function classifyMetric(c: ColumnProfile, match: QuestionMatcher): MetricInfo | null {
  if (c.kind !== "numeric" || c.distinct < 2 || NOT_A_METRIC.test(c.name.trim())) return null;
  const rate = RATE.test(c.name);
  const polarity: Polarity = BAD_UP.test(c.name) && !rate ? "bad_up" : GOOD_UP.test(c.name) ? "good_up" : BAD_UP.test(c.name) ? "bad_up" : "neutral";
  const base = rate ? 1 : COUNTISH.test(c.name) ? 3 : 0;
  const within100 = typeof c.min === "number" && typeof c.max === "number" && c.min >= 0 && c.max <= 100;
  return {
    name: c.name,
    agg: rate ? "mean" : "sum",
    polarity,
    score: base + (match.matches(c.name) ? 10 : 0),
    ...(rate && within100 ? { unit: "%" as const } : {}),
  };
}

function pickMetrics(profile: ReturnType<typeof profileTable>, match: QuestionMatcher): MetricInfo[] {
  return profile.columns
    .map((c, i) => ({ info: classifyMetric(c, match), i }))
    .filter((x): x is { info: MetricInfo; i: number } => x.info !== null)
    .sort((a, b) => b.info.score - a.info.score || a.i - b.i)
    .slice(0, MAX_METRICS)
    .map((x) => x.info);
}

function pickDimensions(profile: ReturnType<typeof profileTable>, match: QuestionMatcher): string[] {
  return profile.columns
    .map((c, i) => ({ c, i, boost: match.matches(c.name) ? 1 : 0 }))
    .filter(({ c }) => c.kind === "category" && c.distinct >= 2 && c.distinct <= 30)
    .sort((a, b) => b.boost - a.boost || a.i - b.i)
    .slice(0, MAX_DIMS)
    .map(({ c }) => c.name);
}

function dayOf(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000);
}

/** Period size from the gaps between distinct dates; coarsened until there are at most 100 periods. */
function inferFreq(t: LocalTable, dateCol: string): Freq | null {
  const dates: Date[] = [];
  for (const r of t.rows) {
    const v = r[dateCol];
    if (v instanceof Date) dates.push(v);
  }
  const days = [...new Set(dates.map(dayOf))].sort((a, b) => a - b);
  if (days.length < 2) return null;
  const gaps = days.slice(1).map((d, i) => d - days[i]).sort((a, b) => a - b);
  const med = gaps[gaps.length >> 1];
  const order: Freq[] = ["D", "W", "M", "Q", "Y"];
  let idx = med <= 1.5 ? 0 : med <= 10 ? 1 : med <= 45 ? 2 : med <= 135 ? 3 : 4;
  const periods = (f: Freq): number => new Set(dates.map((d) => periodLabel(d, f))).size;
  while (idx < order.length - 1 && periods(order[idx]) > MAX_PERIODS) idx++;
  return order[idx];
}

// ------------------------------------------------------------------ evidence

class Book {
  readonly items: Record<string, EvidenceItem> = {};
  constructor(private readonly ds: LocalDataset) {}
  run<T extends ToolName>(tool: T, args: ToolArgsMap[T]): ToolResultMap[T] {
    const r = runTool(this.ds, tool, args);
    this.items[r.id] = { tool, args: r.args as unknown as Record<string, unknown>, result: r.result };
    return r.result;
  }
}

function groupedOf(b: Book, table: string, m: MetricRef, group_by: string): AggregateGrouped {
  return b.run("aggregate", { table, metric: m.name, agg: m.agg, group_by }) as AggregateGrouped;
}

const valueKey = (agg: string, metric: string): string => `${agg}_${metric}`;

interface Point {
  p: string;
  v: number;
}

function seriesOf(tr: TrendResult): Point[] {
  const key = valueKey(tr.agg, tr.metric);
  const out: Point[] = [];
  for (const r of tr.rows) {
    const v = r[key];
    if (typeof v === "number") out.push({ p: String(r.period), v });
  }
  return out;
}

// ------------------------------------------------------------------ drafts

type Rule = "concentration" | "trend" | "mover" | "outlier" | "gap";

interface Draft {
  rule: Rule;
  text: TextSet;
  metric: string | undefined;
  value: number | string | null;
  evidence: string[];
  severity: Severity;
  /** Size of the change or share, used to order findings of equal severity. */
  weight: number;
  /** Names the question can mention, with a weight. */
  entities: { name: string; weight: number }[];
}

function severityOf(change: number | null, share: number | null): Severity {
  const c = change === null ? 0 : Math.abs(change);
  const s = share ?? 0;
  if (c >= 30 || s >= 60) return "high";
  if (c >= 15 || s >= 40) return "medium";
  return "low";
}

const SEV_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
/** Within one severity: trends first, then movers, outliers, concentration, data gaps. */
const RULE_RANK: Record<Rule, number> = { trend: 0, mover: 1, outlier: 2, concentration: 3, gap: 4 };

interface MetricWork {
  info: MetricInfo;
  total: AggregateScalar;
  grouped: AggregateGrouped[];
  trend: TrendResult | null;
  trendByDim: TrendResult | null;
  outliers: OutliersResult | null;
}

interface TableWork {
  table: LocalTable;
  dims: string[];
  dateCol: string | null;
  freq: Freq | null;
  describeId: string;
  metrics: MetricWork[];
}

function workOnTable(b: Book, t: LocalTable, match: QuestionMatcher): TableWork | null {
  const profile = profileTable(t);
  const metrics = pickMetrics(profile, match);
  if (metrics.length === 0) return null;
  const dims = pickDimensions(profile, match);
  const dateCol = t.columns.find((c) => c.kind === "date")?.name ?? null;
  const freq = dateCol ? inferFreq(t, dateCol) : null;
  const describeId = b.run("describe_table", { table: t.name }).evidence_id;
  const dimCount = dims.length ? (profile.columns.find((c) => c.name === dims[0])?.distinct ?? 0) : 0;

  const work: MetricWork[] = metrics.map((info) => {
    const total = b.run("aggregate", { table: t.name, metric: info.name, agg: info.agg }) as AggregateScalar;
    const grouped = dims.map((d) => groupedOf(b, t.name, info, d));
    let trend: TrendResult | null = null;
    let trendByDim: TrendResult | null = null;
    if (dateCol && freq) {
      const tr = b.run("trend", { table: t.name, date_column: dateCol, metric: info.name, agg: info.agg, freq });
      if (tr.row_count >= 2 && tr.rows.length === tr.row_count) {
        trend = tr;
        if (dims[0] && tr.row_count * Math.max(1, dimCount) <= MAX_TREND_ROWS) {
          const g = b.run("trend", { table: t.name, date_column: dateCol, metric: info.name, agg: info.agg, freq, group_by: dims[0] });
          if (g.rows.length === g.row_count) trendByDim = g;
        }
      }
    }
    let out: OutliersResult | null = null;
    if (t.rows.length >= MIN_OUTLIER_POINTS) {
      const labels = [dims[0], dateCol].filter((x): x is string => typeof x === "string");
      const o = b.run("outliers", { table: t.name, column: info.name, ...(labels.length ? { label_columns: labels } : {}) });
      if (o.outlier_count > 0) out = o;
    }
    return { info, total, grouped, trend, trendByDim, outliers: out };
  });
  return { table: t, dims, dateCol, freq, describeId, metrics: work };
}

// ------------------------------------------------------------------ rules

function concentrationDrafts(mw: MetricWork): Draft[] {
  const out: Draft[] = [];
  if (mw.info.agg !== "sum") return out;
  const total = mw.total.value;
  if (total === null || total <= 0) return out;
  mw.grouped.forEach((g) => {
    const key = valueKey(g.agg, g.metric);
    const rows = g.rows.map((r) => ({ name: r[g.group_by] === null ? "(blank)" : String(r[g.group_by]), v: r[key] })).filter((r): r is { name: string; v: number } => typeof r.v === "number");
    if (rows.length < 2 || rows.length !== g.row_count || rows.some((r) => r.v < 0)) return;
    const top = rows[0];
    const share = ratioPct(top.v, total);
    if (share === null || share < SHARE_FLOOR) return;
    const second = rows[1];
    out.push({
      rule: "concentration",
      text: concentrationText({ m: mw.info, dim: g.group_by, top: top.name, share, v: round2(top.v), total: round2(total), groups: g.row_count, second: { name: second.name, value: round2(second.v) } }),
      metric: mw.info.name,
      value: share,
      evidence: [g.evidence_id, mw.total.evidence_id],
      severity: severityOf(null, share),
      weight: share,
      entities: [
        { name: mw.info.name, weight: 3 },
        { name: g.group_by, weight: 1 },
        { name: top.name, weight: 1 },
      ],
    });
  });
  return out;
}

function trendDraft(mw: MetricWork): Draft | null {
  if (!mw.trend) return null;
  const s = seriesOf(mw.trend);
  if (s.length < 2) return null;
  const last = s[s.length - 1];
  const prev = s[s.length - 2];
  const first = s[0];
  const pct = pctChange(prev.v, last.v);
  const overall = s.length >= 3 ? pctChange(first.v, last.v) : null;
  const lastIsBig = pct !== null && Math.abs(pct) >= MIN_CHANGE_PCT;
  const overallIsBig = overall !== null && Math.abs(overall) >= MIN_CHANGE_PCT;
  if (!lastIsBig && !overallIsBig) return null;
  const headline: "last" | "overall" = lastIsBig ? "last" : "overall";
  const head = headline === "last" ? (pct as number) : (overall as number);
  const peak = s.reduce((best, x) => (x.v > best.v ? x : best), s[0]);
  return {
    rule: "trend",
    text: trendText({ m: mw.info, lastP: last.p, prevP: prev.p, firstP: first.p, last: round2(last.v), prev: round2(prev.v), first: round2(first.v), pct, overall, peakV: round2(peak.v), peakP: peak.p, headline }),
    metric: mw.info.name,
    value: head,
    evidence: [mw.trend.evidence_id],
    severity: severityOf(head, null),
    weight: Math.abs(head),
    entities: [{ name: mw.info.name, weight: 3 }],
  };
}

function moverDraft(mw: MetricWork): Draft | null {
  if (!mw.trend || !mw.trendByDim) return null;
  const s = seriesOf(mw.trend);
  if (s.length < 2) return null;
  const lastP = s[s.length - 1].p;
  const prevP = s[s.length - 2].p;
  const g = mw.trendByDim;
  const gcol = g.group_by as string;
  const key = valueKey(g.agg, g.metric);
  const by = new Map<string, { prev?: number; last?: number }>();
  for (const r of g.rows) {
    const v = r[key];
    if (typeof v !== "number") continue;
    const name = String(r[gcol]);
    const e = by.get(name) ?? {};
    if (r.period === prevP) e.prev = v;
    if (r.period === lastP) e.last = v;
    by.set(name, e);
  }
  const moves = [...by.entries()]
    .filter((e): e is [string, { prev: number; last: number }] => e[1].prev !== undefined && e[1].last !== undefined)
    .map(([name, e]) => ({ name, prev: round2(e.prev), last: round2(e.last), diff: diffOf(e.prev, e.last), pct: pctChange(e.prev, e.last) }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || (a.name < b.name ? -1 : 1));
  if (moves.length < 2) return null;
  const top = moves[0];
  if (top.diff === 0) return null;
  if (top.pct === null ? top.last <= 0 : Math.abs(top.pct) < MIN_CHANGE_PCT) return null;
  const next = moves[1];
  return {
    rule: "mover",
    text: moverText({
      m: mw.info,
      group: top.name,
      prevP,
      lastP,
      prev: top.prev,
      last: top.last,
      diff: top.diff,
      pct: top.pct,
      ...(next.diff !== 0 ? { next: { name: next.name, diff: next.diff } } : {}),
    }),
    metric: mw.info.name,
    value: top.diff,
    evidence: [g.evidence_id],
    severity: top.pct === null ? "low" : severityOf(top.pct, null),
    weight: top.pct === null ? 0 : Math.abs(top.pct),
    entities: [
      { name: mw.info.name, weight: 3 },
      { name: gcol, weight: 1 },
      { name: top.name, weight: 1 },
    ],
  };
}

function outlierDraft(w: TableWork, mw: MetricWork): Draft | null {
  const o = mw.outliers;
  if (!o || o.rows.length === 0 || o.mean === null || o.lower_fence === null || o.upper_fence === null) return null;
  const r = o.rows[0];
  const value = r.value as number;
  const labelCols = [w.dims[0], w.dateCol].filter((x): x is string => typeof x === "string");
  const labelParts = labelCols.map((c) => r[c]).filter((v): v is string | number | boolean => v !== null && v !== undefined).map(String);
  const pct = pctChange(o.mean, value);
  return {
    rule: "outlier",
    text: outlierText({
      m: mw.info,
      count: o.outlier_count,
      who: labelParts.join(", "),
      row: r.row as number,
      value: round2(value),
      z: r.z as number,
      mean: o.mean,
      pctFromMean: pct,
      threshold: o.z_threshold,
      lower: o.lower_fence,
      upper: o.upper_fence,
    }),
    metric: mw.info.name,
    value: round2(value),
    evidence: [o.evidence_id],
    severity: severityOf(pct ?? 15, null),
    weight: pct === null ? 0 : Math.abs(pct),
    entities: [{ name: mw.info.name, weight: 3 }, ...labelParts.map((name) => ({ name, weight: 1 }))],
  };
}

function gapDrafts(b: Book, ds: LocalDataset): Draft[] {
  return dataQualityGaps(ds)
    .slice(0, MAX_GAP_FINDINGS)
    .map((g: DataGap): Draft => {
      const id = b.run("describe_table", { table: g.table }).evidence_id;
      const rec = gapRecommendation(g.kind, g.column);
      return {
        rule: "gap",
        text: { en: { title: g.title.en, detail: g.en, rec: rec.en }, ar: { title: g.title.ar, detail: g.ar, rec: rec.ar } },
        metric: g.column,
        value: g.null_pct ?? null,
        evidence: [id],
        severity: "low",
        weight: 0,
        entities: g.column ? [{ name: g.column, weight: 2 }, { name: g.table, weight: 1 }] : [{ name: g.table, weight: 1 }],
      };
    });
}

// ------------------------------------------------------------------ charts and KPIs from evidence

function barChart(g: AggregateGrouped, m: MetricRef, lang: Lang): ChartSpec | null {
  const key = valueKey(g.agg, g.metric);
  const points = g.rows
    .slice(0, 20)
    .filter((r) => typeof r[key] === "number")
    .map((r) => ({ x: r[g.group_by] === null ? "(blank)" : String(r[g.group_by]), y: r[key] as number }));
  if (points.length === 0) return null;
  return { type: "bar", title: barTitle(m, g.group_by, lang), series: [{ name: g.metric, points }], evidence: g.evidence_id };
}

function lineChart(tr: TrendResult, m: MetricRef, lang: Lang): ChartSpec | null {
  const key = valueKey(tr.agg, tr.metric);
  const toPoint = (r: TrendResult["rows"][number]) => ({ x: String(r.period), y: r[key] as number });
  const rows = tr.rows.filter((r) => typeof r[key] === "number");
  if (rows.length === 0) return null;
  const title = lineTitle(m, tr.freq, lang, tr.group_by ?? undefined);
  if (tr.group_by) {
    const series = new Map<string, { x: string; y: number }[]>();
    for (const r of rows) {
      const k = String(r[tr.group_by]);
      const arr = series.get(k) ?? [];
      arr.push(toPoint(r));
      series.set(k, arr);
    }
    return { type: "line", title, series: [...series.entries()].map(([name, points]) => ({ name, points })), evidence: tr.evidence_id };
  }
  return { type: "line", title, series: [{ name: tr.metric, points: rows.map(toPoint) }], evidence: tr.evidence_id };
}

function kpisFor(w: TableWork, mws: MetricWork[], lang: Lang): Kpi[] {
  const out: Kpi[] = [];
  const totalKpi = (mw: MetricWork): Kpi | null =>
    mw.total.value === null
      ? null
      : { label: kpiLabels("total", mw.info, "", lang), value: round2(mw.total.value), ...(mw.info.unit ? { unit: mw.info.unit } : {}), evidence: mw.total.evidence_id };
  const latestKpi = (mw: MetricWork): Kpi | null => {
    if (!mw.trend) return null;
    const s = seriesOf(mw.trend);
    if (s.length < 2) return null;
    const last = s[s.length - 1];
    const prev = s[s.length - 2];
    const pct = pctChange(prev.v, last.v);
    const trend: Kpi["trend"] = round2(last.v) === round2(prev.v) || (pct !== null && Math.abs(pct) < 1) ? "flat" : last.v > prev.v ? "up" : "down";
    return { label: kpiLabels("latest", mw.info, last.p, lang), value: round2(last.v), ...(mw.info.unit ? { unit: mw.info.unit } : {}), evidence: mw.trend.evidence_id, trend };
  };
  const first = mws[0];
  const push = (k: Kpi | null) => {
    if (k && out.length < MAX_KPIS) out.push(k);
  };
  push(totalKpi(first));
  push(latestKpi(first));
  const g = first.grouped[0];
  if (g && g.rows.length) {
    const top = g.rows[0][g.group_by];
    if (top !== null && top !== undefined) push({ label: kpiLabels("top", first.info, g.group_by, lang), value: String(top), evidence: g.evidence_id });
  }
  const rowsEv = w.describeId;
  push({ label: kpiLabels("rows", null, "", lang), value: w.table.rows.length, evidence: rowsEv });
  for (const mw of mws.slice(1)) {
    push(totalKpi(mw));
    push(latestKpi(mw));
  }
  return out;
}

// ------------------------------------------------------------------ main

function nowSeconds(): number {
  return typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000;
}

export function analyse(ds: LocalDataset, opts: AnalyseOptions): RunResult {
  const t0 = nowSeconds();
  const lang: Lang = opts.lang === "ar" ? "ar" : "en";
  const question = opts.question?.trim() ? opts.question.trim() : null;
  const when = opts.now instanceof Date ? opts.now : new Date(opts.now ?? Date.now());
  const match = questionMatcher(question);
  const book = new Book(ds);
  const warnings: string[] = [];
  const timings: Record<string, number> = {};

  // 1. profile and plan
  const works: TableWork[] = [];
  const bySize = [...ds.tables].sort((a, b) => b.rows.length - a.rows.length);
  for (const t of bySize) {
    if (works.length >= MAX_TABLES) break;
    const w = workOnTable(book, t, match);
    if (w) works.push(w);
  }
  for (const t of ds.tables) {
    if (t.source_rows && t.source_rows > t.rows.length) warnings.push(truncationWarning(t.name, t.source_rows, t.rows.length, lang));
  }
  if (works.length === 0) warnings.push(noMetricWarning(lang));
  timings.profile_s = round2(nowSeconds() - t0);

  // 2. analyst: rules over evidence
  const t1 = nowSeconds();
  const metricDrafts: Draft[] = [];
  for (const w of works) {
    for (const mw of w.metrics) {
      metricDrafts.push(...concentrationDrafts(mw));
      const tr = trendDraft(mw);
      if (tr) metricDrafts.push(tr);
      const mv = moverDraft(mw);
      if (mv) metricDrafts.push(mv);
      const ou = outlierDraft(w, mw);
      if (ou) metricDrafts.push(ou);
    }
  }
  const gaps = gapDrafts(book, ds);
  timings.analyst_s = round2(nowSeconds() - t1);

  // 3. reviewer: question boost, then the evidence gate on both languages
  const t2 = nowSeconds();
  const boost = (d: Draft): number => d.entities.reduce((s, e) => s + (match.matches(e.name) ? e.weight : 0), 0);
  const scored = [...metricDrafts, ...gaps].map((d, i) => ({ d, i, boost: boost(d), gap: d.rule === "gap" }));
  if (match.active && !scored.some((s) => s.boost > 0) && works.length > 0) warnings.push(noMatchWarning(lang));
  scored.sort(
    (a, b) =>
      Number(a.gap) - Number(b.gap) ||
      b.boost - a.boost ||
      SEV_RANK[a.d.severity] - SEV_RANK[b.d.severity] ||
      RULE_RANK[a.d.rule] - RULE_RANK[b.d.rule] ||
      b.d.weight - a.d.weight ||
      a.i - b.i,
  );
  let metricSeen = 0;
  const ordered = scored.filter((s) => s.gap || ++metricSeen <= MAX_METRIC_FINDINGS);

  const findings: Finding[] = [];
  const rejected: Finding[] = [];
  for (const { d } of ordered) {
    const f: Finding = {
      title: d.text[lang].title,
      detail: d.text[lang].detail,
      ...(d.metric !== undefined ? { metric: d.metric } : {}),
      value: d.value,
      evidence: d.evidence,
      severity: d.severity,
      recommendation: d.text[lang].rec,
      review: "rules + evidence gate",
    };
    const en = evidenceGate({ title: d.text.en.title, detail: d.text.en.detail, evidence: d.evidence }, book.items);
    const ar = evidenceGate({ title: d.text.ar.title, detail: d.text.ar.detail, evidence: d.evidence }, book.items);
    if (en.ok && ar.ok) findings.push(f);
    else rejected.push({ ...f, reason: `gate: ${en.ok ? ar.reason : en.reason}` });
  }
  timings.review_s = round2(nowSeconds() - t2);

  // 4. KPIs and charts from evidence rows
  const kpis = works.length ? kpisFor(works[0], works[0].metrics, lang) : [];
  const charts: ChartSpec[] = [];
  const addChart = (c: ChartSpec | null) => {
    if (c && charts.length < MAX_CHARTS) charts.push(c);
  };
  for (const w of works) {
    for (const mw of w.metrics) {
      if (mw.grouped[0]) addChart(barChart(mw.grouped[0], mw.info, lang));
      const groups = mw.trendByDim ? new Set(mw.trendByDim.rows.map((r) => String(r[mw.trendByDim?.group_by as string]))).size : 0;
      const tr = mw.trendByDim && groups <= MAX_GROUPS_FOR_LINES ? mw.trendByDim : mw.trend;
      if (tr) addChart(lineChart(tr, mw.info, lang));
    }
  }

  // keep only evidence that something refers to
  const used = new Set<string>();
  for (const f of [...findings, ...rejected]) f.evidence.forEach((e) => used.add(e));
  kpis.forEach((k) => used.add(k.evidence));
  charts.forEach((c) => used.add(c.evidence));
  const evidence: RunResult["evidence"] = {};
  for (const [id, item] of Object.entries(book.items)) if (used.has(id)) evidence[id] = item;

  const result: RunResult = {
    run_id: `local-${when.getTime()}`,
    dataset: datasetMeta(ds),
    question,
    lang,
    models: { analyst: "browser:rules", reviewer: "browser:evidence-gate", reporter: "browser:template" },
    findings,
    rejected,
    kpis,
    charts,
    report_md: "",
    evidence,
    memory_used: [],
    memory_written: [],
    timings,
    warnings,
  };
  const t3 = nowSeconds();
  result.report_md = buildReport(result, lang);
  timings.report_s = round2(nowSeconds() - t3);
  timings.total_s = round2(nowSeconds() - t0);
  return result;
}
