import type { Lang } from "../i18n";

/** Inline bilingual helper for newer views: tr(lang)("English", "العربية"). */
export const tr = (lang: Lang) => (en: string, ar: string) => (lang === "ar" ? ar : en);
