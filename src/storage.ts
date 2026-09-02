import type { Portfolio } from "./types";

const KEY = "exeflow.rmd.portfolio";
const LANG_KEY = "exeflow.rmd.lang";

export function isPortfolio(v: unknown): v is Portfolio {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.schemaVersion === 1 && Array.isArray(o.projects) && typeof o.reportingPeriod === "object";
}

export function loadPortfolio(): Portfolio | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPortfolio(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePortfolio(p: Portfolio | null): void {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: session only */
  }
}

export function loadLang(): "en" | "ar" {
  try {
    return localStorage.getItem(LANG_KEY) === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

export function saveLang(lang: "en" | "ar"): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore */
  }
}
