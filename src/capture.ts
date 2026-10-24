import { DAY_MS } from "./metrics";
import type { Priority, Project } from "./types";

export interface CaptureDraft {
  text: string;
  title: string;
  type: "decision" | "waiting" | "info";
  owner?: string;
  due?: string;
  /** explains how the due date was read, so the director can correct it */
  dueNote?: { en: string; ar: string };
  projectId?: string;
  priority: Priority;
}

export interface CaptureContext {
  today: Date;
  projects: Pick<Project, "id" | "name" | "code">[];
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Remove diacritics and tatweel, convert Arabic-Indic digits. Keeps letters as typed. */
function clean(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Length-preserving fold used only for matching. */
function fold(s: string): string {
  return s.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ؤ]/g, "و").replace(/[ئ]/g, "ي");
}

const WEEKDAYS: [RegExp, number][] = [
  [/\b(sunday|sun)\b|(?:^|\s)(?:ال)?احد(?=\s|$)/, 0],
  [/\b(monday|mon)\b|(?:^|\s)(?:ال)?(?:اثنين|اتنين)(?=\s|$)/, 1],
  [/\b(tuesday|tue|tues)\b|(?:^|\s)(?:ال)?(?:ثلاثاء|تلات|ثلاثا|تلاتاء)(?=\s|$)/, 2],
  [/\b(wednesday|wed)\b|(?:^|\s)(?:ال)?(?:اربعاء|اربعا)(?=\s|$)/, 3],
  [/\b(thursday|thu|thur|thurs)\b|(?:^|\s)(?:ال)?خميس(?=\s|$)/, 4],
  [/\b(friday|fri)\b|(?:^|\s)(?:ال)?جمعه(?=\s|$)/, 5],
  [/\b(saturday|sat)\b|(?:^|\s)(?:ال)?سبت(?=\s|$)/, 6],
];
const WEEKDAY_NAME_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_NAME_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

function nextWeekday(today: Date, wd: number): Date {
  const diff = ((wd - today.getUTCDay() + 7) % 7) || 7;
  return plus(today, diff);
}

function parseDue(f: string, today: Date): { due: string; note?: CaptureDraft["dueNote"] } | null {
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(f);
  if (m) return { due: `${m[1]}-${m[2]}-${m[3]}` };
  m = /\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/.exec(f);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = m[3] ? Number(m[3]) : today.getUTCFullYear();
    if (year < 100) year += 2000;
    let d = new Date(Date.UTC(year, month - 1, day));
    if (!m[3] && d < today) d = new Date(Date.UTC(year + 1, month - 1, day));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { due: iso(d) };
  }
  if (/\bday after tomorrow\b|بعد (?:بكره|بكرا|غدا)/.test(f)) return { due: iso(plus(today, 2)) };
  if (/\btomorrow\b|(?:^|\s)(?:بكره|بكرا|غدا)(?=\s|$)/.test(f)) return { due: iso(plus(today, 1)) };
  if (/\btoday\b|(?:^|\s)(?:اليوم|النهارده|النهارده)(?=\s|$)/.test(f)) return { due: iso(today) };
  m = /\bin (\d{1,3}) days?\b|بعد (\d{1,3}) (?:يوم|ايام)/.exec(f);
  if (m) return { due: iso(plus(today, Number(m[1] ?? m[2]))) };
  m = /\bin (\d{1,2}) weeks?\b|بعد (\d{1,2}) (?:اسبوع|اسابيع)/.exec(f);
  if (m) return { due: iso(plus(today, 7 * Number(m[1] ?? m[2]))) };
  if (/\bin (?:two|2) weeks\b|بعد اسبوعين/.test(f)) return { due: iso(plus(today, 14)) };
  if (/\bnext week\b|الاسبوع (?:الجاي|القادم|اللي جاي|المقبل)/.test(f)) return { due: iso(plus(today, 7)) };
  if (/end of (?:the )?month|(?:نهايه|اخر) الشهر/.test(f)) return { due: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))) };
  if (/end of (?:the )?week|(?:نهايه|اخر) الاسبوع|this week|هذا الاسبوع/.test(f)) {
    const fri = (5 - today.getUTCDay() + 7) % 7;
    return { due: iso(plus(today, fri)) };
  }
  for (const [re, wd] of WEEKDAYS) {
    const hit = re.exec(f);
    if (!hit) continue;
    const day = nextWeekday(today, wd);
    const before = /\bbefore\b|(?:^|\s)قبل\s/.test(f.slice(Math.max(0, hit.index - 14), hit.index + 2));
    if (before) {
      return {
        due: iso(plus(day, -1)),
        note: { en: `Read "before ${WEEKDAY_NAME_EN[wd]}" as due the day before. Change it if you meant ${WEEKDAY_NAME_EN[wd]} itself.`, ar: `فُهم «قبل ${WEEKDAY_NAME_AR[wd]}» على أنه اليوم السابق. عدّل التاريخ إن قصدت ${WEEKDAY_NAME_AR[wd]} نفسه.` },
      };
    }
    return { due: iso(day) };
  }
  return null;
}

