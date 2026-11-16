import { INBOX_ID, attentionBuckets, attentionProjects, daysBetween, formatDate, parseDate, reportingWindow, scheduleRag, summarise } from "./metrics";
import type { Lang } from "./i18n";
import type { AttentionItem, Portfolio, Project, Rag } from "./types";

export interface BriefItem {
  title: string;
  project: string;
  owner?: string;
  due?: string;
  /** days overdue (positive) or days until due (negative) when a date exists */
  daysPast?: number;
  reference?: string;
  derived?: boolean;
}

export interface Brief {
  asOf: string;
  period: string;
  headline: string;
  decisions: BriefItem[];
  overdue: BriefItem[];
  waiting: BriefItem[];
  closed: BriefItem[];
  expiring: BriefItem[];
  health: Record<Rag, number>;
  late: { name: string; variance: number | null; days?: number }[];
  gaps: string[];
}

const T = {
  en: {
    title: "Weekly director brief",
    decisions: "Needs your decision",
    overdue: "Overdue",
    waiting: "Waiting for others",
    closed: "Closed in the period",
    expiring: "Contracts ending within 90 days",
    health: "Schedule health",
    late: "Projects behind plan",
    gaps: "Gaps in the data",
    none: "None.",
    owner: "Owner",
    due: "Due",
    daysOverdue: "days overdue",
    daysLeft: "days left",
    green: "on track",
    amber: "at risk",
    red: "delayed",
    grey: "not assessed",
    behind: "behind plan",
    contract: "Contract ends",
    inbox: "Director inbox",
    asOf: "As of",
    period: "Period",
  },
  ar: {
    title: "الملخص الأسبوعي للمدير",
    decisions: "بانتظار قرارك",
    overdue: "متأخر",
    waiting: "بانتظار الآخرين",
    closed: "أُغلق خلال الفترة",
    expiring: "عقود تنتهي خلال 90 يوماً",
    health: "صحة الجدول الزمني",
    late: "مشاريع متأخرة عن الخطة",
    gaps: "فجوات في البيانات",
    none: "لا يوجد.",
    owner: "المسؤول",
    due: "الاستحقاق",
    daysOverdue: "يوم تأخير",
    daysLeft: "يوم متبقٍ",
    green: "على المسار",
    amber: "معرض للخطر",
    red: "متأخر",
    grey: "غير مقيّم",
    behind: "عن الخطة",
    contract: "ينتهي العقد",
    inbox: "وارد المدير",
    asOf: "حتى تاريخ",
    period: "الفترة",
  },
} as const;

const bi = (v: { en: string; ar?: string }, lang: Lang) => (lang === "ar" && v.ar ? v.ar : v.en);

function toItem(p: Project, a: AttentionItem, lang: Lang, today: Date): BriefItem {
  const due = parseDate(a.due);
  return {
    title: bi(a.title, lang),
    project: p.id === INBOX_ID ? T[lang].inbox : bi(p.name, lang),
    owner: a.owner,
    due: a.due ?? undefined,
    daysPast: due ? daysBetween(due, today) : undefined,
    reference: a.reference,
  };
}

