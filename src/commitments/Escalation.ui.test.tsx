import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommitmentsStrip } from "./CommitmentsStrip";
import { EscalationPanel } from "./EscalationPanel";
import { acceptCandidates, changeStatus, emptyRegister, extractMinutes, saveRegister, type Register } from "./register";

const TODAY = "2026-11-16";
function seeded(): Register {
  const minutes = [
    "Action: Review the contractor offer | Owner: Ali | Due: 2026-11-14",
    "Action: Approve the variation | Owner: Sara | Due: 2026-11-01",
    "Decision: Choose the test site | Due: 2026-11-10",
    "Action: Close the snag list | Owner: Omar | Due: 2026-11-20",
  ].join("\n");
  const { candidates } = extractMinutes(minutes, "Weekly meeting", "2026-11-01");
  let r = acceptCandidates(emptyRegister(), candidates, "2026-11-01");
  r = changeStatus(r, r.records[3].id, "closed", "2026-11-12");
  return r;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EscalationPanel", () => {
  it("splits late items into director and owner lists", () => {
    render(<EscalationPanel register={seeded()} today={TODAY} lang="en" />);
    expect(screen.getByRole("heading", { name: "Needs the director (2)" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Remind the owner (1)" })).toBeTruthy();
    expect(screen.getByText(/No owner to remind/)).toBeTruthy();
    expect(screen.getByText("Review the contractor offer")).toBeTruthy();
  });

  it("moves an item to the director when the limit is lowered", () => {
    render(<EscalationPanel register={seeded()} today={TODAY} lang="en" />);
    fireEvent.change(screen.getByLabelText(/Escalate to the director after/), { target: { value: "2" } });
    expect(screen.getByRole("heading", { name: "Needs the director (3)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy reminder" })).toBeNull();
  });

  it("says so when nothing is late", () => {
    render(<EscalationPanel register={emptyRegister()} today={TODAY} lang="en" />);
    expect(screen.getByText("Nothing is past its due date.")).toBeTruthy();
  });

  it("renders in Arabic", () => {
    render(<EscalationPanel register={seeded()} today={TODAY} lang="ar" />);
    expect(screen.getByRole("heading", { name: "التصعيد" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "بانتظار المدير (2)" })).toBeTruthy();
  });
});

describe("CommitmentsStrip", () => {
  it("invites the first minutes when the register is empty", () => {
    let opened = 0;
    render(<CommitmentsStrip lang="en" onOpen={() => opened++} />);
    expect(screen.getByText(/No commitments recorded yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open register" }));
    expect(opened).toBe(1);
  });

  it("shows the director's numbers from the saved register", () => {
    saveRegister(seeded());
    // The strip reads today's local date; pin it so the counts are stable.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
    render(<CommitmentsStrip lang="en" onOpen={() => {}} />);
    const strip = screen.getByRole("region", { name: "Commitments" });
    const tile = (name: string) => within(strip).getByText(name).closest("button")!.textContent;
    expect(tile("Needs my decision")).toContain("1");
    expect(tile("Overdue")).toContain("3");
    expect(tile("Escalated to me")).toContain("2");
    expect(tile("Closure rate")).toContain("25%");
    expect(tile("Closed on time")).toContain("100%");
  });

  it("does not hide a damaged register behind an empty prompt", () => {
    localStorage.setItem("exeflow.commitments.v1", "{not json");
    render(<CommitmentsStrip lang="en" onOpen={() => {}} />);
    expect(screen.getByText(/could not be read/)).toBeTruthy();
  });
});
