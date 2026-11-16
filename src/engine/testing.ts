/// <reference types="node" />
/** Test helpers: read the fixtures and load them. Not part of the public API. */
import { readFileSync } from "node:fs";
import { loadBuffer } from "./parse";
import type { LocalDataset } from "./table";

export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
}

export function loadFixture(name: "kpi_q2_2026.csv" | "kpi_q2_2026.xlsx"): Promise<LocalDataset> {
  return loadBuffer(name, fixtureBytes(name));
}

export function csvBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export const SAMPLE_ROWS: [string, string, number, number, number][] = [
  ["2026-03-01", "Signalling", 14, 380, 97],
  ["2026-03-01", "Rolling Stock", 9, 140, 100],
  ["2026-03-01", "Power Supply", 3, 45, 100],
  ["2026-04-01", "Signalling", 11, 290, 99],
  ["2026-04-01", "Rolling Stock", 7, 110, 100],
  ["2026-04-01", "Power Supply", 4, 60, 98],
  ["2026-05-01", "Signalling", 12, 340, 98],
  ["2026-05-01", "Rolling Stock", 8, 120, 100],
  ["2026-05-01", "Power Supply", 2, 30, 100],
  ["2026-06-01", "Signalling", 15, 410, 97],
  ["2026-06-01", "Rolling Stock", 6, 1050, 100],
  ["2026-06-01", "Power Supply", 5, 75, 99],
  ["2026-07-01", "Signalling", 9, 200, 100],
  ["2026-07-01", "Rolling Stock", 11, 260, 99],
  ["2026-07-01", "Power Supply", 3, 40, 100],
];
