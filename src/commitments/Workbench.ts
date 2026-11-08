import type { Commitment, Register } from './register';
import { validDate } from './register';
export type RegisterView = 'all' | 'decision' | 'waiting' | 'overdue' | 'closed' | 'missing';
export function registerSummary(register: Register, today: string) {
  if (!validDate(today)) throw new Error('invalid-date');
  const eligible = register.records.filter(r => r.capturedOn <= today);
  const open = eligible.filter(r => r.status !== 'closed');
  const closed = eligible.filter(r => r.status === 'closed' && r.closedOn && r.closedOn <= today);
  const weekStart = new Date(`${today}T00:00:00Z`); weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const from = weekStart.toISOString().slice(0, 10);
  const duration = closed.reduce((sum, r) => sum + (Date.parse(`${r.closedOn}T00:00:00Z`) - Date.parse(`${r.capturedOn}T00:00:00Z`)) / 86400000, 0);
  return {
    decision: open.filter(r => r.kind === 'decision').length,
    waiting: open.filter(r => r.status === 'waiting').length,
    overdue: open.filter(r => r.due && r.due < today).length,
    closedThisWeek: closed.filter(r => r.closedOn! >= from).length,
    closureRate: eligible.length ? Math.round(closed.length / eligible.length * 100) : null,
    meanClosedDays: closed.length ? Math.round(duration / closed.length * 10) / 10 : null,
  };
}
export function filterCommitments(records: Commitment[], view: RegisterView, search: string, today: string) {
  const term = search.trim().toLocaleLowerCase();
  return records.filter(r => {
    const open = r.status !== 'closed';
    const matches = view === 'all' || (view === 'decision' && open && r.kind === 'decision') ||
      (view === 'waiting' && r.status === 'waiting') || (view === 'overdue' && open && !!r.due && r.due < today) ||
      (view === 'closed' && r.status === 'closed') || (view === 'missing' && open && (!r.owner || !r.due));
    return matches && (!term || [r.text, r.owner, r.dependency, r.source.name, r.source.quote].some(v => v?.toLocaleLowerCase().includes(term)));
  });
}
