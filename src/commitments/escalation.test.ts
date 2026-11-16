import { describe, expect, it } from "vitest";
import { DEFAULT_ESCALATION_DAYS, escalations, onTimeRate, ownerReminder } from "./escalation";
import type { Commitment, Register } from "./register";

let n = 0;
function rec(over: Partial<Commitment>): Commitment {
  n += 1;
  return {
    id: `r${n}`, kind: "action", text: `Item ${n}`, owner: "Ali", due: null, priority: "normal", dependency: null,
    source: { name: "Minutes", date: "2026-11-01", line: n, quote: `Action: Item ${n}` },
    capturedOn: "2026-11-01", status: "open", closedOn: null, ...over,
  };
}
const reg = (...records: Commitment[]): Register => ({ schemaVersion: 1, records });
const TODAY = "2026-11-16";

describe("escalations", () => {
  it("ignores closed, undated and not-yet-due items", () => {
    const r = reg(
      rec({ due: "2026-11-10", status: "closed", closedOn: "2026-11-12" }),
      rec({ due: null }),
      rec({ due: TODAY }),
      rec({ due: "2026-11-20" }),
    );
    expect(escalations(r, TODAY)).toEqual([]);
  });

  it("reminds the owner under the threshold and escalates at it", () => {
    const r = reg(rec({ text: "A", due: "2026-11-15" }), rec({ text: "B", due: "2026-11-10" }), rec({ text: "C", due: "2026-11-09" }));
    const out = escalations(r, TODAY);
    expect(out.map((e) => [e.record.text, e.daysLate, e.level])).toEqual([
      ["C", 7, "director"],
      ["B", 6, "owner"],
      ["A", 1, "owner"],
    ]);
    expect(DEFAULT_ESCALATION_DAYS).toBe(7);
  });

  it("sends an ownerless late item straight to the director", () => {
    const [e] = escalations(reg(rec({ owner: null, due: "2026-11-15" })), TODAY);
    expect(e.level).toBe("director");
    expect(e.reason).toBe("no-owner");
  });

  it("treats waiting items like open ones and honours a custom threshold", () => {
    const r = reg(rec({ status: "waiting", due: "2026-11-13" }));
    expect(escalations(r, TODAY)[0].level).toBe("owner");
    expect(escalations(r, TODAY, 3)[0].level).toBe("director");
  });

  it("does not time-travel: items captured after today are ignored", () => {
    expect(escalations(reg(rec({ capturedOn: "2026-11-20", due: "2026-11-01" })), TODAY)).toEqual([]);
  });

  it("rejects bad input instead of guessing", () => {
    expect(() => escalations(reg(), "16/11/2026")).toThrow("invalid-date");
    expect(() => escalations(reg(), TODAY, 0)).toThrow("invalid-threshold");
    expect(() => escalations(reg(), TODAY, 1.5)).toThrow("invalid-threshold");
  });
});

describe("onTimeRate", () => {
  it("counts only closed items that had a due date", () => {
    const r = reg(
      rec({ status: "closed", due: "2026-11-10", closedOn: "2026-11-10" }),
      rec({ status: "closed", due: "2026-11-10", closedOn: "2026-11-12" }),
      rec({ status: "closed", due: null, closedOn: "2026-11-12" }),
      rec({ due: "2026-11-01" }),
    );
    expect(onTimeRate(r, TODAY)).toEqual({ onTime: 1, total: 2, rate: 50 });
  });

  it("is unavailable, not zero, when nothing qualifies", () => {
    expect(onTimeRate(reg(), TODAY)).toEqual({ onTime: 0, total: 0, rate: null });
  });
});

describe("ownerReminder", () => {
  const e = escalations(reg(rec({ text: "Review the contractor offer", owner: "Ali", due: "2026-11-14" })), TODAY)[0];
  it("states the facts in English", () => {
    expect(ownerReminder(e, "en")).toBe('Ali, reminder: "Review the contractor offer" was due 2026-11-14 and is 2 days late. Please confirm the status or a new date.');
  });
  it("states the facts in Arabic", () => {
    const text = ownerReminder(e, "ar");
    expect(text).toContain("Ali");
    expect(text).toContain("2026-11-14");
    expect(text).toContain("2");
  });
  it("uses the singular for one day", () => {
    const one = escalations(reg(rec({ due: "2026-11-15" })), TODAY)[0];
    expect(ownerReminder(one, "en")).toContain("1 day late");
  });
});
