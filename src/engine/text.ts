/**
 * Bilingual wording for the rule-based analyst. Every template takes numbers
 * that were already computed from evidence, so the text only places them.
 * Numbers are printed with at most 2 decimals and no thousands separators,
 * which is what the evidence gate reads back.
 *
 * Style: short sentences, British English, formal Modern Standard Arabic,
 * no dashes used as punctuation.
 */

import { capitalise, fmtNum, ltr } from "./util";

export type Lang = "en" | "ar";
export type Polarity = "bad_up" | "good_up" | "neutral";
export type Outcome = "worse" | "better" | "neutral";
export type AggKind = "sum" | "mean";

export interface FindingText {
  title: string;
  detail: string;
  rec: string;
}
export type Bi<T> = { en: T; ar: T };
export type TextSet = Bi<FindingText>;

export interface MetricRef {
  name: string;
  agg: AggKind;
  polarity: Polarity;
}

export function outcomeOf(polarity: Polarity, delta: number): Outcome {
  if (delta === 0 || polarity === "neutral") return "neutral";
  const up = delta > 0;
  return (polarity === "bad_up") === up ? "worse" : "better";
}

/** "total Failures" / "average PM Completion". */
export function labelEn(m: MetricRef): string {
  return `${m.agg === "mean" ? "average" : "total"} ${m.name}`;
}
export function labelAr(m: MetricRef): string {
  return `${m.agg === "mean" ? "متوسط" : "إجمالي"} ${ltr(m.name)}`;
}

const q = (s: string): string => `"${ltr(s)}"`;
const n = fmtNum;
const abs = (x: number): string => fmtNum(Math.abs(x));

const FREQ_EN = { D: "day", W: "week", M: "month", Q: "quarter", Y: "year" } as const;
const FREQ_AR = { D: "اليوم", W: "الأسبوع", M: "الشهر", Q: "الربع", Y: "السنة" } as const;
export const freqWordEn = (f: keyof typeof FREQ_EN): string => FREQ_EN[f];
export const freqWordAr = (f: keyof typeof FREQ_AR): string => FREQ_AR[f];

// ------------------------------------------------------------------ concentration

export interface ConcentrationParams {
  m: MetricRef;
  dim: string;
  top: string;
  share: number;
  v: number;
  total: number;
  groups: number;
  second?: { name: string; value: number };
}

export function concentrationText(p: ConcentrationParams): TextSet {
  const bad = p.m.polarity === "bad_up";
  const en: FindingText = {
    title: `${p.top} holds ${n(p.share)}% of ${labelEn(p.m)}`,
    detail:
      `${capitalise(labelEn(p.m))} is ${n(p.total)}. ${p.top} recorded ${n(p.v)} of it, across ${p.groups} ${p.dim} groups.` +
      (p.second ? ` The next largest is ${p.second.name} with ${n(p.second.value)}.` : ""),
    rec: bad
      ? `Prioritise corrective work on ${p.top}. It carries the largest share of ${p.m.name}.`
      : `Confirm that the concentration in ${p.top} is expected, and review it again next period.`,
  };
  const ar: FindingText = {
    title: `تستحوذ ${q(p.top)} على ${n(p.share)}% من ${labelAr(p.m)}`,
    detail:
      `بلغ ${labelAr(p.m)} ${n(p.total)}. وسجلت ${q(p.top)} ${n(p.v)} منه، ضمن ${arGroups(p.groups)} في العمود ${q(p.dim)}.` +
      (p.second ? ` وتأتي ${q(p.second.name)} في المرتبة الثانية بقيمة ${n(p.second.value)}.` : ""),
    rec: bad
      ? `يُوصى بإعطاء الأولوية للأعمال التصحيحية في ${q(p.top)}، إذ تحمل الحصة الأكبر من ${ltr(p.m.name)}.`
      : `يُوصى بالتأكد من أن هذا التركّز في ${q(p.top)} متوقع، ومراجعته مجدداً في الفترة القادمة.`,
  };
  return { en, ar };
}

// ------------------------------------------------------------------ trend

