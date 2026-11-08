import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
const require = createRequire(resolve(process.env.BROWSER_TOOL_ROOT, 'package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });
const key = 'exeflow.commitments.v1';
await mkdir('artifacts/commitments', { recursive: true });
const html = await readFile(resolve('dist/rmd-dashboard.html'));
const server = createServer((request, response) => {
  if (request.url !== '/rmd-dashboard.html') { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const lang of ['en', 'ar']) for (const width of [1440, 390]) {
    const en = lang === 'en';
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.tracing.start({ screenshots: true, snapshots: true });
    await context.addInitScript(({ lang }) => {
      localStorage.setItem('exeflow.rmd.lang', lang);
      localStorage.setItem('exeflow.rmd.portfolio', JSON.stringify({
        schemaVersion: 1, dataset: 'demo', title: { en: 'Synthetic test' }, organisation: { en: 'Synthetic workspace' },
        disclaimer: { en: 'Synthetic only' }, reportingPeriod: { asOf: '2026-11-08', label: { en: 'Test' } }, projects: [],
      }));
    }, { lang });
    const network = [], errors = [];
    await context.route('**/*', route => {
      const url = route.request().url();
      if (/^https?:/.test(url) && url !== `${origin}/rmd-dashboard.html`) { network.push(url); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    // A stable HTTP origin is required for portable localStorage behavior.
    // file: storage is undefined across browsers and is separately labelled below.
    await page.goto(`${origin}/rmd-dashboard.html#commitments`);
    const title = en ? 'Commitment register' : 'سجل الالتزامات';
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('dir'), en ? 'ltr' : 'rtl');
    const source = page.getByLabel(en ? 'Meeting / source' : 'الاجتماع / المصدر', { exact: true });
    const minutes = page.getByLabel(en ? 'Minutes' : 'المحضر', { exact: true });
    const item = en ? 'Review synthetic proposal' : 'مراجعة العرض التجريبي';
    const quote = en ? `Action: ${item} | Owner: Ali | Due: 2026-11-01` : `إجراء: ${item} | المسؤول: علي | الاستحقاق: ٢٠٢٦-١١-٠١`;
    await source.fill(en ? 'Synthetic meeting' : 'اجتماع اصطناعي');
    await minutes.fill(`${quote}\nUnlabelled synthetic narrative`);
    await page.getByRole('button', { name: en ? 'Extract for review' : 'استخراج للمراجعة', exact: true }).click();
    await page.getByRole('alert').waitFor();
    const save = page.getByRole('button', { name: en ? 'Save reviewed records' : 'حفظ البنود المراجعة', exact: true });
    assert.equal(await save.isDisabled(), true);
    await page.getByRole('checkbox').check(); await save.click();
    await page.getByRole('status').waitFor();
    const status = page.getByLabel(`${en ? 'Status' : 'الحالة'}: ${item}`, { exact: true });
    await status.selectOption('closed');
    await page.waitForFunction(key => {
      const r = JSON.parse(localStorage.getItem(key) ?? 'null');
      return r?.records.length === 1 && r.records[0].status === 'closed' && location.hash === '#commitments';
    }, key);
    await page.reload();
    try { await status.waitFor(); } catch (error) {
      console.error('Synthetic reload diagnostic:', await page.evaluate(key => ({ url: location.href, register: localStorage.getItem(key), body: document.body.innerText.slice(-5000) }), key));
      await context.tracing.stop({ path: `artifacts/commitments/${lang}-${width}-reload.zip` });
      throw error;
    }
    assert.equal(await status.inputValue(), 'closed');
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(stored.records.length, 1); assert.equal(stored.records[0].source.quote, quote);
    assert.ok(stored.records[0].closedOn);
    assert.ok((await page.locator('.weekly-brief').innerText()).includes('100%'));
    const [backup] = await Promise.all([
      page.waitForEvent('download'), page.getByRole('button', { name: en ? 'Export register backup' : 'تصدير نسخة السجل', exact: true }).click(),
    ]);
    const backupPath = await backup.path();
    await page.getByLabel(en ? 'Restore backup (replaces this register)' : 'استعادة نسخة (تستبدل هذا السجل)', { exact: true }).setInputFiles(backupPath);
    await page.getByRole('status').waitFor();
    assert.equal(await status.inputValue(), 'closed');
    await page.getByLabel(en ? 'Restore backup (replaces this register)' : 'استعادة نسخة (تستبدل هذا السجل)', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await page.getByRole('alert').waitFor();
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key), stored);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal overflow');
    assert.deepEqual(network, [], 'only the local standalone HTML is requested'); assert.deepEqual(errors, []);
    console.log(`PASS commitments ${lang}/${width}: review gate, unresolved line, source preservation, closure, reload, backup/restore, invalid backup, no external network or overflow`);
    await context.tracing.stop(); await context.close();
  }
  const preview = await browser.newPage();
  await preview.goto(`${pathToFileURL(resolve('dist/rmd-dashboard.html')).href}#commitments`);
  await preview.getByText('This file preview may lose saved records when reloaded.', { exact: false }).waitFor();
  console.log('PASS file preview explicitly warns that reload persistence is not guaranteed');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
