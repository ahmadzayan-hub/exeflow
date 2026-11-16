// @vitest-environment node
import { describe, expect, it } from "vitest";
import { detectDelimiter, findHeader, loadBuffer, MAX_BYTES, MAX_ROWS, parseCsv, parseDateText, parseNumeric } from "./parse";
import { csvBytes, fixtureBytes, loadFixture } from "./testing";

describe("parseCsv (RFC 4180)", () => {
  it("handles quotes, escaped quotes, embedded delimiter and CRLF", () => {
    const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
    ]);
  });

  it("keeps a newline inside a quoted field", () => {
    const rows = parseCsv('name,note\n"Line one\nline two",3\nplain,4\n');
    expect(rows).toEqual([
      ["name", "note"],
      ["Line one\nline two", "3"],
      ["plain", "4"],
    ]);
  });

  it("accepts LF, CRLF and lone CR line ends and ignores the final newline", () => {
    expect(parseCsv("a,b\n1,2\n")).toHaveLength(2);
    expect(parseCsv("a,b\r\n1,2\r\n")).toHaveLength(2);
    expect(parseCsv("a,b\r1,2\r")).toHaveLength(2);
  });

  it("detects a semicolon delimiter", () => {
    expect(detectDelimiter("a;b;c\n1;2;3\n4;5;6\n")).toBe(";");
    expect(parseCsv("a;b;c\n1;2;3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("detects a tab delimiter and a comma delimiter", () => {
    expect(detectDelimiter("a\tb\n1\t2\n")).toBe("\t");
    expect(detectDelimiter("a,b\n1,2\n")).toBe(",");
  });

  it("ignores a delimiter that only appears inside quotes", () => {
    expect(detectDelimiter('a,b\n"1;2;3;4","x;y"\n"5;6;7;8","z;w"\n')).toBe(",");
  });

  it("strips a byte order mark", () => {
    expect(parseCsv("﻿a,b\n1,2")[0]).toEqual(["a", "b"]);
  });

  it("uses an explicit delimiter when given", () => {
    expect(parseCsv("a|b\n1|2", "|")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("coercion", () => {
  it("reads numbers stored as text", () => {
    expect(parseNumeric("1,050")).toBe(1050);
    expect(parseNumeric("98%")).toBe(98);
    expect(parseNumeric(" 12.5 ")).toBe(12.5);
    expect(parseNumeric("-3")).toBe(-3);
    expect(parseNumeric("١٬٠٥٠")).toBe(1050);
    expect(parseNumeric("Signalling")).toBeNull();
    expect(parseNumeric("1,2,3")).toBeNull();
    expect(parseNumeric("")).toBeNull();
  });

  it("reads ISO dates and day-first dates as UTC", () => {
    expect(parseDateText("2026-05-01")?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(parseDateText("2026-05")?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(parseDateText("2026-05-01T10:30:00Z")?.toISOString()).toBe("2026-05-01T10:30:00.000Z");
    expect(parseDateText("01/05/2026")?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(parseDateText("2026-13-01")).toBeNull();
    expect(parseDateText("not a date")).toBeNull();
  });

  it("types a column when at least 80% of values parse", async () => {
    const ds = await loadBuffer("t.csv", csvBytes("Name,Amount,When\nA,\"1,050\",2026-01-05\nB,98%,2026-01-06\nC,12,2026-01-07\nD,x,2026-01-08\nE,5,2026-01-09\n"));
    const t = ds.tables[0];
    expect(t.columns.find((c) => c.name === "Amount")?.kind).toBe("numeric");
    expect(t.rows.map((r) => r.Amount)).toEqual([1050, 98, 12, null, 5]);
    expect(t.columns.find((c) => c.name === "When")?.kind).toBe("date");
    expect(t.rows[0].When).toBeInstanceOf(Date);
  });

  it("leaves a mostly-text column as text", async () => {
    const ds = await loadBuffer("t.csv", csvBytes("Name,Code\nA,x1\nB,x2\nC,3\n"));
    expect(ds.tables[0].rows.map((r) => r.Code)).toEqual(["x1", "x2", "3"]);
  });
});

describe("header detection", () => {
  it("finds the header below a title row", async () => {
    const ds = await loadFixture("kpi_q2_2026.csv");
    const t = ds.tables[0];
    expect(t.name).toBe("data");
    expect(t.columns.map((c) => c.name)).toEqual(["Month", "System", "Failures", "Delay Minutes", "PM Completion"]);
    expect(t.rows).toHaveLength(15);
  });

  it("scans only the first 15 rows and prefers a full text row", () => {
    const raw = [["Title", null, null], [null, null, null], ["A", "B", "C"], [1, 2, 3]];
    expect(findHeader(raw)).toBe(2);
  });

  it("renames blank and repeated headers and records the repeats", async () => {
    const ds = await loadBuffer("d.csv", csvBytes("Site,Site,\n1,2,3\n4,5,6\n"));
    const t = ds.tables[0];
    expect(t.columns.map((c) => c.name)).toEqual(["Site", "Site_1", "col"]);
    expect(t.duplicated_headers).toEqual(["Site"]);
  });

  it("drops empty rows and columns that are empty throughout", async () => {
    const ds = await loadBuffer("d.csv", csvBytes("A,B,C\n1,,x\n\n2,,y\n"));
    expect(ds.tables[0].columns.map((c) => c.name)).toEqual(["A", "C"]);
    expect(ds.tables[0].rows).toHaveLength(2);
  });
});

describe("loading files", () => {
  it("removes a BOM from the first header", async () => {
    const ds = await loadBuffer("b.csv", csvBytes("﻿Month,Value\n2026-01-01,5\n2026-02-01,6\n"));
    expect(ds.tables[0].columns[0].name).toBe("Month");
  });

  it("reads a semicolon file and a tsv file", async () => {
    const semi = await loadBuffer("s.csv", csvBytes("Name;Qty\nA;1\nB;2\n"));
    expect(semi.tables[0].columns.map((c) => c.name)).toEqual(["Name", "Qty"]);
    expect(semi.kind).toBe("csv");
    const tsv = await loadBuffer("s.tsv", csvBytes("Name\tQty\nA\t1\nB\t2\n"));
    expect(tsv.kind).toBe("tsv");
    expect(tsv.tables[0].rows[1].Qty).toBe(2);
  });

  it("accepts an ArrayBuffer as well as a typed array", async () => {
    const u8 = fixtureBytes("kpi_q2_2026.csv");
    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
    const ds = await loadBuffer("kpi_q2_2026.csv", ab);
    expect(ds.tables[0].rows).toHaveLength(15);
    expect(ds.name).toBe("kpi_q2_2026");
    expect(ds.id).toMatch(/^[0-9a-f]{12}$/);
  });

  it("loads the xlsx fixture to the same table as the csv fixture", async () => {
    const csv = await loadFixture("kpi_q2_2026.csv");
    const xlsx = await loadFixture("kpi_q2_2026.xlsx");
    expect(xlsx.kind).toBe("xlsx");
    const a = csv.tables[0];
    const b = xlsx.tables.find((t) => t.name === "KPI_Data");
    expect(b).toBeDefined();
    expect(b?.columns).toEqual(a.columns);
    expect(b?.rows).toEqual(a.rows);
    expect(b?.rows[0].Month).toBeInstanceOf(Date);
    expect(b?.rows[10]["Delay Minutes"]).toBe(1050);
  });

  it("keeps small sheets and skips the empty sheet", async () => {
    const xlsx = await loadFixture("kpi_q2_2026.xlsx");
    expect(xlsx.tables.map((t) => t.name)).toEqual(["KPI_Data", "Cover"]);
  });

  it("explains a damaged workbook", async () => {
    await expect(loadBuffer("broken.xlsx", csvBytes("this is not a zip file"))).rejects.toThrow(/XLSX/);
  });

  it("caps a table at 200000 rows with a warning", async () => {
    const lines = ["id_x,v"];
    for (let i = 0; i < MAX_ROWS + 5; i++) lines.push(`k${i % 7},${i}`);
    const ds = await loadBuffer("big.csv", csvBytes(lines.join("\n")));
    const t = ds.tables[0];
    expect(t.rows).toHaveLength(MAX_ROWS);
    expect(t.source_rows).toBe(MAX_ROWS + 5);
    expect(t.warning).toMatch(/first 200000 rows/);
  }, 30_000);
});

describe("rejections", () => {
  it("says PDF and DOCX need the analytics service", async () => {
    await expect(loadBuffer("report.pdf", csvBytes("%PDF-1.4"))).rejects.toThrow(/analytics service/);
    await expect(loadBuffer("memo.docx", csvBytes("PK"))).rejects.toThrow(/analytics service/);
    await expect(loadBuffer("memo.DOCX", csvBytes("PK"))).rejects.toThrow(/PDF and DOCX/);
  });

  it("rejects an empty file", async () => {
    await expect(loadBuffer("e.csv", new Uint8Array(0))).rejects.toThrow(/empty/);
    await expect(loadBuffer("e.csv", csvBytes("  \n \n"))).rejects.toThrow(/empty/);
    await expect(loadBuffer("e.xlsx", new Uint8Array(0))).rejects.toThrow(/empty/);
  });

  it("rejects a file over 20 MB", async () => {
    await expect(loadBuffer("big.csv", new Uint8Array(MAX_BYTES + 1))).rejects.toThrow(/20 MB/);
  });

  it("rejects a file with no table in it", async () => {
    await expect(loadBuffer("h.csv", csvBytes("only,a,header\n"))).rejects.toThrow(/No table/);
    await expect(loadBuffer("h.csv", csvBytes(",,\n,,\n"))).rejects.toThrow(/No table/);
  });

  it("rejects legacy xls and unknown types", async () => {
    await expect(loadBuffer("old.xls", csvBytes("x"))).rejects.toThrow(/\.xls/);
    await expect(loadBuffer("a.exe", csvBytes("x"))).rejects.toThrow(/Unsupported/);
    await expect(loadBuffer("noext", csvBytes("x"))).rejects.toThrow(/Unsupported/);
  });
});
