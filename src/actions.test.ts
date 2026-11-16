import { describe, expect, it } from "vitest";
import { addItem, closeItem, removeItem, reopenItem, setMilestoneDone, setProgress, snoozeItem } from "./actions";
import { buildShowcase } from "./data/showcase";
import { INBOX_ID, summarise } from "./metrics";

const now = new Date("2026-10-23T09:00:00Z");
const base = buildShowcase(now);

describe("actions", () => {
  it("closing an item moves it from open to closed and marks the copy as working", () => {
    const before = summarise(base, new Date("2026-10-23T00:00:00Z"));
    const next = closeItem(base, "sig-renewal", "a1", "2026-10-23");
    const after = summarise(next, new Date("2026-10-23T00:00:00Z"));
    expect(next.dataset).toBe("working");
    expect(next.base).toBe("showcase");
    expect(after.needsDecision).toBe(before.needsDecision - 1);
    expect(after.closedThisPeriod).toBe(before.closedThisPeriod + 1);
    expect(base.projects[0].attention[0].status).toBe("open"); // original untouched
    expect(reopenItem(next, "sig-renewal", "a1").projects[0].attention[0].status).toBe("open");
  });

  it("snooze pushes from the due date, or from today when already late", () => {
    const future = snoozeItem(base, "sig-renewal", "a1", 7, "2026-10-23");
    expect(future.projects[0].attention[0].due).toBe("2026-11-02"); // due was +3 days = 2026-10-26, plus 7
    const late = snoozeItem(base, "sig-renewal", "a2", 7, "2026-10-23");
    expect(late.projects[0].attention[1].due).toBe("2026-10-30"); // overdue restarts from today
  });

  it("adds to the inbox and removes again", () => {
    const item = { id: "x1", type: "waiting" as const, title: { en: "Chase finance" }, status: "open" as const, due: "2026-10-30" };
    const added = addItem(base, null, item);
    expect(added.inbox?.[0].id).toBe("x1");
    expect(summarise(added, new Date("2026-10-23T00:00:00Z")).waiting).toBe(summarise(base, new Date("2026-10-23T00:00:00Z")).waiting + 1);
    expect(removeItem(added, INBOX_ID, "x1").inbox?.some((i) => i.id === "x1")).toBe(false);
  });

  it("updates progress with clamping and completes milestones", () => {
    const p = setProgress(base, "sig-renewal", 50, 140, "2026-10-23");
    expect(p.projects[0].progress).toEqual({ planned: 50, actual: 100, asOf: "2026-10-23" });
    const m = setMilestoneDone(base, "sig-renewal", "m3", true, "2026-10-23");
    expect(m.projects[0].milestones.find((x) => x.id === "m3")).toMatchObject({ status: "done", actual: "2026-10-23" });
  });
});
