/**
 * Management report in the RMD structure, built from confirmed findings only.
 * English is British English; Arabic is formal Modern Standard Arabic in the
 * UAE government register. Every number is copied from a finding or KPI.
 */

import type { Finding, RunResult } from "../reporting/api";
import { ltr } from "./util";

type Lang = "en" | "ar";

const HEADINGS = {
  en: {
    summary: "# Executive summary",
    facts: "## Key facts",
    analysis: "## Analysis",
    risks: "## Risks and gaps",
    actions: "## Recommended actions",
    next: "## Next steps",
  },
  ar: {
    summary: "# الملخص التنفيذي",
    facts: "## الحقائق الرئيسية",
    analysis: "## التحليل",
    risks: "## المخاطر والفجوات",
    actions: "## الإجراءات الموصى بها",
    next: "## الخطوات التالية",
  },
} as const;

export const REPORT_HEADINGS = HEADINGS;

const SEV = {
  en: { high: "high severity", medium: "medium severity", low: "low severity" },
  ar: { high: "أهمية مرتفعة", medium: "أهمية متوسطة", low: "أهمية منخفضة" },
} as const;

const SEV_RANK: Record<Finding["severity"], number> = { high: 0, medium: 1, low: 2 };

function isGap(f: Finding, evidence: RunResult["evidence"]): boolean {
  return f.evidence.length > 0 && f.evidence.every((id) => evidence[id]?.tool === "describe_table");
}

/** Arabic count phrase: one, two, 3 to 10, 11 and over. */
function arCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return n <= 10 ? `${n} ${few}` : `${n} ${many}`;
}

function enCount(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function summary(lang: Lang, ok: Finding[], rejected: Finding[], gaps: Finding[]): string {
  const main = [...ok.filter((f) => !gaps.includes(f))].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])[0] ?? gaps[0];
  const high = ok.filter((f) => f.severity === "high").length;
  const s: string[] = [];
  if (lang === "en") {
    if (main) {
      s.push(`${main.title}.`);
      s.push(`${enCount(ok.length, "finding", "findings")} passed the evidence check${high ? `, ${high} of high severity` : ""}.`);
    } else {
      s.push("No finding passed the evidence check.");
    }
    if (rejected.length) s.push(`${enCount(rejected.length, "further finding", "further findings")} did not pass and ${rejected.length === 1 ? "was" : "were"} left out.`);
    s.push("The data shows what changed, not why, and it holds no targets.");
    if (gaps.length) s.push(`${enCount(gaps.length, "data gap is", "data gaps are")} listed under Risks and gaps.`);
    return s.join(" ");
  }
  if (main) {
    s.push(`${main.title}.`);
    s.push(`اجتازت ${arCount(ok.length, "نتيجة واحدة", "نتيجتان", "نتائج", "نتيجة")} فحص الأدلة${high ? `، منها ${high} ذات أهمية مرتفعة` : ""}.`);
  } else {
    s.push("لم تجتز أي نتيجة فحص الأدلة.");
  }
  if (rejected.length) s.push(`ولم تجتز ${arCount(rejected.length, "نتيجة إضافية واحدة", "نتيجتان إضافيتان", "نتائج إضافية", "نتيجة إضافية")} الفحص فاستُبعدت.`);
  s.push("تبيّن البيانات ما تغيّر ولا تبيّن أسباب التغيّر، ولا تتضمن مستهدفات.");
  if (gaps.length) s.push(`وترد ${arCount(gaps.length, "فجوة واحدة", "فجوتان", "فجوات", "فجوة")} في البيانات ضمن قسم المخاطر والفجوات.`);
  return s.join(" ");
}

function kpiLine(lang: Lang, k: RunResult["kpis"][number]): string {
  const value = typeof k.value === "number" ? String(k.value) : k.value;
  const unit = k.unit ? (k.unit === "%" ? "%" : ` ${k.unit}`) : "";
  const trend =
    k.trend === "up"
      ? lang === "en" ? " (up on the previous period)" : " (أعلى من الفترة السابقة)"
      : k.trend === "down"
        ? lang === "en" ? " (down on the previous period)" : " (أدنى من الفترة السابقة)"
        : k.trend === "flat"
          ? lang === "en" ? " (unchanged on the previous period)" : " (دون تغير عن الفترة السابقة)"
          : "";
  return `- ${k.label}: ${lang === "ar" && typeof k.value === "string" ? `"${ltr(value)}"` : value}${unit}${trend}`;
}

