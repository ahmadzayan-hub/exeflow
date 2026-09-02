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
  projectId: string;
  kind: "milestone-overdue" | "contract-expiry" | "attention-overdue";
  title: { en: string; ar: string };
  days: number; // days overdue (positive) or days remaining (for expiry)
  reference?: string;
}

/** Flags computed from facts on file, not stored in the data. */
export function derivedFlags(p: Project, today: Date, expiryWindowDays = 90): DerivedFlag[] {
  const flags: DerivedFlag[] = [];
  for (const m of overdueMilestones(p, today)) {
    flags.push({
      projectId: p.id,
      kind: "milestone-overdue",
      title: { en: `Milestone overdue: ${m.title.en}`, ar: `معلم متأخر: ${m.title.ar ?? m.title.en}` },
      days: daysBetween(parseDate(m.planned)!, today),
    });
  }
  const remaining = daysToCompletion(p, today);
  if (remaining != null && remaining >= 0 && remaining <= expiryWindowDays && p.stage !== "closed") {
    flags.push({
      projectId: p.id,
      kind: "contract-expiry",
      title: {
        en: p.kind === "contract" ? "Contract expiry: renewal or retender decision" : "Planned completion approaching",
        ar: p.kind === "contract" ? "انتهاء العقد: قرار التجديد أو إعادة الطرح" : "اقتراب موعد الإنجاز المخطط",
      },
      days: remaining,
      reference: p.code ?? undefined,
    });
  }
  for (const a of p.attention) {
    if (isAttentionOverdue(a, today)) {
      flags.push({
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

export function summarise(portfolio: Portfolio, today: Date, periodStart: Date): PortfolioSummary {
  const rag: Record<Rag, number> = { green: 0, amber: 0, red: 0, grey: 0 };
  let knownValueAed = 0;
  let valueUnknown = 0;
  let needsDecision = 0;
  let waiting = 0;
  let overdue = 0;
  let closedThisPeriod = 0;
  let dueIn30 = 0;
  let expiringIn90 = 0;
  let projects = 0;
  let contracts = 0;

  for (const p of portfolio.projects) {
    if (p.kind === "contract") contracts++;
    else projects++;
    if (p.valueAed != null) knownValueAed += p.valueAed;
    else valueUnknown++;
    rag[scheduleRag(p, today)]++;
    for (const a of p.attention) {
      if (a.status === "open" && a.type === "decision") needsDecision++;
      if (a.status === "open" && a.type === "waiting") waiting++;
      const closed = parseDate(a.closedOn);
      if (a.status === "closed" && closed && closed >= periodStart && closed <= today) closedThisPeriod++;
    }
    const flags = derivedFlags(p, today);
    overdue += flags.filter((f) => f.kind !== "contract-expiry").length;
    expiringIn90 += flags.filter((f) => f.kind === "contract-expiry").length;
    dueIn30 += upcomingMilestones(p, today, 30).length;
  }
  return {
    projects,
    contracts,
    knownValueAed,
    valueUnknown,
    rag,
    needsDecision,
    waiting,
    overdue,
    closedThisPeriod,
    dueIn30,
    expiringIn90,
  };
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
