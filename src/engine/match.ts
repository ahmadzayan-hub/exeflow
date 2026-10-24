/**
 * Matches a free-text question (English or Arabic) against column and group
 * names, so findings about what the user asked come first. No model involved:
 * normalisation, light stemming and a small bilingual glossary.
 */

const AR_MARKS = /[ً-ْـٰ]/g;

export function normaliseWord(w: string): string {
  return w
    .normalize("NFKC")
    .toLowerCase()
    .replace(AR_MARKS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

export function tokenize(s: string): string[] {
  return normaliseWord(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

/** Light stem: Arabic definite article and plural endings, English plural s. */
export function stem(tok: string): string {
  let t = tok;
  if (/[؀-ۿ]/.test(t)) {
    t = t.replace(/^(?:وال|بال|لل|ال)(?=.{3,})/, "");
    t = t.replace(/(?:ات|ون|ين|ان)$/, (m) => (t.length - m.length >= 3 ? "" : m));
    t = t.replace(/ه$/, (m) => (t.length > 3 ? "" : m));
    return t;
  }
  if (t.length > 4 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && t.endsWith("es") && /(?:ss|sh|ch|x|z)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

const GLOSSARY: string[][] = [
  ["failure", "fault", "defect", "breakdown", "عطل", "أعطال", "خلل", "إخفاق", "أعطاب"],
  ["delay", "late", "lateness", "تأخير", "تأخيرات", "تأخر", "تاخير"],
  ["minute", "min", "دقيقة", "دقائق"],
  ["cost", "spend", "expenditure", "تكلفة", "تكاليف", "كلفة", "إنفاق"],
  ["amount", "value", "aed", "مبلغ", "مبالغ", "قيمة", "درهم"],
  ["count", "number", "total", "عدد", "إجمالي", "مجموع"],
  ["signalling", "signaling", "signal", "إشارات", "إشارة"],
  ["rolling", "stock", "train", "قطار", "قطارات", "مركبات", "مركبة", "عربات"],
  ["power", "electric", "electrical", "energy", "supply", "طاقة", "كهرباء", "كهربائية", "تغذية"],
  ["completion", "complete", "completed", "compliance", "اكتمال", "إنجاز", "التزام"],
  ["availability", "available", "uptime", "جاهزية", "توافر", "إتاحة"],
  ["maintenance", "pm", "preventive", "صيانة", "وقائية"],
  ["month", "monthly", "شهر", "شهري", "أشهر", "شهور"],
  ["system", "نظام", "أنظمة"],
  ["incident", "accident", "event", "حادث", "حوادث", "واقعة"],
  ["rate", "ratio", "percentage", "percent", "pct", "نسبة", "معدل"],
  ["contract", "عقد", "عقود"],
  ["project", "مشروع", "مشاريع"],
  ["quarter", "qtr", "ربع"],
  ["year", "annual", "yearly", "سنة", "سنوي", "عام"],
  ["type", "category", "نوع", "فئة", "تصنيف"],
  ["line", "خط", "خطوط"],
  ["station", "محطة", "محطات"],
];

const STOPWORDS = new Set(
  [
    "the", "a", "an", "of", "in", "on", "for", "to", "and", "or", "is", "are", "what", "which", "how", "why", "show", "me", "by", "per",
    "with", "from", "about", "this", "that", "did", "do", "does", "were", "was", "be", "has", "have", "had", "my", "our", "all", "any",
    "ما", "ماذا", "هل", "في", "من", "الى", "إلى", "على", "عن", "كم", "كيف", "لماذا", "هي", "هو", "هذا", "هذه", "التي", "الذي", "مع", "او", "أو", "و", "بين", "حول", "سبب",
  ].map(normaliseWord),
);

const GLOSS_INDEX = new Map<string, number>();
GLOSSARY.forEach((group, i) => {
  for (const form of group) GLOSS_INDEX.set(stem(normaliseWord(form)), i);
});

function canon(tok: string): string {
  const s = stem(tok);
  const g = GLOSS_INDEX.get(s);
  return g === undefined ? s : `#${g}`;
}

function meaningful(tokens: string[]): string[] {
  return tokens.filter((t) => !STOPWORDS.has(t) && !/^\d+$/.test(t) && (t.length >= 2 || /[؀-ۿ]/.test(t)));
}

export interface QuestionMatcher {
  /** True when the question mentions anything in `name`. */
  matches(name: string): boolean;
  active: boolean;
}

export function questionMatcher(question: string | null | undefined): QuestionMatcher {
  const words = new Set(meaningful(tokenize(question ?? "")).map(canon));
  return {
    active: words.size > 0,
    matches(name: string): boolean {
      if (words.size === 0) return false;
      return meaningful(tokenize(name)).some((t) => words.has(canon(t)));
    },
  };
}
