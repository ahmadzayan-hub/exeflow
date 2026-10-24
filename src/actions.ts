import { INBOX_ID, DAY_MS, parseDate } from "./metrics";
import type { AttentionItem, Portfolio, Project, Stage } from "./types";

/** Every edit returns a new portfolio and marks it as a working copy of its base dataset. */
function touch(p: Portfolio): Portfolio {
  if (p.dataset === "working") return p;
  const base = p.dataset === "seed" || p.dataset === "showcase" || p.dataset === "imported" ? p.dataset : p.base;
  return { ...p, dataset: "working", base };
}

const addDays = (iso: string, days: number) => new Date((parseDate(iso)?.getTime() ?? 0) + days * DAY_MS).toISOString().slice(0, 10);

function mapItem(p: Portfolio, projectId: string, itemId: string, fn: (a: AttentionItem) => AttentionItem | null): Portfolio {
  const apply = (items: AttentionItem[]) => items.flatMap((a) => (a.id === itemId ? (fn(a) ? [fn(a) as AttentionItem] : []) : [a]));
  if (projectId === INBOX_ID) return touch({ ...p, inbox: apply(p.inbox ?? []) });
  return touch({ ...p, projects: p.projects.map((pr) => (pr.id === projectId ? { ...pr, attention: apply(pr.attention) } : pr)) });
}

export function closeItem(p: Portfolio, projectId: string, itemId: string, onISO: string): Portfolio {
  return mapItem(p, projectId, itemId, (a) => ({ ...a, status: "closed", closedOn: onISO }));
}

export function reopenItem(p: Portfolio, projectId: string, itemId: string): Portfolio {
  return mapItem(p, projectId, itemId, (a) => ({ ...a, status: "open", closedOn: null }));
}

/** Push the due date out. A missing or already-passed due date restarts from today. */
export function snoozeItem(p: Portfolio, projectId: string, itemId: string, days: number, todayISO: string): Portfolio {
  return mapItem(p, projectId, itemId, (a) => {
    const due = a.due && a.due >= todayISO ? a.due : todayISO;
    return { ...a, due: addDays(due, days) };
  });
}

export function setDue(p: Portfolio, projectId: string, itemId: string, due: string | null): Portfolio {
  return mapItem(p, projectId, itemId, (a) => ({ ...a, due }));
}

export function removeItem(p: Portfolio, projectId: string, itemId: string): Portfolio {
  return mapItem(p, projectId, itemId, () => null);
}

export function addItem(p: Portfolio, projectId: string | null, item: AttentionItem): Portfolio {
  if (!projectId || projectId === INBOX_ID) return touch({ ...p, inbox: [item, ...(p.inbox ?? [])] });
  return touch({ ...p, projects: p.projects.map((pr) => (pr.id === projectId ? { ...pr, attention: [item, ...pr.attention] } : pr)) });
}

const clamp = (n: number | null) => (n == null || Number.isNaN(n) ? null : Math.max(0, Math.min(100, Math.round(n * 10) / 10)));

export function setProgress(p: Portfolio, projectId: string, planned: number | null, actual: number | null, asOfISO: string): Portfolio {
  return touch({
    ...p,
    projects: p.projects.map((pr) => (pr.id === projectId ? { ...pr, progress: { planned: clamp(planned), actual: clamp(actual), asOf: asOfISO } } : pr)),
  });
}

export function setMilestoneDone(p: Portfolio, projectId: string, milestoneId: string, done: boolean, dateISO: string): Portfolio {
  return touch({
    ...p,
    projects: p.projects.map((pr) =>
      pr.id !== projectId
        ? pr
        : { ...pr, milestones: pr.milestones.map((m) => (m.id === milestoneId ? { ...m, status: done ? "done" : "open", actual: done ? dateISO : null } : m)) },
    ),
  });
}

export function setStage(p: Portfolio, projectId: string, stage: Stage): Portfolio {
  return touch({ ...p, projects: p.projects.map((pr) => (pr.id === projectId ? { ...pr, stage } : pr)) });
}

export function updateProject(p: Portfolio, projectId: string, patch: Partial<Project>): Portfolio {
  return touch({ ...p, projects: p.projects.map((pr) => (pr.id === projectId ? { ...pr, ...patch } : pr)) });
}
