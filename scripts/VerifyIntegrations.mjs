import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { startLocalApp, APP_URL } from './LocalLauncher.mjs';
import { VoiceBridge } from './services/VoiceBridge.mjs';
const require = createRequire(resolve(process.env.BROWSER_TOOL_ROOT, 'package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.EXECFLOW_BROWSER_EXECUTABLE ? { executablePath: process.env.EXECFLOW_BROWSER_EXECUTABLE } : {}) });
try {
  for (const lang of ['en', 'ar']) {
    const en = lang === 'en', directory = await mkdtemp(resolve(tmpdir(), 'ExecFlowIntegrationBrowser'));
    const title = en ? 'Review synthetic email' : 'مراجعة بريد تجريبي';
    const text = `Action: ${title} | Owner: Ali | Due: 2026-10-01`;
    const source = { id: 'synthetic', kind: 'email', title: 'Synthetic source', text, reference: 'https://example.test/source' };
    const sent = [], calendar = [];
    const graph = { status: () => ({ connected: true, delivery: true, calendarWrite: true, account: { id: 'synthetic-account', name: 'Synthetic', email: 'operator@example.test' } }), disconnect() {}, sources: async () => [source], source: async () => source, send: async (event, recipients) => { sent.push({ event, recipients }); return { accepted: true }; }, calendar: async record => { calendar.push(record); return { id: 'synthetic-event' }; } };
    const voice = new VoiceBridge({ executable: process.execPath, model: process.execPath, runner: async (exe, args) => { await writeFile(args[args.indexOf('-of') + 1] + '.json', JSON.stringify({ transcription: [{ text: en ? 'Synthetic voice transcript' : 'نص صوتي تجريبي' }] })); }, aiModel: 'synthetic-local', fetcher: async (_target, options) => new Response(JSON.stringify({ message: { content: JSON.stringify({ records: JSON.parse(options.body).messages.at(-1).content === 'No adopted commitment' ? [] : [{ kind: 'action', text: title, owner: 'Ali', due: '2026-10-01' }] }) } })) });
    let server, context;
    try {
      server = await startLocalApp({ serviceOptions: { directory, graph, voice, intervalMs: 0 } });
      context = await browser.newContext({ viewport: { width: en ? 1440 : 360, height: 900 } });
      await context.addInitScript(lang => localStorage.setItem('exeflow.rmd.lang', lang), lang);
      const external = [], errors = [];
      await context.route('**/*', route => { if (!route.request().url().startsWith('http://127.0.0.1:4173/')) { external.push(route.request().url()); return route.abort(); } return route.continue(); });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); await page.goto(APP_URL + '&pair=' + server.execflowPairingCode);
      await page.getByRole('button', { name: en ? 'Connect local runtime' : 'الاتصال بالخدمة المحلية', exact: true }).click();
      const audio = Buffer.alloc(32044); audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVE', 8); audio.write('fmt ', 12); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(32000, 40);
      await page.getByLabel(en ? 'Audio file' : 'ملف صوتي', { exact: true }).setInputFiles({ name: 'SyntheticVoice.wav', mimeType: 'audio/wav', buffer: audio });
      await page.waitForFunction(expected => Array.from(document.querySelectorAll('textarea')).some(e => e.value === expected), en ? 'Synthetic voice transcript' : 'نص صوتي تجريبي');
      await page.getByRole('button', { name: en ? 'Read recent mail' : 'قراءة البريد الحديث', exact: true }).click();
      await page.getByRole('button', { name: 'Synthetic source', exact: true }).click();
      await page.getByRole('button', { name: en ? 'Prepare proposals for human review' : 'إعداد مقترحات للمراجعة البشرية', exact: true }).click();
      await page.getByRole('button', { name: en ? 'Extract for review' : 'استخراج للمراجعة', exact: true }).click();
      const review = page.getByRole('checkbox', { name: en ? 'I reviewed the quoted lines, missing fields, and any omitted lines.' : 'راجعت الأسطر المقتبسة والحقول الناقصة وأي أسطر مستبعدة.', exact: true });
      const save = page.getByRole('button', { name: en ? 'Save reviewed records' : 'حفظ البنود المراجعة', exact: true }); assert.equal(await save.isDisabled(), true); await review.check(); await save.click();
      await page.getByLabel(`${en ? 'Status' : 'الحالة'}: ${title}`, { exact: true }).waitFor();
      let disk; await page.waitForFunction(() => JSON.parse(localStorage.getItem('exeflow.commitments.v1') ?? '{}').records?.length === 1);
      disk = JSON.parse(await readFile(resolve(directory, 'State.json'), 'utf8')); assert.equal(disk.register.records[0].source.original.text, text);
      await page.getByLabel(en ? 'Calendar commitment' : 'بند التقويم', { exact: true }).selectOption(disk.register.records[0].id);
      await page.getByRole('checkbox', { name: en ? 'Create an all-day due-date event in my Microsoft calendar for this record' : 'إنشاء حدث يوم كامل بتاريخ استحقاق هذا البند في تقويم Microsoft', exact: true }).check();
      await page.getByRole('button', { name: en ? 'Create reviewed calendar event' : 'إنشاء حدث التقويم المراجع', exact: true }).click();
      await page.getByRole('button', { name: en ? 'Create reviewed calendar event' : 'إنشاء حدث التقويم المراجع', exact: true }).isDisabled(); assert.equal(calendar.length, 1);
      await page.getByLabel(en ? 'Exact email recipients (comma separated)' : 'عناوين المستلمين الدقيقة مفصولة بفواصل', { exact: true }).fill('recipient@example.test');
      await page.getByRole('checkbox', { name: en ? 'Enable automatic monitoring' : 'تفعيل المراقبة الآلية', exact: true }).check();
      await page.getByRole('checkbox', { name: en ? 'Send automated email to these recipients' : 'إرسال بريد آلي إلى هؤلاء المستلمين', exact: true }).check();
      const policy = page.getByRole('button', { name: en ? 'Save automation policy' : 'حفظ سياسة الأتمتة', exact: true }); assert.equal(await policy.isDisabled(), true);
      await page.getByRole('checkbox', { name: en ? 'I approve these recipients and thresholds for automatic email submission' : 'أعتمد هؤلاء المستلمين وحدود التأخر لإرسال البريد الآلي', exact: true }).check(); await policy.click();
      await page.getByText(en ? 'Accepted for processing' : 'قُبل للمعالجة', { exact: true }).waitFor(); assert.equal(sent.length, 1); assert.deepEqual(sent[0].recipients, ['recipient@example.test']);
      await page.getByLabel(en ? 'Original source excerpt / transcript' : 'مقتطف المصدر الأصلي / النص الصوتي', { exact: true }).fill('No adopted commitment');
      await page.getByRole('button', { name: en ? 'Prepare proposals for human review' : 'إعداد مقترحات للمراجعة البشرية', exact: true }).click();
      await page.getByText(en ? 'No adopted commitment was found. Review the source; no records were saved.' : 'لم يُعثر على التزام معتمد. راجع المصدر؛ لم تُحفظ أي بنود.', { exact: true }).waitFor();
      assert.equal(JSON.parse(await readFile(resolve(directory, 'State.json'), 'utf8')).register.records.length, 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)); assert.deepEqual(errors, []); assert.deepEqual(external, []);
      console.log(`PASS integration ${lang}: actual local HTTP/session, explicit connection, browser audio decoding/WAV upload, simulated local speech engine, synthetic Graph source, local-model protocol, original evidence, review gate, atomic disk sync, reviewed calendar, approved escalation, no external browser requests; adapters simulated`);
    } finally { if (context) await context.close(); if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); }); await rm(directory, { recursive: true, force: true }); }
  }
} finally { await browser.close(); }
