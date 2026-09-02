import type { Milestone, Portfolio, Project } from "../types";

/**
 * Builds a fully populated demonstration dataset from the seed register.
 * Every filled value is illustrative and the result is labelled as such.
 * Deterministic: the same seed always produces the same demo.
 */
export function buildDemo(seed: Portfolio): Portfolio {
  const projects = seed.projects.map((p, i): Project => {
    const planned = 20 + ((i * 17) % 60);
    const drift = [-1, -6, 3, -14, 0, -4, 1, -9, 2, -3, 0, -12, 4, -2][i % 14];
    const actual = Math.max(0, Math.min(100, planned + drift));
    const valueAed = p.valueAed ?? 2_000_000 + ((i * 3_750_000) % 40_000_000);
    const ntp = p.ntp ?? `2025-0${1 + (i % 9)}-15`;
    const completion = p.completion ?? `2027-0${1 + ((i + 3) % 9)}-28`;
    const milestones: Milestone[] = p.milestones.length
      ? p.milestones
      : [
          { id: "m1", title: { en: "Design approval", ar: "اعتماد التصميم" }, planned: "2026-05-15", actual: i % 3 === 0 ? null : "2026-05-20", status: i % 3 === 0 ? "open" : "done" },
          { id: "m2", title: { en: "Site works 50%", ar: "أعمال الموقع 50%" }, planned: `2026-09-${10 + (i % 15)}`, status: i % 4 === 1 ? "at-risk" : "open" },
          { id: "m3", title: { en: "Testing and commissioning", ar: "الاختبار والتشغيل" }, planned: "2027-03-01", status: "open" },
        ];
    return {
      ...p,
      valueAed,
      spentAed: Math.round(valueAed * (actual / 100)),
      ntp,
      completion,
      progress: { planned, actual, asOf: seed.reportingPeriod.asOf },
      milestones: milestones.map((m) => ({ ...m })),
      attention: [
        ...p.attention.map((a) => ({ ...a, confidence: "illustrative" as const })),
        ...(i % 2 === 0
          ? [
              {
                id: "demo-closed",
                type: "waiting" as const,
                title: { en: "Monthly progress report received", ar: "استلام تقرير التقدم الشهري" },
                status: "closed" as const,
                closedOn: "2026-08-20",
                confidence: "illustrative" as const,
              },
            ]
          : []),
      ],
      confidence: "illustrative",
    };
  });
  return {
    ...seed,
    dataset: "demo",
    title: seed.title,
    disclaimer: {
      en: "DEMONSTRATION DATA. Progress, values and dates shown here are illustrative and do not represent RMD records.",
      ar: "بيانات توضيحية. نسب الإنجاز والقيم والتواريخ هنا للعرض فقط ولا تمثل سجلات الإدارة.",
    },
    projects,
  };
}
