import { readFile, mkdir, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
export const dayInDubai = date => { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit', numberingSystem: 'latn', calendar: 'gregory' }).formatToParts(date).map(p => [p.type, p.value])); return `${parts.year}-${parts.month}-${parts.day}`; };
const email = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export function validPolicy(p) {
  return p && typeof p.enabled === 'boolean' && typeof p.email === 'boolean' && Number.isInteger(p.remindAfterDays) && p.remindAfterDays >= 1 && Number.isInteger(p.escalateAfterDays) && p.escalateAfterDays >= p.remindAfterDays && p.escalateAfterDays <= 365 && Array.isArray(p.recipients) && p.recipients.length <= 10 && p.recipients.every(x => typeof x === 'string' && x.length <= 254 && email.test(x)) && (!p.email || p.recipients.length > 0) && (!p.enabled || !p.email || typeof p.accountId === 'string' && p.accountId.length > 0 && p.accountId.length <= 200);
}
export class LocalAutomation {
  constructor({ directory, validator, graph, now = () => new Date() }) { Object.assign(this, { directory, validator, graph, now }); this.queue = Promise.resolve(); this.scanning = false; this.error = null; }
  async init() {
    this.state = { version: 1, registerRevision: 0, register: { schemaVersion: 1, records: [] }, policy: { enabled: false, email: false, recipients: [], remindAfterDays: 1, escalateAfterDays: 3 }, seen: {}, events: [] };
    try {
      const raw = await readFile(join(this.directory, 'State.json'), 'utf8'); if (raw.length > 20_000_000) throw new Error('large-state'); const s = JSON.parse(raw);
      if (s.version !== 1 || !Number.isSafeInteger(s.registerRevision) || s.registerRevision < 0 || !this.validator(s.register) || !validPolicy(s.policy) || !s.seen || Array.isArray(s.seen) || typeof s.seen !== 'object' || Object.keys(s.seen).length > 20000 || !Object.keys(s.seen).every(k => /^[a-f0-9]{64}$/.test(k)) || !Array.isArray(s.events) || s.events.length > 500 || !s.events.every(e => e && typeof e.id === 'string' && /^[a-f0-9]{64}$/.test(e.id) && ['reminder', 'escalation'].includes(e.stage) && ['pending', 'attempting', 'accepted', 'local', 'uncertain', 'cancelled'].includes(e.status))) throw new Error('invalid-state');
      this.state = s; for (const e of s.events) if (e.status === 'attempting') { e.status = 'uncertain'; e.note = 'Process restarted during submission; manual review required. No automatic resend.'; }
    } catch (e) { if (e.code !== 'ENOENT') throw new Error('Local service state is unreadable. Original State.json was preserved. Recover it before restarting.'); }
    return this;
  }
  change(fn) {
    const operation = this.queue.then(async () => {
      const next = structuredClone(this.state); const result = fn(next); await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const save = async (name, bytes) => { const temp = join(this.directory, `State${randomUUID().replaceAll('-', '')}.tmp`); try { const h = await open(temp, 'wx', 0o600); try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); } await rename(temp, join(this.directory, name)); } finally { await rm(temp, { force: true }); } };
      await save('State.previous.json', JSON.stringify(this.state)); await save('State.json', JSON.stringify(next)); this.state = next; return result;
    }); this.queue = operation.catch(() => {}); return operation;
  }
  snapshot() { return structuredClone({ registerRevision: this.state.registerRevision, register: this.state.register, policy: this.state.policy, events: this.state.events, error: this.error }); }
  async sync(register, expectedRevision) {
    if (!this.validator(register)) throw new Error('Invalid register; nothing was saved.');
    return this.change(s => { if (expectedRevision !== s.registerRevision) throw new Error('Register changed in another session. Reload the service copy before writing.'); s.register = register; s.registerRevision++; return { registerRevision: s.registerRevision }; });
  }
  async configure(policy, approved) {
    const selected = { ...policy, accountId: null };
    if (policy?.enabled && policy?.email) {
      const status = this.graph.status();
      if (approved !== true || !status.delivery || !status.account?.id) throw new Error('Confirm the policy and recipients after signing in with Mail.Send consent.');
      selected.accountId = status.account.id;
    }
    if (!validPolicy(selected)) throw new Error('Invalid automation policy or recipient addresses.');
    await this.change(s => { s.policy = selected; }); return { policy: selected };
  }
  async scan() {
    if (this.scanning) return; this.scanning = true;
    try {
      const today = dayInDubai(this.now()), p = this.state.policy;
      if (!p.enabled) return;
      const candidates = this.state.register.records.filter(r => r.status !== 'closed' && r.due && r.due < today).map(r => {
        const age = Math.floor((Date.parse(today) - Date.parse(r.due)) / 86400000);
        if (age < p.remindAfterDays) return null;
        const stage = age >= p.escalateAfterDays ? 'escalation' : 'reminder';
        const id = createHash('sha256').update(JSON.stringify([r.id, r.due, stage, stage === 'reminder' ? today : 'once'])).digest('hex');
        return { id, recordId: r.id, stage, date: today, due: r.due, text: r.text, owner: r.owner, source: r.source.name, status: p.email ? 'pending' : 'local' };
      }).filter(Boolean).filter(e => !this.state.seen[e.id]);
      if (candidates.length) await this.change(s => { if (Object.keys(s.seen).length + candidates.length > 20000) throw new Error('Automation deduplication capacity reached; export and review service state.'); if (!s.policy.enabled || JSON.stringify(s.policy) !== JSON.stringify(p)) return; for (const e of candidates) { const record = s.register.records.find(r => r.id === e.recordId); if (!record || record.status === "closed" || record.due !== e.due) continue; s.seen[e.id] = today; s.events.push(e); } s.events = s.events.slice(-500); });
      const connection = this.graph.status();
      if (!connection.delivery) return;
      if (connection.account?.id !== this.state.policy.accountId) { this.error = 'The signed-in account differs from the approved automation sender. Review and approve the policy again.'; return; }
      for (const queued of this.state.events.filter(e => e.status === 'pending')) {
        let send = false, recipients, payload;
        await this.change(s => {
          const e = s.events.find(x => x.id === queued.id), record = s.register.records.find(r => r.id === e.recordId), policy = s.policy;
          const age = record?.due ? Math.floor((Date.parse(today) - Date.parse(record.due)) / 86400000) : -1;
          if (!policy.enabled || !policy.email || policy.accountId !== this.graph.status().account?.id) return;
          if (!record || record.status === 'closed' || record.due !== e.due || age < policy.remindAfterDays || (e.stage === 'reminder' && (e.date !== today || age >= policy.escalateAfterDays))) { e.status = 'cancelled'; return; }
          e.text = record.text; e.owner = record.owner; e.source = record.source.name; e.status = 'attempting'; payload = structuredClone(e); recipients = [...policy.recipients]; send = true;
        });
        if (!send) continue;
        try { await this.graph.send(payload, recipients); await this.change(s => { s.events.find(e => e.id === queued.id).status = 'accepted'; }); }
        catch { await this.change(s => { const e = s.events.find(e => e.id === queued.id); e.status = 'uncertain'; e.note = 'Submission did not return a confirmed acceptance. Check Outlook before any manual resend.'; }); }
      }
      this.error = null;
    } catch (e) { this.error = e.message; } finally { this.scanning = false; }
  }
}
