import { DAY_MS, parseDate, scheduleRag } from "./metrics";
import type { Project, Rag } from "./types";

export interface TimelineRow {
  id: string;
  project: Project;
  start: number;
  end: number;
  dlpEnd: number | null;
  rag: Rag;
  milestones: { id: string; at: number; done: boolean; late: boolean }[];
}

export interface TimelineModel {
  min: number;
  max: number;
  today: number;
  rows: TimelineRow[];
  undated: Project[];
}

/** Rows need a start and an end. Projects with fewer dates are listed separately so nothing is hidden. */
export function buildTimeline(projects: Project[], today: Date): TimelineModel {
  const rows: TimelineRow[] = [];
  const undated: Project[] = [];
  for (const p of projects) {
    const s = parseDate(p.ntp)?.getTime();
    const e = parseDate(p.completion)?.getTime();
    if (s == null || e == null || e <= s) {
      undated.push(p);
      continue;
    }
    rows.push({
      id: p.id,
      project: p,
      start: s,
      end: e,
      dlpEnd: parseDate(p.dlpEnd)?.getTime() ?? null,
      rag: scheduleRag(p, today),
      milestones: p.milestones.flatMap((m) => {
        const at = parseDate(m.actual ?? m.planned)?.getTime();
        return at == null ? [] : [{ id: m.id, at, done: m.status === "done", late: m.status !== "done" && at < today.getTime() }];
      }),
    });
  }
  rows.sort((a, b) => a.start - b.start);
  const all = rows.flatMap((r) => [r.start, r.end, ...(r.dlpEnd ? [r.dlpEnd] : [])]).concat(today.getTime());
  const pad = 45 * DAY_MS;
  return { min: Math.min(...all) - pad, max: Math.max(...all) + pad, today: today.getTime(), rows, undated };
}
