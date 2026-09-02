import { describe, expect, it } from "vitest";
import {
  derivedFlags,
  nextMilestone,
  overdueMilestones,
  scheduleRag,
  scheduleVariance,
  summarise,
  timeElapsedPct,
  upcomingMilestones,
} from "./metrics";
import type { Portfolio, Project } from "./types";
import seed from "./data/portfolio.json";
import { buildDemo } from "./data/demo";

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
  it("flags a contract ending within 90 days", () => {
    const p = project({ kind: "contract", ntp: "2023-11-01", completion: "2026-11-30" });
    const flags = derivedFlags(p, today);
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("contract-expiry");
    expect(flags[0].days).toBe(89);
  });
  it("flags overdue attention items", () => {
    const p = project({
      attention: [{ id: "a", type: "waiting", title: { en: "reply" }, due: "2026-08-01", status: "open" }],
    });
    expect(derivedFlags(p, today).map((f) => f.kind)).toEqual(["attention-overdue"]);
  });
});

describe("seed portfolio", () => {
  const portfolio = seed as Portfolio;
  it("has unique ids and only verified or tbc confidence", () => {
    const ids = portfolio.projects.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of portfolio.projects) {
      expect(["verified", "tbc"]).toContain(p.confidence);
    }
  });
  it("summarises without throwing and counts the expiring tram contract", () => {
    const s = summarise(portfolio, today, new Date("2026-08-01T00:00:00Z"));
    expect(s.projects + s.contracts).toBe(portfolio.projects.length);
    expect(s.expiringIn90).toBeGreaterThanOrEqual(1);
    expect(s.knownValueAed).toBeGreaterThan(96_000_000);
  });
});

describe("demo portfolio", () => {
  it("fills progress for every project and is marked demo", () => {
    const demo = buildDemo(seed as Portfolio);
    expect(demo.dataset).toBe("demo");
    for (const p of demo.projects) {
      expect(p.progress.planned).not.toBeNull();
      expect(p.progress.actual).not.toBeNull();
      expect(p.confidence).toBe("illustrative");
    }
    const s = summarise(demo, today, new Date("2026-08-01T00:00:00Z"));
    expect(s.rag.grey).toBe(0);
  });
});
