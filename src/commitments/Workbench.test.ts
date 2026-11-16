import { expect, it } from 'vitest';
import { acceptCandidates, changeStatus, emptyRegister, extractMinutes } from './register';
import { filterCommitments, registerSummary } from './Workbench';
function sample() {
  let r = acceptCandidates(emptyRegister(), extractMinutes('Decision: Choose option | Owner: Ali | Due: 2026-11-08\nAction: Await reply | Owner: Sara | Due: 2026-11-09\nإجراء: مراجعة العرض', 'Synthetic meeting', '2026-11-01').candidates, '2026-11-01');
  r = changeStatus(r, r.records[1].id, 'waiting', '2026-11-02'); return r;
}
it('separates due today from overdue and leaves missing values unknown', () => {
  const r = sample(), s = registerSummary(r, '2026-11-09');
  expect(s).toEqual({ decision: 1, waiting: 1, overdue: 1, closedThisWeek: 0, closureRate: 0, meanClosedDays: null });
  expect(filterCommitments(r.records, 'missing', '', '2026-11-09')).toHaveLength(1);
});
it('counts the inclusive seven-day window and actual closed lead time', () => {
  let r = sample(); r = changeStatus(r, r.records[0].id, 'closed', '2026-11-03');
  const s = registerSummary(r, '2026-11-09');
  expect(s.closedThisWeek).toBe(1); expect(s.meanClosedDays).toBe(2); expect(s.closureRate).toBe(33);
  r = changeStatus(r, r.records[0].id, 'open', '2026-11-09');
  expect(registerSummary(r, '2026-11-09').meanClosedDays).toBeNull();
});
it('searches owner, Arabic text and source without mutating records', () => {
  const r = sample(), before = JSON.stringify(r);
  expect(filterCommitments(r.records, 'all', ' ALI ', '2026-11-09')).toHaveLength(1);
  expect(filterCommitments(r.records, 'all', 'مراجعة', '2026-11-09')).toHaveLength(1);
  expect(filterCommitments(r.records, 'waiting', 'Synthetic meeting', '2026-11-09')).toHaveLength(1);
  expect(filterCommitments(r.records, 'closed', '', '2026-11-09')).toHaveLength(0);
  expect(JSON.stringify(r)).toBe(before);
});
it('does not fabricate a rate or duration for an empty register', () => {
  expect(registerSummary(emptyRegister(), '2026-11-09').closureRate).toBeNull();
  expect(() => registerSummary(emptyRegister(), 'invalid')).toThrow();
});
