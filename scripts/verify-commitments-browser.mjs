import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(resolve(process.env.BROWSER_TOOL_ROOT, 'package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });
const key = 'exeflow.commitments.v1';
try {
  for (const lang of ['en', 'ar']) for (const width of [1440, 390]) {
    const en = lang === 'en';
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(({ lang }) => {
      localStorage.setItem('exeflow.rmd.lang', lang);
      localStorage.setItem('exeflow.rmd.portfolio', JSON.stringify({
        schemaVersion: 1, dataset: 'demo', title: { en: 'Synthetic test' }, organisation: { en: 'Synthetic workspace' },
        disclaimer: { en: 'Synthetic only' }, reportingPeriod: { asOf: '2026-11-08', label: { en: 'Test' } }, projects: [],
      }));
    }, { lang });
    const network = [], errors = [];
    await context.route('**/*', route => {
      if (/^https?:/.test(route.request().url())) { network.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${pathToFileURL(resolve('dist/rmd-dashboard.html')).href}#commitments`);
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
    await page.reload();
    await status.waitFor(); assert.equal(await status.inputValue(), 'closed');
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
    assert.deepEqual(network, [], 'capture, save and brief stay offline'); assert.deepEqual(errors, []);
    console.log(`PASS commitments ${lang}/${width}: review gate, unresolved line, source preservation, closure, reload, backup/restore, invalid backup, no network or overflow`);
    await context.close();
  }
} finally { await browser.close(); }
