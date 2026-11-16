// jsdom environment (the repo default): loadFile reads a browser File.
import { describe, expect, it } from "vitest";
import { analyse, loadFile } from "./index";

const CSV = "KPI extract,,\nMonth,System,Failures\n2026-01-01,A,5\n2026-01-01,B,1\n2026-02-01,A,9\n2026-02-01,B,2\n2026-03-01,A,4\n2026-03-01,B,3\n";

describe("loadFile (browser File)", () => {
  it("reads a CSV File and analyses it", async () => {
    const ds = await loadFile(new File([CSV], "extract.csv", { type: "text/csv" }));
    expect(ds.filename).toBe("extract.csv");
    expect(ds.tables[0].rows).toHaveLength(6);
    expect(ds.tables[0].columns.map((c) => c.kind)).toEqual(["date", "category", "numeric"]);
    const r = analyse(ds, { lang: "en", now: 0 });
    expect(r.rejected).toEqual([]);
    expect(r.findings.length).toBeGreaterThan(0);
  });

  it("rejects a PDF File with the analytics service message", async () => {
    await expect(loadFile(new File(["%PDF-1.4"], "report.pdf"))).rejects.toThrow(/analytics service/);
  });
});
