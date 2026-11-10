// Author: Ahmed Zaian. Conservative source-local field checks, not semantic proof.
const safe = value => typeof value === 'string' && value.trim() && value.length <= 500 && !/[|\r\n]/.test(value);
const digits = value => value.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660));
function bounded(source, value) {
  let offset = source.indexOf(value);
  while (offset >= 0) {
    const before = source[offset - 1] ?? '', after = source[offset + value.length] ?? '';
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true;
    offset = source.indexOf(value, offset + 1);
  }
  return false;
}
export function groundProposal(source, proposal) {
  if (!proposal || !['action', 'decision'].includes(proposal.kind) || !safe(proposal.text) || !source.includes(proposal.text)) throw new Error('Invalid local model proposal.');
  // Never let a model choose a larger evidence window to borrow another task's fields.
  const spans = [...source.matchAll(/[^.!?؟;؛\r\n]+/gu)].map(m => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
  const matches = [];
  for (let start = source.indexOf(proposal.text); start >= 0; start = source.indexOf(proposal.text, start + 1)) matches.push(start);
  const span = matches.length === 1 ? spans.find(s => matches[0] >= s.start && matches[0] + proposal.text.length <= s.end) : null;
  const warnings = [];
  const local = span?.text ?? '';
  // Inspect every occurrence even when duplicate wording makes fields ambiguous.
  // A cross-sentence excerpt cannot establish a single task scope.
  for (const start of matches) {
    const context = spans.find(s => start >= s.start && start + proposal.text.length <= s.end);
    if (!context) throw new Error('Invalid local model proposal. Use a task excerpt within one sentence.');
    const prefixAndTask = context.text.slice(0, start - context.start + proposal.text.length);
    const negated = /\b(?:do not|don't|never)\s+(?!forget\b)/i.test(prefixAndTask) || /(?:^|[\s،,:])(?:لا|لم|لن)\s+(?!تنس)/u.test(prefixAndTask);
    const cancelled = /\b(?:cancelled|canceled|withdrawn)\b/i.test(context.text) || /(?:التكليف\s+(?:ملغي|اتلغى)|ليس\s+تكليف)/u.test(context.text);
    if (negated || cancelled) throw new Error('The proposed task is negated or cancelled in its source. Review the original.');
    const following = spans[spans.indexOf(context) + 1]?.text ?? '';
    const unadopted = /(?:لسه\s+ما\s+اتفقناش|للحين\s+ما\s+اعتمدنا|مجرد\s+(?:مقترح|اقتراح)|ليس\s+تكليف|ما\s+اتخذنا\s+قرار|ما\s+عندنا\s+تكليف\s+معتمد|لا\s+يوجد\s+تكليف\s+معتمد)/u;
    const englishPending = /\b(?:only a suggestion|has not been agreed|not yet agreed|no agreement|no approved commitment)\b/i;
    const pendingTail = /^(?:لسه\s+ما\s+اتفقناش|للحين\s+ما\s+اعتمدنا\s+(?:شي|شيء)|ما\s+اتخذنا\s+قرار|(?:ده|هذا)\s+(?:مش|ليس)\s+تكليف|(?:This|It)\s+(?:is\s+only\s+a\s+suggestion(?:,\s*with\s+no\s+agreement)?|has\s+not\s+been\s+agreed)|There\s+is\s+no\s+approved\s+commitment)$/iu.test(following.trim());
    if (unadopted.test(context.text) || englishPending.test(context.text) || pendingTail) throw new Error('The proposed task is explicitly unadopted in its source. Review the original.');
  }
  const next = span ? spans[spans.indexOf(span) + 1]?.text.trim() ?? '' : '';
  const labelledOwner = /^(?:The\s+owner\s+is|المسؤول(?:ة)?)\s+(.+)$/iu.exec(next)?.[1].trim();
  const ownerLabel = safe(proposal.owner) && labelledOwner === proposal.owner ? next : '';
  const owner = safe(proposal.owner) && bounded(local + (ownerLabel ? ' ' + ownerLabel : ''), proposal.owner) ? proposal.owner : null;
  const normal = digits(local);
  const due = typeof proposal.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proposal.due) && bounded(normal, proposal.due) && !Number.isNaN(Date.parse(proposal.due)) && new Date(proposal.due).toISOString().slice(0, 10) === proposal.due ? proposal.due : null;
  if (proposal.owner != null && owner === null) warnings.push('owner-unverified');
  if (proposal.due != null && due === null) warnings.push('date-unverified');
  if (!span) warnings.push('source-ambiguous');
  return { ...proposal, owner, due, warnings };
}