const DECISION = /\b(decide|decision|approve|approval from me|sign[- ]?off|go or no[- ]?go|choose|select)\b|(?:^|\s)(?:اقرر|قرار|اعتماد|اعتمد|اوافق|اختيار|اختار)(?=\s|$)/;
const WAITING = /\b(waiting|chase|follow up|follow-up|reply from|response from|feedback from|status from|need (?:a )?(?:reply|response|update))\b|(?:^|\s)(?:رد من|ردود من|متابعه|انتظار|منتظر|عايز رد|اريد رد|نريد رد|افاده من)/;
const URGENT = /\b(urgent|asap|immediately|critical)\b|(?:^|\s)(?:عاجل|فورا|فورا|ضروري|بسرعه|حالا)(?=\s|$)/;

function detectOwner(clean0: string, f: string): string | undefined {
  let m = /\b(?:[Aa]sk|[Tt]ell|[Rr]emind|[Hh]ave|[Gg]et)\s+([A-Z][\p{L}'-]+)\s+to\b/u.exec(clean0);
  if (m) return m[1];
  m = /^(?:\s*(?:log|note|record|register|add)\s+(?:that\s+)?)?([A-Z][\p{L}'-]+)\s+(?:to|must|should|needs to|has to|will|needs)\b/u.exec(clean0);
  if (m && !/^(?:I|We|Please|Need|Must)$/.test(m[1])) return m[1];
  m = /(?:reply|response|answer|approval|feedback|report|update|status)\s+from\s+(?:the\s+)?([\p{L}][\p{L}&/ ]{1,28}?)(?=\s+(?:on|about|before|by|for|regarding)\b|[.,;]|$)/iu.exec(clean0);
  if (m) return m[1].trim().replace(/^\w/, (c) => c.toUpperCase());
  const ar = (re: RegExp): string | undefined => {
    const hit = re.exec(f);
    const span = hit?.indices?.[1];
    return span ? clean0.slice(span[0], span[1]) : undefined;
  };
  return (
    ar(/(?:^|\s)(?:ان|انه)\s+(\S+)\s+(?:لازم|يجب|عليه|هيقوم|سيقوم|هو)(?=\s)/d) ??
    ar(/^(\S+)\s+(?:لازم|يجب|عليه|هيقوم|سيقوم)(?=\s)/d) ??
    ar(/(?:اطلب من|قل ل|قول ل|ذكر|كلم)\s+(\S+)/d) ??
    ar(/(?:رد|ردود|موافقه|تقرير|حاله|معلومات|افاده|تاكيد)\s+من\s+(\S+)/d)
  );
}

const COMMAND_PREFIX = /^(?:please\s+)?(?:log|note|record|register|add|remind me(?: to| that)?|remember(?: that)?)\b[:,]?\s*(?:that\s+)?|^(?:سجل|سجلي|اضف|ضيف|ذكرني|فكرني|تذكير|لاحظ)\s+(?:ان|انه|أن|إن)?\s*/i;
const STOP = new Set(["the", "and", "for", "with", "line", "contract", "project", "program", "programme", "من", "على", "في", "عن", "مع", "هذا", "ال"]);

function tokens(s: string): string[] {
  return fold(clean(s))
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

function matchProject(f: string, projects: CaptureContext["projects"]): string | undefined {
  const words = new Set(f.split(/[^\p{L}\p{N}-]+/u).filter(Boolean));
  const scored = projects.map((p) => {
    let score = 0;
    if (p.code && f.includes(p.code.toLowerCase())) score += 5;
    const pts = new Set([...tokens(p.name.en), ...tokens(p.name.ar ?? "")]);
    for (const t of pts) if (words.has(t) || [...words].some((w) => w.length > 3 && (w.startsWith(t) || t.startsWith(w)) && Math.min(w.length, t.length) >= 4)) score += 1;
    return { id: p.id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  if (!scored[0] || scored[0].score < 2) return undefined; // one shared word is not enough
  if (scored[1] && scored[1].score === scored[0].score) return undefined;
  return scored[0].id;
}

function splitClauses(text: string): string[] {
  return text
    .split(/[.\n;؛،]+|,\s+(?:and\s+)?|\s+(?:and also|also|وكمان)\s+/i)
    .map((c) => c.replace(/^\s*(?:and|then|و)\s+(?=\S)/i, "").trim())
    .filter((c) => c.length > 3);
}

export function parseCapture(input: string, ctx: CaptureContext): CaptureDraft[] {
  const text = clean(input);
  if (!text) return [];
  const drafts: CaptureDraft[] = [];
  for (const raw of splitClauses(text)) {
    const clause = raw
      .replace(COMMAND_PREFIX, "")
      .replace(/^و?(?:عايز|عاوز|اريد|أريد|نريد|محتاج)\s+/, "")
      .replace(/^I (?:need|want) (?:a |an |the )?(?!to\b)/i, "")
      .trim();
    if (clause.length < 3) continue;
    const f = fold(clause);
    const owner = detectOwner(clause, f);
    const dueHit = parseDue(f, ctx.today);
    const isDecision = DECISION.test(f);
    const isWaiting = WAITING.test(f) || (!!owner && !isDecision);
    const title = clause.replace(/^\w/, (c) => c.toUpperCase()).slice(0, 160);
    drafts.push({
      text: raw,
      title,
      type: isDecision ? "decision" : isWaiting ? "waiting" : "info",
      owner,
      due: dueHit?.due,
      dueNote: dueHit?.note,
      projectId: matchProject(f, ctx.projects),
      priority: URGENT.test(f) ? "high" : "normal",
    });
  }
  return drafts;
}
