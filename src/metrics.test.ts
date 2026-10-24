import { describe, expect, it } from "vitest";
import {
  attentionBuckets,
  derivedFlags,
  needsDecisionCount,
  nextMilestone,
  reportingWindow,
  overdueMilestones,
  scheduleRag,
  scheduleVariance,
  summarise,
  timeElapsedPct,
  upcomingMilestones,
} from "./metrics";
import type { Portfolio, Project } from "./types";
import { buildShowcase } from "./data/showcase";

const seed = buildShowcase(new Date("2026-10-23T00:00:00Z"));

const today = new Date("2026-09-02T00:00:00Z");

function project(partial: Partial<Project>): Project {
  return {
    id: "x",
    kind: "project",
    code: "X",
    name: { en: "X" },
    asset: "metro",
    category: "signalling",
    stage: "execution",
    progress: { planned: null, actual: null },
    milestones: [],
    risks: [],
    attention: [],
    sources: [],
    confidence: "verified",
    ...partial,
  };
}

describe("timeElapsedPct", () => {
  it("computes elapsed share of the contract period", () => {
    const p = project({ ntp: "2025-08-13", completion: "2028-02-12" });
    // 385 of 914 days
    expect(timeElapsedPct(p, today)).toBe(42);
  });
  it("returns null without dates", () => {
    expect(timeElapsedPct(project({}), today)).toBeNull();
  });
  it("clamps to 0..100", () => {
    expect(timeElapsedPct(project({ ntp: "2020-01-01", completion: "2021-01-01" }), today)).toBe(100);
    expect(timeElapsedPct(project({ ntp: "2030-01-01", completion: "2031-01-01" }), today)).toBe(0);
  });
});

describe("scheduleRag", () => {
  it("uses progress variance when available", () => {
    expect(scheduleRag(project({ progress: { planned: 50, actual: 49 } }), today)).toBe("green");
    expect(scheduleRag(project({ progress: { planned: 50, actual: 43 } }), today)).toBe("amber");
    expect(scheduleRag(project({ progress: { planned: 50, actual: 30 } }), today)).toBe("red");
    expect(scheduleVariance(project({ progress: { planned: 50, actual: 43 } }))).toBe(-7);
  });
  it("is grey when nothing can be assessed", () => {
    expect(scheduleRag(project({}), today)).toBe("grey");
  });
  it("falls back to milestone lateness", () => {
    const soon = project({
      milestones: [{ id: "m", title: { en: "m" }, planned: "2026-08-20", status: "open" }],
    });
    expect(scheduleRag(soon, today)).toBe("amber");
    const late = project({
      milestones: [{ id: "m", title: { en: "m" }, planned: "2026-03-01", status: "open" }],
    });
    expect(scheduleRag(late, today)).toBe("red");
  });
  it("ignores completed milestones", () => {
    const p = project({
      milestones: [{ id: "m", title: { en: "m" }, planned: "2026-03-01", actual: "2026-03-01", status: "done" }],
    });
    expect(overdueMilestones(p, today)).toHaveLength(0);
    expect(scheduleRag(p, today)).toBe("grey");
  });
});

describe("milestone helpers", () => {
  const p = project({
    milestones: [
      { id: "a", title: { en: "a" }, planned: "2026-08-01", actual: "2026-08-01", status: "done" },
      { id: "b", title: { en: "b" }, planned: "2026-09-20", status: "open" },
      { id: "c", title: { en: "c" }, planned: "2026-12-01", status: "open" },
      { id: "d", title: { en: "d" }, planned: null, status: "open" },
    ],
  });
  it("finds the next open milestone", () => {
    expect(nextMilestone(p, today)?.id).toBe("b");
  });
  it("lists milestones due within the window", () => {
    expect(upcomingMilestones(p, today, 30).map((m) => m.id)).toEqual(["b"]);
  });
});

describe("derivedFlags", () => {
  it("flags a contract ending within 90 days as a decision, a project completion as information", () => {
    const c = project({ kind: "contract", ntp: "2023-11-01", completion: "2026-11-30" });
    const flags = derivedFlags(c, today);
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("contract-expiry");
    expect(flags[0].days).toBe(89);
    const p = project({ kind: "project", ntp: "2023-11-01", completion: "2026-11-30" });
    expect(derivedFlags(p, today).map((f) => f.kind)).toEqual(["completion-approaching"]);
    expect(attentionBuckets(p, today).contractExpiry).toBeNull();
  });
  it("keys flags by the milestone id so duplicate titles do not collide", () => {
    const p = project({
      milestones: [
        { id: "m1", title: { en: "Site works" }, planned: "2026-08-01", status: "open" },
        { id: "m2", title: { en: "Site works" }, planned: "2026-08-15", status: "open" },
      ],
    });
    const ids = derivedFlags(p, today).map((f) => f.id);
    expect(new Set(ids).size).toBe(2);
  });
  it("flags overdue attention items", () => {
    const p = project({
      attention: [{ id: "a", type: "waiting", title: { en: "reply" }, due: "2026-08-01", status: "open" }],
    });
    expect(derivedFlags(p, today).map((f) => f.kind)).toEqual(["attention-overdue"]);
  });
});