export function buildReport(result: RunResult, lang: Lang): string {
  const L: Lang = lang === "ar" ? "ar" : "en";
  const H = HEADINGS[L];
  const gapFindings = result.findings.filter((f) => isGap(f, result.evidence));
  const metricFindings = result.findings.filter((f) => !gapFindings.includes(f));
  const out: string[] = [];

  out.push(H.summary, "", summary(L, result.findings, result.rejected, gapFindings), "");

  out.push(H.facts, "");
  if (result.kpis.length) result.kpis.forEach((k) => out.push(kpiLine(L, k)));
  else out.push(L === "en" ? "- No KPI could be computed from the data." : "- تعذر احتساب أي مؤشر من البيانات.");
  out.push(L === "en" ? `- Source: ${result.dataset.filename}` : `- المصدر: ${ltr(result.dataset.filename)}`, "");

  out.push(H.analysis, "");
  if (result.question) out.push(L === "en" ? `Question asked: ${result.question}` : `السؤال المطروح: ${result.question}`, "");
  if (metricFindings.length) {
    for (const f of metricFindings) out.push(`**${f.title}** (${SEV[L][f.severity]}). ${f.detail}`, "");
  } else {
    out.push(L === "en" ? "No finding on the numbers passed the evidence check." : "لم تجتز أي نتيجة على الأرقام فحص الأدلة.", "");
  }

  out.push(H.risks, "");
  out.push(
    L === "en"
      ? "- The data shows what changed, not why. It holds no targets, so severity reflects the size of a change or a share only."
      : "- تبيّن البيانات ما تغيّر ولا تبيّن أسباب التغيّر. ولا تتضمن مستهدفات، لذا يعكس تصنيف الأهمية حجم التغيّر أو الحصة فقط.",
  );
  for (const f of gapFindings) out.push(`- ${f.title}. ${f.detail}`);
  for (const w of result.warnings) out.push(`- ${w}`);
  for (const r of result.rejected.slice(0, 5)) {
    out.push(L === "en" ? `- Left out: ${r.title}. Reason: ${r.reason ?? "not confirmed"}.` : `- استُبعدت: ${r.title}. السبب: ${r.reason ?? "غير مؤكدة"}.`);
  }
  out.push("");

  out.push(H.actions, "");
  const seen = new Set<string>();
  const recs: string[] = [];
  for (const f of [...metricFindings, ...gapFindings]) {
    const r = f.recommendation?.trim();
    if (r && !seen.has(r)) {
      seen.add(r);
      recs.push(r);
    }
  }
  if (recs.length) recs.slice(0, 6).forEach((r, i) => out.push(`${i + 1}. ${r}`));
  else out.push(L === "en" ? "No action is recommended on the evidence available." : "لا يُوصى بأي إجراء استناداً إلى الأدلة المتاحة.");
  out.push("");

  out.push(H.next, "");
  const next =
    L === "en"
      ? [
          "Confirm the flagged items with their owners before the next review.",
          "Add targets or thresholds to the source file, so that severity can be judged against them.",
          ...(gapFindings.length ? ["Correct the data gaps listed above and run the analysis again."] : []),
          ...(result.question ? [] : ["Ask a specific question to focus the next run."]),
        ]
      : [
          "تأكيد البنود المرصودة مع المسؤولين عنها قبل المراجعة القادمة.",
          "إضافة المستهدفات أو الحدود المرجعية إلى الملف المصدر ليمكن الحكم على الأهمية استناداً إليها.",
          ...(gapFindings.length ? ["معالجة فجوات البيانات الواردة أعلاه وإعادة تشغيل التحليل."] : []),
          ...(result.question ? [] : ["طرح سؤال محدد لتركيز التحليل القادم."]),
        ];
  next.forEach((n, i) => out.push(`${i + 1}. ${n}`));
  out.push("");

  return out.join("\n");
}
