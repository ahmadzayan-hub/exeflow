import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalAutomation, dayInDubai } from './LocalAutomation.mjs';
import { isRegister, acceptCandidates, extractMinutes, emptyRegister, changeStatus } from '../../dist/CommitmentRuntime.mjs';
const register = () => acceptCandidates(emptyRegister(), extractMinutes('Action: Synthetic follow-up | Owner: Ali | Due: 2026-11-01', 'Synthetic source', '2026-11-01').candidates, '2026-11-01');
const policy = (email = false) => ({ enabled: true, email, recipients: email ? ['owner@example.test'] : [], remindAfterDays: 1, escalateAfterDays: 3 });
async function setup(t, delivery = false) { const directory = await mkdtemp(join(tmpdir(), 'ExecFlowAutomation')); t.after(() => rm(directory, { recursive: true, force: true })); const sent = []; const graph = { status: () => ({ delivery, account: delivery ? { id: 'synthetic-account' } : null }), send: async (event, recipients) => { sent.push({ event, recipients }); return { accepted: true }; } }; const service = await new LocalAutomation({ directory, validator: isRegister, graph, now: () => new Date('2026-11-02T10:00:00Z') }).init(); return { directory, sent, graph, service }; }
test('Dubai day boundaries and due-today are not overdue', async t => {
  assert.equal(dayInDubai(new Date('2026-11-01T20:05:00Z')), '2026-11-02'); const { service } = await setup(t);
  await service.sync(register(), 0); await service.configure(policy(), true); service.now = () => new Date('2026-11-01T10:00:00Z'); await service.scan(); assert.equal(service.state.events.length, 0);
});
test('atomic register snapshots survive restart, and stale revisions or invalid inputs preserve data', async t => {
  const { service, directory, graph } = await setup(t); const r = register(); await service.sync(r, 0);
  await assert.rejects(service.sync({ schemaVersion: 1, records: [] }, 0), /another session/); await assert.rejects(service.sync({}, 1));
  const restored = await new LocalAutomation({ directory, validator: isRegister, graph }).init(); assert.deepEqual(restored.state.register, r);
  assert.ok((await readFile(join(directory, 'State.previous.json'), 'utf8')).includes('schemaVersion'));
});
test('daily reminders and one-time escalation are deduplicated across restarts; closed records stop', async t => {
  const { service, directory, graph } = await setup(t); const r = register(); await service.sync(r, 0); await service.configure(policy(), true);
  await service.scan(); await service.scan(); assert.equal(service.state.events.length, 1); assert.equal(service.state.events[0].status, 'local');
  const restarted = await new LocalAutomation({ directory, validator: isRegister, graph, now: () => new Date('2026-11-04T10:00:00Z') }).init(); await restarted.scan(); await restarted.scan(); assert.equal(restarted.state.events.length, 2); assert.equal(restarted.state.events[1].stage, 'escalation');
  await restarted.sync(changeStatus(r, r.records[0].id, 'closed', '2026-11-04'), 1); restarted.now = () => new Date('2026-11-05T10:00:00Z'); await restarted.scan(); assert.equal(restarted.state.events.length, 2);
});
test('automatic mail needs explicit policy approval and exact recipients; accepted is not delivered', async t => {
  const { service, sent } = await setup(t, true); await service.sync(register(), 0);
  await assert.rejects(service.configure(policy(true), false), /Confirm/); await service.configure(policy(true), true); await service.scan(); await service.scan();
  assert.equal(sent.length, 1); assert.deepEqual(sent[0].recipients, ['owner@example.test']); assert.equal(service.state.events[0].status, 'accepted');
  await assert.rejects(service.configure({ ...policy(true), recipients: ['bad\r\n@example.test'] }, true));
});
test('uncertain submission is never automatically resent, including restart', async t => {
  const { service, directory, graph } = await setup(t, true); let attempts = 0; graph.send = async () => { attempts++; throw new Error('Synthetic transport failure after request'); };
  await service.sync(register(), 0); await service.configure(policy(true), true); await service.scan(); await service.scan(); assert.equal(attempts, 1); assert.equal(service.state.events[0].status, 'uncertain');
  const restarted = await new LocalAutomation({ directory, validator: isRegister, graph, now: service.now }).init(); await restarted.scan(); assert.equal(attempts, 1);
});
test('corrupt state fails closed without replacing the original file', async t => {
  const { directory, graph } = await setup(t); await writeFile(join(directory, 'State.json'), 'corrupt original');
  await assert.rejects(new LocalAutomation({ directory, validator: isRegister, graph }).init(), /preserved/); assert.equal(await readFile(join(directory, 'State.json'), 'utf8'), 'corrupt original');
});
test('changing Microsoft accounts blocks automatic sending until sender policy is reapproved', async t => {
  const { service, graph, sent } = await setup(t, true); await service.sync(register(), 0); await service.configure(policy(true), true);
  graph.status = () => ({ delivery: true, account: { id: 'different-account' } }); await service.scan(); assert.equal(sent.length, 0); assert.match(service.error, /differs/);
  await service.configure(policy(true), true); await service.scan(); assert.equal(sent.length, 1);
});

test('raising the escalation threshold holds a queued escalation until the approved day', async t => {
  const { service, graph, sent } = await setup(t, true); await service.sync(register(), 0); await service.configure(policy(true), true);
  service.now = () => new Date('2026-11-04T10:00:00Z'); graph.status = () => ({ delivery: false }); await service.scan();
  assert.equal(service.state.events[0].stage, 'escalation'); assert.equal(service.state.events[0].status, 'pending');
  graph.status = () => ({ delivery: true, account: { id: 'synthetic-account' } }); await service.configure({ ...policy(true), escalateAfterDays: 10 }, true); await service.scan();
  assert.equal(sent.filter(s => s.event.stage === 'escalation').length, 0); assert.equal(service.state.events[0].status, 'pending');
  service.now = () => new Date('2026-11-11T10:00:00Z'); await service.scan(); await service.scan(); assert.equal(sent.filter(s => s.event.stage === 'escalation').length, 1);
});
