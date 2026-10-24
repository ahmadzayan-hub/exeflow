import { describe, expect, it } from "vitest";
import { parseCapture } from "./capture";

const today = new Date("2026-10-22T00:00:00Z"); // Thursday
const projects = [
  { id: "sig", name: { en: "Line A Signalling Renewal", ar: "تجديد نظام الإشارات للخط A" }, code: "DEMO-SIG-101" },
  { id: "tel", name: { en: "Tram Depot Telecom Migration", ar: "ترحيل اتصالات مستودع الترام" }, code: "DEMO-TEL-204" },
];

describe("parseCapture", () => {
  it("splits the Arabic example into two commitments with owner, due date and type", () => {
    const d = parseCapture("سجّل إن علي لازم يراجع عرض المقاول قبل الخميس، وعايز رد من المالية على الدفعة السابعة.", { today, projects });
    expect(d).toHaveLength(2);
    expect(d[0].owner).toBe("علي");
    expect(d[0].type).toBe("waiting");
    expect(d[0].due).toBe("2026-10-28"); // "before Thursday" read as Wednesday
    expect(d[0].dueNote?.ar).toContain("الخميس");
    expect(d[1].owner).toBe("المالية");
    expect(d[1].type).toBe("waiting");
    expect(d[1].title.startsWith("وعايز")).toBe(false);
  });

  it("reads English owner, weekday and decision wording", () => {
    const d = parseCapture("Ask Omar to send the revised programme by Sunday. I need to decide the procurement route next week.", { today, projects });
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ owner: "Omar", due: "2026-10-25", type: "waiting" });
    expect(d[1].type).toBe("decision");
    expect(d[1].due).toBe("2026-10-29");
  });

  it("handles relative dates, ISO dates, dd/mm and Arabic-Indic digits", () => {
    const f = (t: string) => parseCapture(t, { today, projects })[0]?.due;
    expect(f("Chase Finance tomorrow")).toBe("2026-10-23");
    expect(f("Follow up in 3 days")).toBe("2026-10-25");
    expect(f("Report due 2026-12-01")).toBe("2026-12-01");
    expect(f("Report due 05/11")).toBe("2026-11-05");
    expect(f("تابع الموضوع بعد ٣ ايام")).toBe("2026-10-25");
    expect(f("اراجع التقرير بكرة")).toBe("2026-10-23");
    expect(f("Close by end of month")).toBe("2026-10-31");
    expect(f("no date here at all")).toBeUndefined();
  });

  it("links a project only on strong evidence", () => {
    expect(parseCapture("Tram Depot Telecom Migration needs a decision on the cutover window", { today, projects })[0].projectId).toBe("tel");
    expect(parseCapture("Check DEMO-SIG-101 with the contractor", { today, projects })[0].projectId).toBe("sig");
    expect(parseCapture("Ask Ali about the telecom report", { today, projects })[0].projectId).toBeUndefined();
  });

  it("flags urgency and ignores empty input", () => {
    expect(parseCapture("urgent: approve the revised sequence", { today, projects })[0].priority).toBe("high");
    expect(parseCapture("   ", { today, projects })).toEqual([]);
  });
});
