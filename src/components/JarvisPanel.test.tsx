import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { JarvisPanel } from "./JarvisPanel";
import type { Portfolio, Project } from "../types";

const project: Project = {
  id: "a", code: "A-1", kind: "project", name: { en: "Synthetic project", ar: "مشروع تجريبي" },
  asset: "metro", category: "power", stage: "execution", confidence: "illustrative",
  progress: { planned: null, actual: null }, risks: [], milestones: [], sources: ["Synthetic record"],
  attention: [{ id: "late", type: "waiting", title: { en: "Synthetic item" }, due: "2026-09-01", owner: "Owner A", status: "open" }],
};
const portfolio: Portfolio = {
  schemaVersion: 1, dataset: "demo", title: { en: "Test" }, organisation: { en: "Test" },
  disclaimer: { en: "Synthetic data" }, reportingPeriod: { asOf: "2026-09-02", label: { en: "September" } }, projects: [project],
};
const props = { portfolio, projects: portfolio.projects, today: new Date("2026-09-02T00:00:00Z"), lang: "en" as const, onSelect: vi.fn() };

function installSpeech(localService = true) {
  const synth = { getVoices: () => [{ lang: "en-GB", localService }], speaking: false, pending: false, speak: vi.fn(), cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
  return synth;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Jarvis panel integration", () => {
  it("submits a labelled typed command and opens its existing source record", () => {
    render(<JarvisPanel {...props} />);
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "overdue" } });
    fireEvent.submit(screen.getByRole("button", { name: "Run" }).closest("form")!);
    expect(screen.getByText("Synthetic item")).toBeTruthy();
    expect(screen.getByText("Owner A")).toBeTruthy();
    expect(screen.getByText("Synthetic record")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Synthetic project" }));
    expect(props.onSelect).toHaveBeenCalledWith("a");
  });

  it("recalculates results and cancels explicit readback when filters change", () => {
    const synth = installSpeech();
    const { rerender } = render(<JarvisPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Overdue" }));
    expect(synth.speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Read summary locally" }));
    expect(synth.speak).toHaveBeenCalledOnce();
    rerender(<JarvisPanel {...props} projects={[]} />);
    expect(screen.queryByText("Synthetic item")).toBeNull();
    expect(screen.getByText(/Overdue: 0/)).toBeTruthy();
    expect(synth.cancel).toHaveBeenCalledOnce();
  });

  it("stops readback on Escape, language change and unmount without restarting automatically", () => {
    const synth = installSpeech();
    const { rerender, unmount } = render(<JarvisPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Overdue" }));
    fireEvent.click(screen.getByRole("button", { name: "Read summary locally" }));
    fireEvent.keyDown(screen.getByLabelText("Command"), { key: "Escape" });
    expect(synth.cancel).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Read summary locally" }));
    rerender(<JarvisPanel {...props} lang="ar" />);
    expect(synth.cancel).toHaveBeenCalledTimes(2);
    expect(synth.speak).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("disables readback when only a remote voice exists", () => {
    const synth = installSpeech(false);
    render(<JarvisPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Overdue" }));
    expect((screen.getByRole("button", { name: "Read summary locally" }) as HTMLButtonElement).disabled).toBe(true);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("cancels active readback on portfolio replacement and unmount", () => {
    const synth = installSpeech();
    const { rerender, unmount } = render(<JarvisPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Overdue" }));
    fireEvent.click(screen.getByRole("button", { name: "Read summary locally" }));
    const replacement = { ...portfolio, projects: [{ ...project, attention: [] }] };
    rerender(<JarvisPanel {...props} portfolio={replacement} projects={replacement.projects} />);
    expect(screen.queryByText("Synthetic item")).toBeNull();
    expect(synth.cancel).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Read summary locally" }));
    unmount();
    expect(synth.cancel).toHaveBeenCalledTimes(2);
  });

  it("cancels active readback when the document is hidden", () => {
    const synth = installSpeech();
    render(<JarvisPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Overdue" }));
    fireEvent.click(screen.getByRole("button", { name: "Read summary locally" }));
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    expect(synth.cancel).toHaveBeenCalledOnce();
    hidden.mockRestore();
  });

  it("keeps text commands working if voice discovery fails", () => {
    const synth = installSpeech();
    synth.getVoices = () => { throw new Error("voice service unavailable"); };
    render(<JarvisPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Overdue" }));
    expect(screen.getByText("Synthetic item")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Read summary locally" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("resolves a selected project and rejects a selection removed from the filter scope", () => {
    const { rerender } = render(<JarvisPanel {...props} />);
    fireEvent.change(screen.getByLabelText("Project in current filters"), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: "Selected project" }));
    expect(screen.getByRole("button", { name: "Open project record" })).toBeTruthy();
    rerender(<JarvisPanel {...props} projects={[]} />);
    expect(screen.queryByRole("button", { name: "Open project record" })).toBeNull();
    expect(screen.getByText(/Select a project or enter/)).toBeTruthy();
  });

  it("accepts Arabic commands and refuses date calculations for an invalid report date", () => {
    const { rerender } = render(<JarvisPanel {...props} lang="ar" />);
    fireEvent.change(screen.getByLabelText("الأمر"), { target: { value: "متأخرات" } });
    fireEvent.submit(screen.getByRole("button", { name: "تنفيذ" }).closest("form")!);
    expect(screen.getByRole("button", { name: "مشروع تجريبي" })).toBeTruthy();
    rerender(<JarvisPanel {...props} portfolio={{ ...portfolio, reportingPeriod: { ...portfolio.reportingPeriod, asOf: "invalid" } }} />);
    expect(screen.getByText(/The report date is invalid/)).toBeTruthy();
    expect(screen.queryByText("Synthetic item")).toBeNull();
  });
});