export function buildBrief(portfolio: Portfolio, today: Date, lang: Lang, window = reportingWindow(portfolio)): Brief {
  const decisions: BriefItem[] = [];
  const overdue: BriefItem[] = [];
  const waiting: BriefItem[] = [];
  const closed: BriefItem[] = [];
  const expiring: BriefItem[] = [];
  const health: Record<Rag, number> = { green: 0, amber: 0, red: 0, grey: 0 };
  const late: Brief["late"] = [];
  let tbc = 0;
  let noProgress = 0;

  for (const p of attentionProjects(portfolio)) {
    const real = p.id !== INBOX_ID;
    const b = attentionBuckets(p, today);
    for (const a of b.decisions) decisions.push(toItem(p, a, lang, today));
    for (const a of b.waiting) waiting.push(toItem(p, a, lang, today));
    for (const a of b.overdueItems) overdue.push(toItem(p, a, lang, today));
    for (const f of b.flags) {
      if (f.kind === "milestone-overdue") overdue.push({ title: lang === "ar" ? f.title.ar : f.title.en, project: bi(p.name, lang), daysPast: f.days, derived: true });
    }
    if (b.contractExpiry) {
      const item: BriefItem = { title: lang === "ar" ? b.contractExpiry.title.ar : b.contractExpiry.title.en, project: bi(p.name, lang), daysPast: -b.contractExpiry.days, reference: p.code ?? undefined, derived: true };
      decisions.push(item);
      expiring.push(item);
    }
    for (const a of p.attention) {
      const c = parseDate(a.closedOn);
      if (a.status === "closed" && c && c >= window.start && c <= window.end) closed.push(toItem(p, a, lang, today));
    }
    if (real) {
      const rag = scheduleRag(p, today);
      health[rag]++;
      if (p.confidence === "tbc") tbc++;
      if (p.progress.actual == null) noProgress++;
      if (p.progress.planned != null && p.progress.actual != null && p.progress.actual - p.progress.planned < -2) {
        late.push({ name: bi(p.name, lang), variance: Math.round((p.progress.actual - p.progress.planned) * 10) / 10 });
      }
    }
  }
  const byDue = (a: BriefItem, b: BriefItem) => (a.daysPast ?? -9999) - (b.daysPast ?? -9999);
  decisions.sort((a, b) => byDue(b, a));
  overdue.sort((a, b) => (b.daysPast ?? 0) - (a.daysPast ?? 0));
  waiting.sort((a, b) => byDue(b, a));
  late.sort((a, b) => (a.variance ?? 0) - (b.variance ?? 0));

  const s = summarise(portfolio, today, window);
  const gaps: string[] = [];
  if (noProgress) gaps.push(lang === "ar" ? `${noProgress} من المشاريع بلا بيانات إنجاز.` : `${noProgress} ${noProgress === 1 ? "project has" : "projects have"} no progress data.`);
  if (tbc) gaps.push(lang === "ar" ? `${tbc} من المشاريع تحتاج إلى تأكيد بياناتها.` : `${tbc} ${tbc === 1 ? "project has" : "projects have"} data still to be confirmed.`);
  if (s.valueUnknown) gaps.push(lang === "ar" ? `${s.valueUnknown} من المشاريع بلا قيمة مسجلة.` : `${s.valueUnknown} ${s.valueUnknown === 1 ? "project has" : "projects have"} no value on file.`);

  const headline =
    lang === "ar"
      ? `${s.needsDecision} بانتظار قرارك، ${s.overdue} متأخر، ${s.waiting} بانتظار الآخرين، و${s.closedThisPeriod} أُغلق خلال الفترة.`
      : `${s.needsDecision} items need your decision, ${s.overdue} are overdue, ${s.waiting} are waiting on others, and ${s.closedThisPeriod} closed in the period.`;

  return {
    asOf: formatDate(today.toISOString().slice(0, 10), lang),
    period: `${formatDate(window.start.toISOString().slice(0, 10), lang)} – ${formatDate(window.end.toISOString().slice(0, 10), lang)}`,
    headline,
    decisions,
    overdue,
    waiting,
    closed,
    expiring,
    health,
    late,
    gaps,
  };
}

function line(i: BriefItem, lang: Lang, kind: "due" | "overdue" | "plain"): string {
  const t = T[lang];
  const bits: string[] = [];
  if (i.owner) bits.push(`${t.owner}: ${i.owner}`);
  if (kind === "overdue" && i.daysPast != null) bits.push(`${i.daysPast} ${t.daysOverdue}`);
  else if (i.due) bits.push(`${t.due}: ${formatDate(i.due, lang)}`);
  else if (i.derived && i.daysPast != null && i.daysPast <= 0) bits.push(`${-i.daysPast} ${t.daysLeft}`);
  if (i.reference) bits.push(i.reference);
  return `${i.title} (${i.project}${bits.length ? ", " + bits.join(", ") : ""})`;
}

export function briefToMarkdown(b: Brief, lang: Lang): string {
  const t = T[lang];
  const sec = (title: string, items: BriefItem[], kind: "due" | "overdue" | "plain") =>
    [`## ${title} (${items.length})`, ...(items.length ? items.map((i) => `- ${line(i, lang, kind)}`) : [t.none]), ""].join("\n");
  const h = b.health;
  return [
    `# ${t.title}`,
    `${t.asOf} ${b.asOf} · ${t.period}: ${b.period}`,
    "",
    `**${b.headline}**`,
    "",
    sec(t.decisions, b.decisions, "due"),
    sec(t.overdue, b.overdue, "overdue"),
    sec(t.waiting, b.waiting, "due"),
    sec(t.closed, b.closed, "plain"),
    `## ${t.health}`,
    `${h.green} ${t.green} · ${h.amber} ${t.amber} · ${h.red} ${t.red} · ${h.grey} ${t.grey}`,
    "",
    ...(b.late.length ? [`## ${t.late}`, ...b.late.map((l) => `- ${l.name}: ${l.variance} pp ${t.behind}`), ""] : []),
    ...(b.gaps.length ? [`## ${t.gaps}`, ...b.gaps.map((g) => `- ${g}`), ""] : []),
  ].join("\n");
}

/** Plain text for WhatsApp or email: no Markdown markers. */
export function briefToText(b: Brief, lang: Lang): string {
  return briefToMarkdown(b, lang)
    .replace(/^# (.*)$/gm, "$1")
    .replace(/^## (.*)$/gm, "\n$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^- /gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
