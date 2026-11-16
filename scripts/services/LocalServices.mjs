import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { GraphConnection } from './GraphConnection.mjs';
import { VoiceBridge } from './VoiceBridge.mjs';
import { LocalAutomation } from './LocalAutomation.mjs';
export async function createLocalServices({ validator, graph = new GraphConnection(), voice = new VoiceBridge(), directory = process.env.EXECFLOW_DATA_DIR ?? join(process.env.LOCALAPPDATA ?? homedir(), 'ExecFlowData'), intervalMs = 30000 } = {}) {
  const automation = await new LocalAutomation({ directory, validator, graph }).init();
  if (automation.state.runtime) await voice.configure(automation.state.runtime);
  const token = randomBytes(32).toString('hex'); let stopped = false;
  let runningScan = null;
  const scan = () => { if (!runningScan) runningScan = automation.scan().finally(() => { runningScan = null; }); return runningScan; };
  const timer = intervalMs > 0 ? setInterval(() => { if (!stopped) void scan(); }, intervalMs) : null; timer?.unref();
  const readBody = async (req, max, json = true) => { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > max) throw new Error('Request is too large.'); chunks.push(chunk); } const raw = Buffer.concat(chunks); return json ? JSON.parse(raw.toString('utf8') || '{}') : raw; };
  return { automation, graph, voice, pairingCode: token, async close() { stopped = true; if (timer) clearInterval(timer); graph.disconnect(); await runningScan; await automation.queue; }, async handle(req, res, origin) {
    const path = new URL(req.url, origin).pathname;
    if (!path.startsWith('/api/local/')) return false;
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    try {
      if (path === '/api/local/session' && req.method === 'GET') { if (req.headers['x-execflow-pairing'] !== token) { reply(403, { error: 'Enter the pairing code shown in the local launcher.' }); return true; } reply(200, { token, voice: await voice.status(), graph: graph.status() }); return true; }
      if (req.headers['x-execflow-session'] !== token || (req.method === 'GET' ? !!req.headers.origin && req.headers.origin !== origin : req.headers.origin !== origin)) { reply(403, { error: 'Local session and matching Origin are required.' }); return true; }
      let result;
      if (path === '/api/local/state' && req.method === 'GET') result = { ...automation.snapshot(), graph: graph.status(), voice: await voice.status() };
      else if (path === '/api/local/register' && req.method === 'PUT') { const d = await readBody(req, 4_000_000); result = await automation.sync(d.register, d.expectedRevision); }
      else if (path === '/api/local/policy' && req.method === 'PUT') { const d = await readBody(req, 16000); result = await automation.configure(d.policy, d.approved); }
      else if (path === '/api/local/graph/start' && req.method === 'POST') result = await graph.start(await readBody(req, 4000));
      else if (path === '/api/local/graph/poll' && req.method === 'POST') result = await graph.poll();
      else if (path === '/api/local/graph/disconnect' && req.method === 'POST') { graph.disconnect(); result = { disconnected: true }; }
      else if (path === '/api/local/sources' && req.method === 'POST') { const d = await readBody(req, 4000); if (!['email', 'calendar'].includes(d.kind)) throw new Error('Choose email or calendar.'); const start = new Date(), end = new Date(start.getTime() + 7 * 86400000); result = { sources: await graph.sources(d.kind, start.toISOString(), end.toISOString()) }; }
      else if (path === '/api/local/source' && req.method === 'POST') { const d = await readBody(req, 4000); result = await graph.source(d.kind, d.id); }
      else if (path === '/api/local/calendar' && req.method === 'POST') { const d = await readBody(req, 4000); if (d.confirmed !== true || !graph.status().account?.id || d.expectedAccountId !== graph.status().account.id) throw new Error('Explicit calendar confirmation is required.'); const record = automation.state.register.records.find(r => r.id === d.recordId); if (!record) throw new Error('Synchronise and choose an existing record first.'); result = await graph.calendar(record); }
      else if (path === '/api/local/voice/config' && req.method === 'PUT') { const d = await readBody(req, 8000); const runtime = await voice.configure(d); await automation.change(s => { s.runtime = runtime; }); result = await voice.status(); }
      else if (path === '/api/local/transcribe' && req.method === 'POST') result = await voice.transcribe(await readBody(req, 10_000_000, false), req.headers['x-execflow-language']);
      else if (path === '/api/local/interpret' && req.method === 'POST') { const d = await readBody(req, 12000); result = await voice.interpret(d.text, d.language); }
      else if (path === '/api/local/scan' && req.method === 'POST') { await scan(); result = automation.snapshot(); }
      else { reply(404, { error: 'Unsupported local route.' }); return true; }
      reply(200, result);
    } catch (e) { reply(400, { error: e.message || 'Local operation failed.' }); }
    return true;
  } };
}
