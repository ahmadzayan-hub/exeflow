export type Asset = "metro" | "tram" | "both";
export type Kind = "project" | "contract";
export type Category =
  | "signalling"
  | "telecom"
  | "power"
  | "consultancy"
  | "civil"
  | "energy"
  | "maintenance"
  | "asset-management";
export type Stage =
  | "planning"
  | "procurement"
  | "mobilisation"
  | "execution"
  | "commissioning"
  | "dlp"
  | "closing"
  | "closed";
export type Rag = "green" | "amber" | "red" | "grey";
/** verified: taken from an RMD record; tbc: field exists but value not confirmed; illustrative: demo value */
export type Confidence = "verified" | "tbc" | "illustrative";
export type MilestoneStatus = "done" | "open" | "at-risk";
export type AttentionType = "decision" | "waiting" | "overdue" | "info";
export type RiskRating = "high" | "medium" | "low";

export interface Bilingual {
  en: string;
  ar?: string;
}

export interface WorkPackage {
  code: string;
  title: Bilingual;
  valueAed?: number | null;
}

export interface Milestone {
  id: string;
  title: Bilingual;
  planned: string | null; // ISO date
  actual?: string | null; // ISO date
  status: MilestoneStatus;
  note?: string;
}

export interface Risk {
  id: string;
  title: Bilingual;
  rating: RiskRating;
  owner?: string;
  mitigation?: string;
}

export interface AttentionItem {
  id: string;
  type: AttentionType;
  title: Bilingual;
  owner?: string;
  due?: string | null; // ISO date
  reference?: string;
  status: "open" | "closed";
  closedOn?: string | null;
  note?: string;
  confidence?: Confidence;
}

export interface Progress {
  planned: number | null; // 0..100
  actual: number | null; // 0..100
  asOf?: string | null;
}

export interface Project {
  id: string;
  kind: Kind;
  code: string | null; // contract or OPMS reference
  name: Bilingual;
  asset: Asset;
  category: Category;
  stage: Stage;
  contractor?: string | null;
  consultant?: string | null;
  valueAed?: number | null;
  spentAed?: number | null;
  ntp?: string | null; // start / notice to proceed
  completion?: string | null; // planned completion or contract end
  dlpEnd?: string | null;
  progress: Progress;
  workPackages?: WorkPackage[];
  milestones: Milestone[];
  risks: Risk[];
  attention: AttentionItem[];
  sources: string[];
  confidence: Confidence;
  notes?: string;
}

export interface Portfolio {
  schemaVersion: 1;
  title: Bilingual;
  organisation: Bilingual;
  dataset: "seed" | "demo" | "imported";
  reportingPeriod: { label: Bilingual; asOf: string; start?: string | null; end?: string | null };
  disclaimer: Bilingual;
  projects: Project[];
}
