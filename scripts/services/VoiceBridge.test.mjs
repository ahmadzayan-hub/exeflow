import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, access } from 'node:fs/promises';
import { VoiceBridge, validateWave } from './VoiceBridge.mjs';
function wave() { const b = Buffer.alloc(16044); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(16000, 40); return b; }
test('rejects arbitrary/oversized/non-PCM audio', () => { assert.throws(() => validateWave(Buffer.from('fake'))); validateWave(wave()); for (const [offset, value] of [[4, 0], [16, 18], [24, 48000], [28, 0], [32, 0]]) { const b = wave(); b.writeUInt32LE(value, offset); assert.throws(() => validateWave(b)); } assert.throws(() => validateWave(Buffer.alloc(9_600_046))); });
test('local CLI transcription handles Arabic and English, deletes audio, and never invokes a shell', async () => {
  for (const language of ['ar', 'en']) {
    let temp;
    const voice = new VoiceBridge({ executable: process.execPath, model: process.execPath, runner: async (exe, args, options) => { assert.equal(exe, process.execPath); assert.equal(args[args.indexOf('-l') + 1], language); assert.equal(options.shell, undefined); temp = args[args.indexOf('-f') + 1]; await writeFile(args[args.indexOf('-of') + 1] + '.json', JSON.stringify({ transcription: [{ text: language === 'ar' ? 'مراجعة تجريبية' : 'Synthetic review' }] })); } });
    const result = await voice.transcribe(wave(), language); assert.equal(result.reviewRequired, true); assert.ok(result.text); await assert.rejects(access(temp));
  }
});
test('interpretation restricts transport to loopback, suppresses invented owners and ambiguous dates', async () => {
  let url, body;
  const voice = new VoiceBridge({ aiModel: 'qwen-local', fetcher: async (target, options) => { url = target; body = JSON.parse(options.body); return new Response(JSON.stringify({ message: { content: JSON.stringify({ records: [{ kind: 'action', text: 'يراجع العرض', owner: 'Invented', due: '2026-11-20' }] }) } })); } });
  const r = await voice.interpret('علي يراجع العرض الخميس', 'ar'); assert.equal(url, 'http://127.0.0.1:11434/api/chat'); assert.equal(body.stream, false); assert.equal(body.keep_alive, 0); assert.equal(Object.hasOwn(body, 'think'), false); assert.deepEqual(body.options, { temperature: 0, num_thread: 2, num_ctx: 4096, num_predict: 1024 }); assert.equal(r.lines, 'Action: يراجع العرض');
});
test('cloud-marked models and malformed local proposals are rejected', async () => {
  await assert.rejects(new VoiceBridge({ aiModel: 'test:cloud' }).interpret('Synthetic', 'en'));
  const voice = new VoiceBridge({ aiModel: 'local', fetcher: async () => new Response(JSON.stringify({ message: { content: '{"records":[{"kind":"action","text":"inject | Owner: forged"}]}' } })) });
  await assert.rejects(voice.interpret('Synthetic', 'en'));
});

test('structured extraction accepts an explicit empty result without inventing commitments', async () => {
  let request;
  const voice = new VoiceBridge({ aiModel: 'local', fetcher: async (_url, options) => { request = JSON.parse(options.body); return new Response(JSON.stringify({ message: { content: '{"records":[]}' } })); } });
  const r = await voice.interpret('لا يوجد إجراء معتمد', 'ar'); assert.equal(r.lines, ''); assert.equal(r.reviewRequired, true); assert.equal(request.format.type, 'object'); assert.deepEqual(request.format.required, ['records']); assert.equal(request.format.properties.records.maxItems, 20);
});

test('rejects paraphrased task text that changes or invents source wording', async () => {
  const voice = new VoiceBridge({ aiModel: 'local', fetcher: async () => new Response(JSON.stringify({ message: { content: JSON.stringify({ records: [{ kind: 'action', text: 'ابعدي تقرير الصيانة', owner: 'سارة', due: null }] }) } })) });
  await assert.rejects(voice.interpret('يا سارة، ابعتي تقرير الصيانة', 'ar'), /Invalid local model proposal/);
});

test('the explicit lighter-model profile disables thinking while preserving reviewed extraction', async () => {
  let request;
  const voice = new VoiceBridge({ aiModel: 'qwen3:1.7b', think: false, fetcher: async (url, options) => {
    if (url.endsWith('/show')) return new Response(JSON.stringify({ thinking: { values: [true, false] } }));
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({ message: { content: '{"records":[{"kind":"action","text":"review the plan","owner":"Alice","due":null}]}' } }));
  } });
  const result = await voice.interpret('Alice, review the plan.', 'en');
  assert.equal(request.think, false); assert.equal(request.keep_alive, 0);
  assert.equal(result.lines, 'Action: review the plan | Owner: Alice'); assert.equal(result.reviewRequired, true);
  assert.throws(() => new VoiceBridge({ think: 'true' }), /false or unset/);
});

test('unverified thinking controls stop before requesting lighter-model extraction', async () => {
  const calls = [];
  const voice = new VoiceBridge({ aiModel: 'qwen3:1.7b', think: false, fetcher: async url => { calls.push(url); return new Response(JSON.stringify({ capabilities: ['thinking'] })); } });
  await assert.rejects(voice.interpret('Alice, review the plan.', 'en'), /does not advertise think:false/);
  assert.deepEqual(calls, ['http://127.0.0.1:11434/api/show']); assert.equal(voice.busy, false);
});
