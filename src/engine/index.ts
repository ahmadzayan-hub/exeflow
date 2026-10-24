/** Browser-local analytics engine: no backend, no model. */

export { loadFile, loadBuffer, parseCsv, MAX_BYTES, MAX_ROWS } from "./parse";
export { profileDataset, profileTable, candidateMetrics, dataQualityGaps } from "./profile";
export { analyse } from "./insights";
export type { AnalyseOptions } from "./insights";
export { buildReport } from "./report";
export { narrate, isNarrationAvailable, buildNarratePayload } from "./narrate";
export type { NarratePayload, NarrateOptions, NarrateResult } from "./narrate";
export { evidenceGate, numbersIn } from "./gate";
export type { GateResult, EvidenceItem } from "./gate";
export { aggregate, trend, distribution, compare, outliers, runTool } from "./tools";
export type { Filter, FilterOp, Agg, Freq } from "./tools";
export type { LocalTable, LocalDataset, LocalColumn, ColumnKind, CellValue, DatasetKind, Bilingual } from "./table";
export type { DatasetProfile, TableProfile, ColumnProfile, CandidateMetrics, DataGap } from "./profile";