describe("attentionBuckets", () => {
  it("moves past-due decisions and waiting items to overdue so tiles and columns agree", () => {
    const p = project({
      kind: "contract",
      ntp: "2023-11-01",
      completion: "2026-11-30",
      milestones: [{ id: "m", title: { en: "m" }, planned: "2026-08-01", status: "open" }],
      attention: [
        { id: "d1", type: "decision", title: { en: "d1" }, due: "2026-09-30", status: "open" },
        { id: "d2", type: "decision", title: { en: "d2" }, due: "2026-08-01", status: "open" },
        { id: "w1", type: "waiting", title: { en: "w1" }, status: "open" },
        { id: "w2", type: "waiting", title: { en: "w2" }, status: "closed", closedOn: "2026-08-20" },
      ],
    });
    const b = attentionBuckets(p, today);
    expect(b.decisions.map((a) => a.id)).toEqual(["d1"]);
    expect(b.waiting.map((a) => a.id)).toEqual(["w1"]);
    expect(b.overdueItems.map((a) => a.id)).toEqual(["d2"]);
    expect(b.overdueCount).toBe(2); // d2 + milestone m
    expect(needsDecisionCount(b)).toBe(2); // d1 + contract expiry
    const s = summarise({ ...(seed as Portfolio), inbox: [], projects: [p] }, today, { start: new Date("2026-08-01T00:00:00Z"), end: new Date("2026-08-31T00:00:00Z") });
    expect(s.needsDecision).toBe(2);
    expect(s.waiting).toBe(1);
    expect(s.overdue).toBe(2);
    expect(s.closedThisPeriod).toBe(1);
  });
});

describe("reportingWindow", () => {
  it("uses explicit start and end when given", () => {
    const w = reportingWindow(seed as Portfolio);
    expect(w.start.toISOString().slice(0, 10)).toBe("2026-09-23");
    expect(w.end.toISOString().slice(0, 10)).toBe("2026-10-23");
  });
  it("falls back to the calendar month of the as-of date", () => {
    const p: Portfolio = { ...(seed as Portfolio), reportingPeriod: { label: { en: "x" }, asOf: "2026-09-15" } };
    const w = reportingWindow(p);
    expect(w.start.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(w.end.toISOString().slice(0, 10)).toBe("2026-09-30");
    const closedInPeriod = project({ attention: [{ id: "a", type: "waiting", title: { en: "a" }, status: "closed", closedOn: "2026-09-02" }] });
    expect(summarise({ ...p, projects: [closedInPeriod] }, new Date("2026-09-15T00:00:00Z")).closedThisPeriod).toBe(1);
    // a July closure must not leak into an August-labelled period whose as-of is 31 Aug
    const aug: Portfolio = { ...(seed as Portfolio), reportingPeriod: { label: { en: "Aug" }, asOf: "2026-08-31" } };
    const closedJuly = project({ attention: [{ id: "a", type: "waiting", title: { en: "a" }, status: "closed", closedOn: "2026-07-10" }] });
    expect(summarise({ ...aug, projects: [closedJuly] }, new Date("2026-08-31T00:00:00Z")).closedThisPeriod).toBe(0);
  });
});

describe("showcase portfolio", () => {
  const portfolio = seed as Portfolio;
  const asOf = new Date("2026-10-23T00:00:00Z");
  it("has unique ids and only illustrative or tbc confidence", () => {
    const ids = portfolio.projects.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of portfolio.projects) expect(["illustrative", "tbc"]).toContain(p.confidence);
  });
  it("contains no real contract references", () => {
    const text = JSON.stringify(portfolio);
    expect(text).not.toMatch(/RA\/RM|RTA-LETTER|ACB-LETTER/);
    expect(portfolio.projects.every((p) => (p.code ?? "").startsWith("DEMO-"))).toBe(true);
  });
  it("produces a populated, varied dashboard", () => {
    const s = summarise(portfolio, asOf);
    expect(s.projects + s.contracts).toBe(portfolio.projects.length);
    expect(s.expiringIn90).toBeGreaterThanOrEqual(1);
    expect(s.needsDecision).toBeGreaterThanOrEqual(4);
    expect(s.overdue).toBeGreaterThanOrEqual(4);
    expect(s.waiting).toBeGreaterThanOrEqual(3);
    expect(s.closedThisPeriod).toBeGreaterThanOrEqual(4);
    expect(s.rag.green).toBeGreaterThan(0);
    expect(s.rag.amber).toBeGreaterThan(0);
    expect(s.rag.red).toBeGreaterThan(0);
    expect(s.rag.grey).toBeGreaterThan(0);
  });
  it("moves with the date it is built for", () => {
    const later = buildShowcase(new Date("2026-12-01T00:00:00Z"));
    expect(later.reportingPeriod.asOf).toBe("2026-12-01");
    expect(later.projects[0].completion).not.toBe(portfolio.projects[0].completion);
    expect(summarise(later, new Date("2026-12-01T00:00:00Z")).overdue).toBe(summarise(portfolio, asOf).overdue);
  });
});
