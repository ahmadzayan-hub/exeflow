import { describe, expect, it } from "vitest";
import { isPortfolio } from "./storage";
import seed from "./data/portfolio.json";

describe("isPortfolio", () => {
  it("accepts the seed register", () => {
    expect(isPortfolio(seed)).toBe(true);
  });
  it("rejects a shallow file that would crash the metrics engine", () => {
    expect(isPortfolio({ schemaVersion: 1, projects: [{ id: "x" }], reportingPeriod: { asOf: "2026-01-01" } })).toBe(false);
    expect(isPortfolio({ ...seed, reportingPeriod: null })).toBe(false);
    expect(isPortfolio({ ...seed, projects: [{ ...seed.projects[0], attention: undefined }] })).toBe(false);
    expect(isPortfolio({ ...seed, projects: [{ ...seed.projects[0], valueAed: "96M" }] })).toBe(false);
  });
  it("tolerates unknown enum strings (shown as-is by the UI)", () => {
    expect(isPortfolio({ ...seed, projects: [{ ...seed.projects[0], stage: "on-hold" }] })).toBe(true);
  });
});
