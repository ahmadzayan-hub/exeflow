import type { Portfolio, Project } from "./types";

const KEY = "exeflow.rmd.portfolio";
const LANG_KEY = "exeflow.rmd.lang";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStrOrNull = (v: unknown) => v == null || typeof v === "string";
const isNumOrNull = (v: unknown) => v == null || (typeof v === "number" && Number.isFinite(v));
const isBilingual = (v: unknown) => isObj(v) && typeof v.en === "string" && isStrOrNull(v.ar);

/**
 * Structural check for an imported or stored portfolio. Deep enough that the
 * metrics engine cannot throw on it; unknown enum values are tolerated and
 * shown as-is by the UI.
 */
export function isPortfolio(v: unknown): v is Portfolio {
  if (!isObj(v) || v.schemaVersion !== 1) return false;
  if (!isBilingual(v.title) || !isBilingual(v.organisation) || !isBilingual(v.disclaimer)) return false;
  const rp = v.reportingPeriod;
  if (!isObj(rp) || typeof rp.asOf !== "string" || !isBilingual(rp.label)) return false;
  if (!isStrOrNull(rp.start) || !isStrOrNull(rp.end)) return false;
  if (!Array.isArray(v.projects)) return false;
  return v.projects.every(isProject);
}

function isProject(v: unknown): v is Project {
  if (!isObj(v)) return false;
  if (typeof v.id !== "string" || !isBilingual(v.name)) return false;
  for (const k of ["kind", "asset", "category", "stage", "confidence"]) if (typeof v[k] !== "string") return false;
  for (const k of ["code", "contractor", "consultant", "ntp", "completion", "dlpEnd", "notes"]) if (!isStrOrNull(v[k])) return false;
  for (const k of ["valueAed", "spentAed"]) if (!isNumOrNull(v[k])) return false;
  const pr = v.progress;
  if (!isObj(pr) || !isNumOrNull(pr.planned) || !isNumOrNull(pr.actual) || !isStrOrNull(pr.asOf)) return false;
  if (!Array.isArray(v.milestones) || !Array.isArray(v.risks) || !Array.isArray(v.attention) || !Array.isArray(v.sources)) return false;
  if (v.workPackages != null && !Array.isArray(v.workPackages)) return false;
  if (!v.milestones.every((m) => isObj(m) && typeof m.id === "string" && isBilingual(m.title) && isStrOrNull(m.planned) && isStrOrNull(m.actual) && typeof m.status === "string")) return false;
  if (!v.risks.every((r) => isObj(r) && typeof r.id === "string" && isBilingual(r.title) && typeof r.rating === "string")) return false;
  if (!v.attention.every((a) => isObj(a) && typeof a.id === "string" && isBilingual(a.title) && typeof a.type === "string" && typeof a.status === "string" && isStrOrNull(a.due) && isStrOrNull(a.closedOn))) return false;
  if (!v.sources.every((x) => typeof x === "string")) return false;
  if (v.workPackages && !v.workPackages.every((w) => isObj(w) && typeof w.code === "string" && isBilingual(w.title) && isNumOrNull(w.valueAed))) return false;
  const ids = v.attention.map((a) => (a as { id: string }).id);
  return new Set(ids).size === ids.length;
}

export function loadPortfolio(): Portfolio | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isPortfolio(parsed)) return parsed;
    localStorage.removeItem(KEY); // never let a bad stored file brick the app on every reload
    return null;
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