export interface TrendParams {
  m: MetricRef;
  lastP: string;
  prevP: string;
  firstP: string;
  last: number;
  prev: number;
  first: number;
  /** Last period against the previous one, percent. */
  pct: number | null;
  /** First period to last period, percent. Null with fewer than three periods. */
  overall: number | null;
  peakV: number;
  peakP: string;
  headline: "last" | "overall";
}

export function trendText(p: TrendParams): TextSet {
  const head = p.headline === "last" ? (p.pct as number) : (p.overall as number);
  const up = head > 0;
  const outcome = outcomeOf(p.m.polarity, head);
  const L = labelEn(p.m);
  const A = labelAr(p.m);
  const en: FindingText = {
    title:
      p.headline === "last"
        ? `${capitalise(L)} ${up ? "rose" : "fell"} ${abs(head)}% in ${p.lastP} compared with ${p.prevP}`
        : `${capitalise(L)} ${up ? "rose" : "fell"} ${abs(head)}% from ${p.firstP} to ${p.lastP}`,
    detail:
      `${capitalise(L)} was ${n(p.last)} in ${p.lastP}, against ${n(p.prev)} in ${p.prevP}.` +
      (p.pct !== null ? ` That is a change of ${n(p.pct)}%.` : "") +
      (p.overall !== null ? ` From ${p.firstP} (${n(p.first)}) to ${p.lastP} (${n(p.last)}) the change is ${n(p.overall)}%.` : "") +
      ` The peak was ${n(p.peakV)} in ${p.peakP}.`,
    rec:
      outcome === "worse"
        ? `Review what drove the ${up ? "increase" : "decline"} in ${p.m.name} and agree a ${up ? "corrective" : "recovery"} action with the owner.`
        : outcome === "better"
          ? `Confirm that the improvement in ${p.m.name} is lasting, and record what changed.`
          : `Confirm the change in ${p.m.name} with the data owner and check whether it was expected.`,
  };
  const ar: FindingText = {
    title:
      p.headline === "last"
        ? `${up ? "ارتفع" : "انخفض"} ${A} بنسبة ${abs(head)}% في ${ltr(p.lastP)} مقارنة بـ${ltr(p.prevP)}`
        : `${up ? "ارتفع" : "انخفض"} ${A} بنسبة ${abs(head)}% من ${ltr(p.firstP)} إلى ${ltr(p.lastP)}`,
    detail:
      `بلغ ${A} ${n(p.last)} في ${ltr(p.lastP)} مقابل ${n(p.prev)} في ${ltr(p.prevP)}.` +
      (p.pct !== null ? ` أي بتغير قدره ${n(p.pct)}%.` : "") +
      (p.overall !== null ? ` ومن ${ltr(p.firstP)} (${n(p.first)}) إلى ${ltr(p.lastP)} (${n(p.last)}) بلغ التغير ${n(p.overall)}%.` : "") +
      ` وسُجلت الذروة في ${ltr(p.peakP)} بقيمة ${n(p.peakV)}.`,
    rec:
      outcome === "worse"
        ? `يُوصى بمراجعة أسباب ${up ? "الارتفاع" : "الانخفاض"} في ${ltr(p.m.name)} والاتفاق مع المسؤول على إجراء ${up ? "تصحيحي" : "لاستعادة المستوى"}.`
        : outcome === "better"
          ? `يُوصى بالتأكد من أن التحسن في ${ltr(p.m.name)} مستمر، وتوثيق ما تغيّر.`
          : `يُوصى بتأكيد التغير في ${ltr(p.m.name)} مع مالك البيانات والتحقق من أنه متوقع.`,
  };
  return { en, ar };
}

// ------------------------------------------------------------------ mover

export interface MoverParams {
  m: MetricRef;
  group: string;
  prevP: string;
  lastP: string;
  prev: number;
  last: number;
  diff: number;
  pct: number | null;
  next?: { name: string; diff: number };
}

