// Synthetic acceptance against the actual launcher and persistent browser profiles.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { startLocalApp, APP_URL } from './LocalLauncher.mjs';
const require = createRequire(resolve(process.env.BROWSER_TOOL_ROOT, 'package.json'));
const { chromium } = require('playwright');
const key = 'exeflow.commitments.v1';
const output = resolve('artifacts/local');
await mkdir(output, { recursive: true });
for (const lang of ['en', 'ar']) {
  const en = lang === 'en';
  const profile = await mkdtemp(resolve(tmpdir(), 'ExecFlowProfile'));
  let server, context;
  const external = [], errors = [];
  const launch = async () => {
    context = await chromium.launchPersistentContext(profile, { headless: true, ...(process.env.EXECFLOW_BROWSER_EXECUTABLE ? { executablePath: process.env.EXECFLOW_BROWSER_EXECUTABLE } : {}), viewport: { width: en ? 1440 : 390, height: 900 } });
    await context.route('**/*', route => {
      if (!route.request().url().startsWith('http://127.0.0.1:4173/')) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    const page = context.pages()[0];
    page.on('pageerror', e => errors.push(e.message));
    return page;
  };
  const stop = async () => { await context.close(); context = null; await new Promise(r => { server.close(r); server.closeAllConnections(); }); server = null; };
  try {
    server = await startLocalApp();
    let page = await launch();
    await page.goto(APP_URL);
    await page.evaluate(lang => localStorage.setItem('exeflow.rmd.lang', lang), lang); await page.reload();
    const item = en ? 'Review synthetic launcher proposal' : 'مراجعة مقترح المشغل التجريبي';
    const quote = en ? `Action: ${item} | Owner: Ali | Due: 2026-11-12` : `إجراء: ${item} | المسؤول: علي | الاستحقاق: ٢٠٢٦-١١-١٢`;
    await page.getByLabel(en ? 'Meeting / source' : 'الاجتماع / المصدر', { exact: true }).fill(en ? 'Synthetic localhost test' : 'اختبار محلي اصطناعي');
    await page.getByLabel(en ? 'Minutes' : 'المحضر', { exact: true }).fill(quote);
    await page.getByRole('button', { name: en ? 'Extract for review' : 'استخراج للمراجعة', exact: true }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: en ? 'Save reviewed records' : 'حفظ البنود المراجعة', exact: true }).click();
    const status = () => page.getByLabel(`${en ? 'Status' : 'الحالة'}: ${item}`, { exact: true });
    await status().selectOption('closed');
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).records[0].status === 'closed', key);
    const original = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: en ? 'Export register backup' : 'تصدير نسخة السجل', exact: true }).click()]);
    const backupPath = resolve(output, en ? 'SyntheticEnglish.json' : 'SyntheticArabic.json');
    await download.saveAs(backupPath);
    assert.deepEqual(JSON.parse(await readFile(backupPath, 'utf8')), original);
    await page.reload(); assert.equal(await status().inputValue(), 'closed');
    await stop(); // Entire browser process and server are stopped, not just a tab.
    server = await startLocalApp(); page = await launch(); await page.goto(APP_URL);
    assert.equal(await status().inputValue(), 'closed');
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key), original);
    await page.evaluate(key => localStorage.removeItem(key), key); await page.reload();
    assert.equal(await status().count(), 0);
    const restore = () => page.getByLabel(en ? 'Restore backup (replaces this register)' : 'استعادة نسخة (تستبدل هذا السجل)', { exact: true });
    await restore().setInputFiles(backupPath);
    assert.equal(await status().inputValue(), 'closed');
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key), original);
    await restore().setInputFiles({ name: 'Invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await page.getByRole('alert').waitFor();
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key), original);
    await stop(); server = await startLocalApp(); page = await launch(); await page.goto(APP_URL);
    assert.equal(await status().inputValue(), 'closed');
    assert.equal(original.records[0].source.quote, quote); assert.ok(original.records[0].closedOn);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log(`PASS ${lang}: capture/review/close, JSON export, reload, full browser+server restart, storage removal, JSON restore, invalid backup nonreplacement, second restart, source preservation, no external requests`);
  } finally {
    if (context) await context.close();
    if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); });
    await rm(profile, { recursive: true, force: true });
  }
}
console.log(`PASS fixed origin ${APP_URL}; synthetic data only. OS: ${process.platform}; Node: ${process.version}`);
