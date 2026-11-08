import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GraphConnection } from './GraphConnection.mjs';
const id = '11111111-2222-3333-4444-555555555555';
const response = (data, status = 200) => new Response(data == null ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
test('device sign-in requests least-privilege read scopes, enforces polling interval, and keeps tokens private', async () => {
  let now = 0; const calls = [];
  const g = new GraphConnection({ now: () => now, fetcher: async (url, init) => { calls.push({ url, init }); if (url.endsWith('devicecode')) return response({ device_code: 'secret-device', user_code: 'TEST', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 5 }); return response({ error: 'authorization_pending' }, 400); } });
  assert.equal((await g.start({ clientId: id, tenant: 'organizations' })).userCode, 'TEST');
  assert.ok(!String(calls[0].init.body).includes('Mail.Send')); await g.poll(); await g.poll(); assert.equal(calls.length, 2);
  now = 6000; await g.poll(); assert.equal(calls.length, 3); assert.ok(!JSON.stringify(g.status()).includes('secret-device'));
  g.disconnect(); assert.equal((await g.poll()).state, 'expired');
});
test('rejects invalid registration and non-Microsoft verification links', async () => {
  const g = new GraphConnection({ fetcher: async () => response({ device_code: 'x', user_code: 'y', verification_uri: 'https://attacker.invalid' }) });
  await assert.rejects(g.start({ clientId: 'invalid', tenant: 'common' }));
  await assert.rejects(g.start({ clientId: id, tenant: 'common' }), /verification/);
});
test('authenticated mail submission is accepted, never labelled delivered, and redirects are forbidden', async () => {
  const calls = []; const g = new GraphConnection({ now: () => 0, fetcher: async (url, init) => { calls.push({ url, init }); return response(null, 202); } });
  g.accept({ access_token: 'synthetic-secret', expires_in: 3600, scope: 'Mail.Send Calendars.ReadWrite' });
  assert.deepEqual(await g.send({ id: 'synthetic', stage: 'escalation', text: 'Synthetic', owner: null, due: '2026-11-01', source: 'Test' }, ['recipient@example.test']), { accepted: true });
  assert.equal(calls[0].url, 'https://graph.microsoft.com/v1.0/me/sendMail'); assert.equal(calls[0].init.redirect, 'error');
  const body = JSON.parse(calls[0].init.body); assert.equal(body.message.toRecipients[0].emailAddress.address, 'recipient@example.test');
  await assert.rejects(g.request('https://attacker.invalid')); g.disconnect(); assert.equal(g.status().delivery, false);
});
test('creates a reviewed all-day due-date event in Dubai with next-day exclusive end', async () => {
  let body; const g = new GraphConnection({ now: () => 0, fetcher: async (url, init) => { body = JSON.parse(init.body); return response({ id: 'event' }); } });
  g.accept({ access_token: 'test', expires_in: 3600, scope: 'Calendars.ReadWrite' });
  await g.calendar({ id: 'record', text: 'Synthetic', due: '2026-12-31', source: { name: 'test', quote: 'Action: Synthetic' } });
  assert.equal(body.end.dateTime, '2027-01-01T00:00:00'); assert.equal(body.start.timeZone, 'Arabian Standard Time'); assert.equal(body.transactionId, 'ExecFlow-record-2026-12-31');
});
test('source IDs are encoded and full message bodies are requested as plain text', async () => {
  let target, headers; const g = new GraphConnection({ now: () => 0, fetcher: async (url, init) => { target = url; headers = init.headers; return response({ subject: 'Synthetic', body: { content: 'Action: Verify' }, webLink: 'https://outlook.office.com/test' }); } });
  g.accept({ access_token: 'test', expires_in: 3600, scope: 'Mail.Read' }); const s = await g.source('email', 'id/with?special');
  assert.ok(target.includes('id%2Fwith%3Fspecial')); assert.equal(headers.Prefer, 'outlook.body-content-type="text"'); assert.ok(s.text.includes('Action: Verify'));
});
test('disconnect during token refresh cannot resurrect a previous account', async () => {
  let complete; const wait = new Promise(resolve => { complete = resolve; });
  const g = new GraphConnection({ now: () => 100000, fetcher: async () => wait }); g.config = { clientId: id, tenant: 'organizations' }; g.token = { value: 'old', refresh: 'old-refresh', scopes: ['Mail.Read'], expiresAt: 0 };
  const pending = g.request('/me/messages'); g.disconnect(); complete(response({ access_token: 'stale', expires_in: 3600, scope: 'Mail.Read' }));
  await assert.rejects(pending, /session changed/); assert.equal(g.status().connected, false);
});
test('successful sign-in verifies and displays the account without exposing tokens', async () => {
  const g = new GraphConnection({ now: () => 0, fetcher: async url => {
    if (url.endsWith('devicecode')) return response({ device_code: 'secret-device', user_code: 'TEST', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900 });
    if (url.endsWith('/token')) return response({ access_token: 'synthetic-secret', refresh_token: 'synthetic-refresh', expires_in: 3600, scope: 'User.Read Mail.Read Calendars.Read' });
    return response({ id: 'synthetic-user', displayName: 'Synthetic Operator', mail: 'operator@example.test' });
  } });
  await g.start({ clientId: id, tenant: 'organizations' }); assert.equal((await g.poll()).state, 'connected');
  assert.equal(g.status().account.email, 'operator@example.test'); assert.ok(!JSON.stringify(g.status()).includes('synthetic-secret')); assert.equal(g.status().delivery, false);
});
