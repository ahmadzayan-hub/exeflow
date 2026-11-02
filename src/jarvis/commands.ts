import type { Lang } from "../i18n";
import { bi } from "../i18n";
import { attentionBuckets, overdueMilestones, parseDate } from "../metrics";
import type { AttentionItem, Confidence, Project } from "../types";

export type Command =
  | { kind: "overdue" | "waiting" | "help" | "unknown" }
  | { kind: "project"; query: string };

const normalise = (text: string) => text.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

/** Deliberately small command vocabulary: no model, tools, or write operations. */
export function parseCommand(text: string): Command {
  const value = normalise(text).replace(/^\//, "");
  if (["overdue", "show overdue", "متأخر", "متأخرات", "المتأخرات"].includes(value)) return { kind: "overdue" };
  if (["waiting", "show waiting", "انتظار", "المنتظرات", "بانتظار الآخرين"].includes(value)) return { kind: "waiting" };
  if (["help", "مساعدة"].includes(value)) return { kind: "help" };
  const match = /^(?:project|مشروع)(?:\s+(.*))?$/.exec(value);
  return match ? { kind: "project", query: match[1] ?? "" } : { kind: "unknown" };
}

export interface CommandRow {
  key: string;
  project: Project;
  title: string;
  owner: string | null;
  due: string | null;
  reference: string | null;
  confidence: Confidence;
  derived: boolean;
}

// Optional imported metadata is not deeply validated by the existing importer.
export const recordedText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

export function commandRows(kind: "overdue" | "waiting", projects: Project[], today: Date, lang: Lang): CommandRow[] {
  const rows: CommandRow[] = [];
  for (const project of projects) {
    const buckets = attentionBuckets(project, today);
    const items = kind === "overdue" ? buckets.overdueItems : buckets.waiting;
    for (const item of items) rows.push(attentionRow(project, item, lang));
    if (kind === "overdue") {
      for (const milestone of overdueMilestones(project, today)) {
        rows.push({
          key: JSON.stringify([project.id, "milestone", milestone.id]), project,
          title: bi(milestone.title, lang), owner: null, due: milestone.planned,
          reference: null, confidence: project.confidence, derived: true,
        });
      }
    }
  }
  return rows.sort((a, b) => (parseDate(a.due)?.getTime() ?? Infinity) - (parseDate(b.due)?.getTime() ?? Infinity));
}

function attentionRow(project: Project, item: AttentionItem, lang: Lang): CommandRow {
  return {
    key: JSON.stringify([project.id, "attention", item.id]), project,
    title: bi(item.title, lang), owner: recordedText(item.owner), due: item.due ?? null,
    reference: recordedText(item.reference),
    confidence: typeof item.confidence === "string" ? item.confidence : project.confidence, derived: false,
  };
}

export function resolveProject(query: string, selectedId: string, projects: Project[]): Project[] {
  if (!query) return projects.filter((p) => p.id === selectedId);
  const target = normalise(query);
  return projects.filter((p) => [p.id, p.code, p.name.en, p.name.ar].some((v) => typeof v === "string" && normalise(v) === target));
}
