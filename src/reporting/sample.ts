/** A fictional monthly maintenance extract so the Reporting screen opens with something real to look at. */

const MONTHS = ["2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"];

const FAILURES: Record<string, number[]> = {
  Signalling: [14, 11, 12, 15, 13, 22, 17, 15],
  "Rolling Stock": [9, 7, 8, 6, 11, 10, 9, 12],
  "Power Supply": [3, 4, 2, 5, 3, 3, 4, 2],
  Track: [6, 5, 7, 6, 8, 6, 5, 7],
  "Platform Doors": [12, 11, 10, 9, 8, 7, 6, 5],
};

const pm = [97, 98, 99, 98, 100, 96, 97, 99];

export function sampleCsv(): string {
  const rows: string[] = ["Month,System,Failures,Delay Minutes,PM Completion,Cost AED"];
  Object.entries(FAILURES).forEach(([system, values], s) => {
    values.forEach((failures, m) => {
      const delay = failures * 26 + ((m * 7 + s * 13) % 40);
      const cost = failures * 18_500 + ((m * 11 + s * 17) % 9) * 1_250;
      rows.push(`${MONTHS[m]},${system},${failures},${delay},${pm[(m + s) % pm.length]}%,"${cost.toLocaleString("en-US")}"`);
    });
  });
  return rows.join("\n");
}

export const SAMPLE_NAME = "sample-maintenance-kpis.csv";
