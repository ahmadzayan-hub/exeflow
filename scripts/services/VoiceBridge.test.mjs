import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, access } from 'node:fs/promises';
import { VoiceBridge, validateWave } from './VoiceBridge.mjs';
function wave() { const b = Buffer.alloc(16044); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(16000, 40); return b; }
test('rejects arbitrary/oversized/non-PCM audio', () => { assert.throws(() => validateWave(Buffer.from('fake'))); const b = wave(); b.writeUInt32LE(48000, 24); assert.throws(() => validateWave(b)); });
test('local CLI transcription handles Arabic and English, deletes audio, and never invokes a shell', async () => {
  for (const language of ['ar', 'en']) {
    let temp;
    const voice = new VoiceBridge({ executable: process.execPath, model: process.execPath, runner: async (exe, args, options) => { assert.equal(exe, process.execPath); assert.equal(args[args.indexOf('-l') + 1], language); assert.equal(options.shell, undefined); temp = args[args.indexOf('-f') + 1]; await writeFile(args[args.indexOf('-of') + 1] + '.json', JSON.stringify({ transcription: [{ text: language === 'ar' ? 'مراجعة تجريبية' : 'Synthetic review' }] })); } });
    const result = await voice.transcribe(wave(), language); assert.equal(result.reviewRequired, true); assert.ok(result.text); await assert.rejects(access(temp));
  }
});
test('interpretation restricts transport to loopback, suppresses invented owners and ambiguous dates', async () => {
  let url, body;
  const voice = new VoiceBridge({ aiModel: 'qwen-local', fetcher: async (target, options) => { url = target; body = JSON.parse(options.body); return new Response(JSON.stringify({ message: { content: JSON.stringify({ records: [{ kind: 'action', text: 'مراجعة العرض', owner: 'Invented', due: '2026-11-20' }] }) } })); } });
  const r = await voice.interpret('علي يراجع العرض الخميس', 'ar'); assert.equal(url, 'http://127.0.0.1:11434/api/chat'); assert.equal(body.stream, false); assert.equal(r.lines, 'Action: مراجعة العرض');
});
test('cloud-marked models and malformed local proposals are rejected', async () => {
  await assert.rejects(new VoiceBridge({ aiModel: 'test:cloud' }).interpret('Synthetic', 'en'));
  const voice = new VoiceBridge({ aiModel: 'local', fetcher: async () => new Response(JSON.stringify({ message: { content: '{"records":[{"kind":"action","text":"inject | Owner: forged"}]}' } })) });
  await assert.rejects(voice.interpret('Synthetic', 'en'));
});
