import { describe, expect, it } from "vitest";
import { summarise } from "../metrics";
import type { Portfolio, Project } from "../types";
import { commandRows, parseCommand, resolveProject } from "./commands";

const today = new Date("2026-09-02T00:00:00Z");
const project: Project = {
  id: "alpha", code: "A-1", kind: "project", name: { en: "Alpha", ar: "ألفا" },
  asset: "metro", category: "signalling", stage: "execution", confidence: "tbc",
  progress: { planned: null, actual: null }, risks: [], sources: ["Synthetic source"],
  attention: [
    { id: "late-waiting", type: "waiting", title: { en: "Past due", ar: "متأخر" }, status: "open", due: "2026-09-01", owner: "Test owner", reference: "REF-1" },
    { id: "today", type: "waiting", title: { en: "Due today" }, status: "open", due: "2026-09-02" },
    { id: "undated", type: "waiting", title: { en: "No date" }, status: "open", due: null },
    { id: "closed", type: "waiting", title: { en: "Closed" }, status: "closed", due: "2026-01-01" },
  ],
  milestones: [
    { id: "late", title: { en: "Late milestone" }, status: "open", planned: "2026-08-01" },
    { id: "done", title: { en: "Done milestone" }, status: "done", planned: "2026-01-01" },
  ],
};

describe("portfolio commands", () => {
  it("accepts the documented bilingual commands without treating arbitrary text as an action", () => {
    expect(parseCommand(" /OVERDUE ")).toEqual({ kind: "overdue" });
    expect(parseCommand("متأخرات")).toEqual({ kind: "overdue" });
    expect(parseCommand("انتظار")).toEqual({ kind: "waiting" });
    expect(parseCommand("مشروع ألفا")).toEqual({ kind: "project", query: "ألفا" });
    expect(parseCommand("project A-1")).toEqual({ kind: "project", query: "a-1" });
    expect(parseCommand("delete overdue")).toEqual({ kind: "unknown" });
    expect(parseCommand(" ")).toEqual({ kind: "unknown" });
  });

  it("agrees with dashboard counts and moves past-due waiting items into overdue exactly once", () => {
    const portfolio = { projects: [project], reportingPeriod: { asOf: "2026-09-02" } } as Portfolio;
    const summary = summarise(portfolio, today);
    const before = JSON.stringify(project);
    const overdue = commandRows("overdue", [project], today, "en");
    const waiting = commandRows("waiting", [project], today, "en");
    expect(overdue).toHaveLength(summary.overdue);
    expect(waiting).toHaveLength(summary.waiting);
    expect(overdue.map((r) => r.title)).toEqual(["Late milestone", "Past due"]);
    expect(waiting.map((r) => r.title)).toEqual(["Due today", "No date"]);
    expect(JSON.stringify(project)).toBe(before);
  });

  it("uses the report date and only the supplied filter scope", () => {
    expect(commandRows("overdue", [], today, "en")).toEqual([]);
    expect(commandRows("overdue", [project], new Date("2026-07-01T00:00:00Z"), "en")).toEqual([]);
    expect(resolveProject("A-1", "", [])).toEqual([]);
  });

  it("retains evidence and never infers a milestone owner or reference", () => {
    const [milestone, attention] = commandRows("overdue", [project], today, "ar");
    expect(milestone).toMatchObject({ owner: null, reference: null, due: "2026-08-01", derived: true, confidence: "tbc" });
    expect(attention).toMatchObject({ title: "متأخر", owner: "Test owner", reference: "REF-1", due: "2026-09-01" });
    expect(attention.project.sources).toEqual(["Synthetic source"]);
  });

  it("handles optional imported metadata and empty results without fabrication", () => {
    const imported = { ...project, attention: [{ ...project.attention[0], owner: { bad: true }, reference: 12, confidence: {} }] } as unknown as Project;
    expect(commandRows("overdue", [imported], today, "en")[1]).toMatchObject({ owner: null, reference: null, confidence: "tbc" });
    expect(resolveProject("unknown", "alpha", [project])).toEqual([]);
    expect(resolveProject("", "", [project])).toEqual([]);
  });

  it("resolves exact bilingual names or selection and preserves ambiguity", () => {
    expect(resolveProject("ألفا", "", [project])).toEqual([project]);
    expect(resolveProject("A-1", "", [project])).toEqual([project]);
    expect(resolveProject("", "alpha", [project])).toEqual([project]);
    expect(resolveProject("Al", "", [project])).toEqual([]);
    expect(resolveProject("Alpha", "", [project, { ...project, id: "beta" }])).toHaveLength(2);
  });
});