export function moverText(p: MoverParams): TextSet {
  const outcome = outcomeOf(p.m.polarity, p.diff);
  const pctPart = p.pct !== null ? ` (${n(p.pct)}%)` : "";
  const en: FindingText = {
    title: `${p.group} had the largest change in ${labelEn(p.m)} between ${p.prevP} and ${p.lastP}`,
    detail:
      `${p.group} moved from ${n(p.prev)} to ${n(p.last)}, a change of ${n(p.diff)}${pctPart}.` +
      (p.next ? ` The next largest change was ${p.next.name} at ${n(p.next.diff)}.` : ""),
    rec:
      outcome === "worse"
        ? `Ask the owner of ${p.group} to explain the movement in ${p.m.name} and set a recovery date.`
        : outcome === "better"
          ? `Record what worked for ${p.group} and consider applying it to the other groups.`
          : `Confirm the movement in ${p.m.name} for ${p.group} with its owner.`,
  };
  const ar: FindingText = {
    title: `سجلت ${q(p.group)} أكبر تغير في ${labelAr(p.m)} بين ${ltr(p.prevP)} و${ltr(p.lastP)}`,
    detail:
      `انتقلت ${q(p.group)} من ${n(p.prev)} إلى ${n(p.last)}، أي بتغير قدره ${n(p.diff)}${pctPart}.` +
      (p.next ? ` وكان ثاني أكبر تغير للمجموعة ${q(p.next.name)} بمقدار ${n(p.next.diff)}.` : ""),
    rec:
      outcome === "worse"
        ? `يُوصى بمطالبة المسؤول عن ${q(p.group)} بتفسير التغير في ${ltr(p.m.name)} وتحديد موعد للمعالجة.`
        : outcome === "better"
          ? `يُوصى بتوثيق ما أدى إلى التحسن في ${q(p.group)} والنظر في تطبيقه على بقية المجموعات.`
          : `يُوصى بتأكيد التغير في ${ltr(p.m.name)} الخاص بـ${q(p.group)} مع المسؤول عنه.`,
  };
  return { en, ar };
}

// ------------------------------------------------------------------ outliers

export interface OutlierParams {
  m: MetricRef;
  count: number;
  /** Row label such as "Rolling Stock, 2026-06-01". Empty when there is no label column. */
  who: string;
  row: number;
  value: number;
  z: number;
  mean: number;
  /** Deviation of the value from the mean, percent. Null when the mean is zero. */
  pctFromMean: number | null;
  threshold: number;
  lower: number;
  upper: number;
}

function arGroups(c: number): string {
  if (c === 2) return "مجموعتين";
  return c <= 10 ? `${c} مجموعات` : `${c} مجموعة`;
}

function arCount(c: number): string {
  if (c === 1) return "قيمة شاذة واحدة";
  if (c === 2) return "قيمتان شاذتان";
  return c <= 10 ? `${c} قيم شاذة` : `${c} قيمة شاذة`;
}

export function outlierText(p: OutlierParams): TextSet {
  const above = p.value > p.mean;
  const avg = p.m.agg === "mean" ? "average" : "total";
  const en: FindingText = {
    title: `${p.count === 1 ? "1 unusual value" : `${p.count} unusual values`} in ${p.m.name}`,
    detail:
      (p.who
        ? `The largest deviation is ${p.who}, at ${n(p.value)} (row ${p.row}, z-score ${n(p.z)}).`
        : `The largest deviation is in row ${p.row}, at ${n(p.value)} (z-score ${n(p.z)}).`) +
      (p.pctFromMean !== null ? ` It is ${abs(p.pctFromMean)}% ${above ? "above" : "below"} the mean of ${n(p.mean)}.` : ` The mean is ${n(p.mean)}.`) +
      ` Values beyond ${n(p.threshold)} standard deviations are flagged. The IQR fences are ${n(p.lower)} to ${n(p.upper)}.`,
    rec: `Check row ${p.row} in the source file. Confirm whether ${n(p.value)} is a real event or an entry error before relying on the ${avg}.`,
  };
  const ar: FindingText = {
    title: `${arCount(p.count)} في ${ltr(p.m.name)}`,
    detail:
      (p.who
        ? `أكبر انحراف هو ${ltr(p.who)}، بقيمة ${n(p.value)} (الصف ${p.row}، الدرجة المعيارية ${n(p.z)}).`
        : `أكبر انحراف في الصف ${p.row}، بقيمة ${n(p.value)} (الدرجة المعيارية ${n(p.z)}).`) +
      (p.pctFromMean !== null ? ` وهي ${above ? "أعلى" : "أدنى"} من المتوسط (${n(p.mean)}) بنسبة ${abs(p.pctFromMean)}%.` : ` والمتوسط ${n(p.mean)}.`) +
      ` وتُعد القيم التي تتجاوز ${n(p.threshold)} انحرافات معيارية شاذة. وحدود النطاق الربعي هي ${n(p.lower)} إلى ${n(p.upper)}.`,
    rec: `يُوصى بمراجعة الصف ${p.row} في الملف المصدر، والتأكد من أن القيمة ${n(p.value)} حدث فعلي وليست خطأ إدخال قبل الاعتماد على ${p.m.agg === "mean" ? "المتوسط" : "الإجمالي"}.`,
  };
  return { en, ar };
}

