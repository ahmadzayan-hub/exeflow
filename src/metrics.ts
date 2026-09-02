import type { AttentionItem, Milestone, Portfolio, Project, Rag } from "./types";

export const DAY_MS = 86_400_000;

export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** Share of contract duration elapsed, 0..100, or null when dates are missing. */
export function timeElapsedPct(p: Project, today: Date): number | null {
  const start = parseDate(p.ntp);
  const end = parseDate(p.completion);
  if (!start || !end || end <= start) return null;
  const pct = ((today.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function daysToCompletion(p: Project, today: Date): number | null {
  const end = parseDate(p.completion);
  return end ? daysBetween(today, end) : null;
}

export function isMilestoneOverdue(m: Milestone, today: Date): boolean {
  if (m.status === "done") return false;
  const planned = parseDate(m.planned);
  return !!planned && planned < today;
}

export function overdueMilestones(p: Project, today: Date): Milestone[] {
  return p.milestones.filter((m) => isMilestoneOverdue(m, today));
}

export function upcomingMilestones(p: Project, today: Date, windowDays = 30): Milestone[] {
  return p.milestones.filter((m) => {
    if (m.status === "done") return false;
    const planned = parseDate(m.planned);
    if (!planned) return false;
    const d = daysBetween(today, planned);
    return d >= 0 && d <= windowDays;
  });
}

export function nextMilestone(p: Project, today: Date): Milestone | null {
  const open = p.milestones
    .filter((m) => m.status !== "done" && parseDate(m.planned))
    .sort((a, b) => parseDate(a.planned)!.getTime() - parseDate(b.planned)!.getTime());
  return open.find((m) => parseDate(m.planned)! >= today) ?? open[0] ?? null;
}

/** Schedule variance in percentage points (actual minus planned), or null. */
export function scheduleVariance(p: Project): number | null {
  const { planned, actual } = p.progress;
  if (planned == null || actual == null) return null;
  return Math.round((actual - planned) * 10) / 10;
}

/**
 * Schedule RAG.
 * With progress data: variance >= -2 green, >= -10 amber, else red.
 * Without progress data: derived from milestones only; grey when nothing can be assessed.
 */
export function scheduleRag(p: Project, today: Date): Rag {
  if (p.stage === "closed") return "green";
  const v = scheduleVariance(p);
  if (v != null) {
    if (v >= -2) return "green";
    if (v >= -10) return "amber";
    return "red";
  }
  const overdue = overdueMilestones(p, today);
  if (overdue.length === 0) return p.milestones.some((m) => m.status === "at-risk") ? "amber" : "grey";
  const worst = Math.max(...overdue.map((m) => daysBetween(parseDate(m.planned)!, today)));
  return worst > 60 ? "red" : "amber";
}

export function isAttentionOverdue(a: AttentionItem, today: Date): boolean {
  if (a.status !== "open") return false;
  const due = parseDate(a.due);
  return !!due && due < today;
}

export interface DerivedFlag {
  id: string;
  projectId: string;
  kind: "milestone-overdue" | "contract-expiry" | "completion-approaching" | "attention-overdue";
  title: { en: string; ar: string };
  days: number; // days overdue (positive) or days remaining (for expiry)
  reference?: string;
}

/** Flags computed from facts on file, not stored in the data. */
export function derivedFlags(p: Project, today: Date, expiryWindowDays = 90): DerivedFlag[] {
  const flags: DerivedFlag[] = [];
  for (const m of overdueMilestones(p, today)) {
    flags.push({
      id: `milestone-overdue:${m.id}`,
      projectId: p.id,
      kind: "milestone-overdue",
      title: { en: `Milestone overdue: ${m.title.en}`, ar: `معلم متأخر: ${m.title.ar ?? m.title.en}` },
      days: daysBetween(parseDate(m.planned)!, today),
    });
  }
  const remaining = daysToCompletion(p, today);
  if (remaining != null && remaining >= 0 && remaining <= expiryWindowDays && p.stage !== "closed") {
    // Only a contract end is a decision (renew, extend or retender); a project completion is information.
    flags.push(
      p.kind === "contract"
        ? {
            id: "contract-expiry",
            projectId: p.id,
            kind: "contract-expiry",
            title: { en: "Contract expiry: renewal or retender decision", ar: "انتهاء العقد: قرار التجديد أو إعادة الطرح" },
            days: remaining,
            reference: p.code ?? undefined,
          }
        : {
            id: "completion-approaching",
            projectId: p.id,
            kind: "completion-approaching",
            title: { en: "Planned completion approaching", ar: "اقتراب موعد الإنجاز المخطط" },
            days: remaining,
            reference: p.code ?? undefined,
          },
    );
  }
  for (const a of p.attention) {
    if (isAttentionOverdue(a, today)) {
      flags.push({
        id: `attention-overdue:${a.id}`,
        projectId: p.id,
        kind: "attention-overdue",
        title: { en: a.title.en, ar: a.title.ar ?? a.title.en },
        days: daysBetween(parseDate(a.due)!, today),
        reference: a.reference,
      });
    }
  }
  return flags;
}

/**
 * One classification of a project's open items, shared by the tiles, the
 * attention panel and the filters so their counts always agree.
 */
export interface AttentionBuckets {
  /** open decisions not yet past due, plus a contract-expiry flag when present */
  decisions: AttentionItem[];
  waiting: AttentionItem[];
  /** open items past their due date (any type) */
  overdueItems: AttentionItem[];
  flags: DerivedFlag[];
  contractExpiry: DerivedFlag | null;
  /** overdue items + overdue milestones */
  overdueCount: number;
}

export function attentionBuckets(p: Project, today: Date): AttentionBuckets {
  const open = p.attention.filter((a) => a.status === "open");
  const overdueItems = open.filter((a) => isAttentionOverdue(a, today));
  const current = open.filter((a) => !isAttentionOverdue(a, today));
  const flags = derivedFlags(p, today);
  const contractExpiry = flags.find((f) => f.kind === "contract-expiry") ?? null;
  return {
    decisions: current.filter((a) => a.type === "decision"),
    waiting: current.filter((a) => a.type === "waiting"),
    overdueItems,
    flags,
    contractExpiry,
    overdueCount: overdueItems.length + flags.filter((f) => f.kind === "milestone-overdue").length,
  };
}

export function needsDecisionCount(b: AttentionBuckets): number {
  return b.decisions.length + (b.contractExpiry ? 1 : 0);
}

/** Reporting window: explicit start/end when given, otherwise the calendar month of the as-of date. */
export function reportingWindow(portfolio: Portfolio): { start: Date; end: Date } {
  const asOf = parseDate(portfolio.reportingPeriod.asOf) ?? new Date();
  const start = parseDate(portfolio.reportingPeriod.start);
  const end = parseDate(portfolio.reportingPeriod.end);
  if (start && end && end >= start) return { start, end };
  const s = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const e = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0));
  return { start: s, end: e };
}

export interface PortfolioSummary {
  projects: number;
  contracts: number;
  knownValueAed: number;
  valueUnknown: number;
  rag: Record<Rag, number>;
  needsDecision: number;
  waiting: number;
  overdue: number;
  closedThisPeriod: number;
  dueIn30: number;
  expiringIn90: number;
}

export function summarise(portfolio: Portfolio, today: Date): PortfolioSummary {
  const { start, end } = reportingWindow(portfolio);
  const rag: Record<Rag, number> = { green: 0, amber: 0, red: 0, grey: 0 };
  const s: PortfolioSummary = {
    projects: 0,
    contracts: 0,
    knownValueAed: 0,
    valueUnknown: 0,
    rag,
    needsDecision: 0,
    waiting: 0,
    overdue: 0,
    closedThisPeriod: 0,
    dueIn30: 0,
    expiringIn90: 0,
  };

  for (const p of portfolio.projects) {
    if (p.kind === "contract") s.contracts++;
    else s.projects++;
    if (p.valueAed != null) s.knownValueAed += p.valueAed;
    else s.valueUnknown++;
    rag[scheduleRag(p, today)]++;
    const b = attentionBuckets(p, today);
    s.needsDecision += needsDecisionCount(b);
    s.waiting += b.waiting.length;
    s.overdue += b.overdueCount;
    if (b.contractExpiry) s.expiringIn90++;
    for (const a of p.attention) {
      const closed = parseDate(a.closedOn);
      if (a.status === "closed" && closed && closed >= start && closed <= end) s.closedThisPeriod++;
    }
    s.dueIn30 += upcomingMilestones(p, today, 30).length;
  }
  return s;
}

export function formatAed(v: number | null | undefined, lang: "en" | "ar" = "en"): string {
  if (v == null) return lang === "ar" ? "غير محدد" : "TBC";
  if (v >= 1_000_000) return `AED ${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 2)}M`;
  if (v >= 1_000) return `AED ${(v / 1_000).toFixed(0)}K`;
  return `AED ${v}`;
}

export function formatDate(iso: string | null | undefined, lang: "en" | "ar" = "en"): string {
  const d = parseDate(iso);
  if (!d) return lang === "ar" ? "غير محدد" : "TBC";
  return d.toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