// ------------------------------------------------------------------ data gaps

export function gapRecommendation(kind: "nulls" | "no_numeric" | "duplicate_header", column?: string): Bi<string> {
  switch (kind) {
    case "nulls":
      return {
        en: `Ask the data owner to complete or explain the empty cells in ${column ?? "this column"}.`,
        ar: `يُوصى بمطالبة مالك البيانات باستكمال الخلايا الفارغة في العمود ${q(column ?? "")} أو توضيح سببها.`,
      };
    case "no_numeric":
      return {
        en: "Check that the right sheet was uploaded and that numbers are stored as numbers, not as text.",
        ar: "يُوصى بالتأكد من رفع الورقة الصحيحة ومن أن الأرقام مخزنة كأرقام وليست كنصوص.",
      };
    case "duplicate_header":
      return {
        en: "Rename the repeated columns in the source file so that each name is unique.",
        ar: "يُوصى بإعادة تسمية الأعمدة المكررة في الملف المصدر بحيث يكون لكل عمود اسم فريد.",
      };
  }
}

// ------------------------------------------------------------------ labels for charts, KPIs and warnings

export function kpiLabels(kind: "total" | "latest" | "top" | "rows", m: MetricRef | null, extra: string, lang: Lang): string {
  const L = m ? (lang === "en" ? labelEn(m) : labelAr(m)) : "";
  if (lang === "en") {
    switch (kind) {
      case "total":
        return capitalise(L);
      case "latest":
        return `${capitalise(L)}, ${extra}`;
      case "top":
        return `Top ${extra} by ${L}`;
      case "rows":
        return "Rows analysed";
    }
  }
  switch (kind) {
    case "total":
      return L;
    case "latest":
      return `${L}، ${ltr(extra)}`;
    case "top":
      return `الأعلى في ${q(extra)} حسب ${L}`;
    case "rows":
      return "الصفوف المحللة";
  }
}

export function barTitle(m: MetricRef, dim: string, lang: Lang): string {
  return lang === "en" ? `${capitalise(labelEn(m))} by ${dim}` : `${labelAr(m)} حسب ${ltr(dim)}`;
}

export function lineTitle(m: MetricRef, freq: keyof typeof FREQ_EN, lang: Lang, byDim?: string): string {
  if (lang === "en") return `${capitalise(labelEn(m))} per ${FREQ_EN[freq]}${byDim ? `, by ${byDim}` : ""}`;
  return `${labelAr(m)} حسب ${FREQ_AR[freq]}${byDim ? `، لكل ${ltr(byDim)}` : ""}`;
}

export function truncationWarning(table: string, sourceRows: number, kept: number, lang: Lang): string {
  return lang === "en"
    ? `Table ${table} has ${sourceRows} rows. Only the first ${kept} were analysed.`
    : `يحتوي الجدول ${q(table)} على ${sourceRows} صفاً. وقد حُلل أول ${kept} صف فقط.`;
}

export function noMatchWarning(lang: Lang): string {
  return lang === "en"
    ? "No column or group in the data matches the question. The general findings are shown."
    : "لا يطابق أي عمود أو مجموعة في البيانات نص السؤال. تُعرض النتائج العامة.";
}

export function noMetricWarning(lang: Lang): string {
  return lang === "en"
    ? "No numeric column suitable for totals or trends was found, so no metric findings were produced."
    : "لم يُعثر على عمود رقمي مناسب للإجماليات أو الاتجاهات، ولذلك لم تُنتج نتائج على المقاييس.";
}
