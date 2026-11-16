import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(resolve(process.env.BROWSER_TOOL_ROOT, 'package.json'));
const { chromium } = require('playwright');
const output = resolve('artifacts/jarvis');
await mkdir(output, { recursive: true });
const fixture = {
  schemaVersion: 1, dataset: 'imported', title: { en: 'Synthetic portfolio', ar: 'محفظة اختبار اصطناعية' },
  organisation: { en: 'Synthetic workspace', ar: 'بيئة اختبار' },
  disclaimer: { en: 'Fabricated browser fixture only', ar: 'بيانات اختبار مصطنعة فقط' },
  reportingPeriod: { asOf: '2026-09-02', label: { en: 'Test period', ar: 'فترة اختبار' } },
  projects: [{ id: 'synthetic-1', code: 'TEST-1', kind: 'project', name: { en: 'Synthetic project', ar: 'مشروع اصطناعي' },
    asset: 'metro', category: 'power', stage: 'execution', confidence: 'illustrative',
    progress: { planned: null, actual: null }, risks: [], milestones: [], sources: ['Synthetic source'],
    attention: [{ id: 'late-1', type: 'waiting', title: { en: 'Synthetic overdue item', ar: 'بند اختبار متأخر' }, due: '2026-09-01', owner: 'Synthetic owner', status: 'open' }],
  }],
};
const browser = await chromium.launch({ headless: true });
try {
  for (const lang of ['en', 'ar']) for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(({ fixture, lang }) => {
      localStorage.setItem('exeflow.rmd.portfolio', JSON.stringify(fixture));
      localStorage.setItem('exeflow.rmd.lang', lang);
    }, { fixture, lang });
    const page = await context.newPage();
    const errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      const url = route.request().url();
      if (/^https?:/.test(url)) { network.push(url); return route.abort(); }
      return route.continue();
    });
    await page.goto(pathToFileURL(resolve('dist/rmd-dashboard.html')).href);
    const panel = page.locator('.jarvis');
    const input = panel.locator('#jarvis-command');
    await input.waitFor({ state: 'visible' });
    assert.equal(await page.locator('html').getAttribute('dir'), lang === 'ar' ? 'rtl' : 'ltr');
    await input.fill('overdue');
    await input.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('type')), 'submit');
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none');
    await page.keyboard.press('Enter');
    await panel.locator('.jarvis-results li').waitFor();
    assert.equal(await panel.locator('.jarvis-results li').count(), 1);
    assert.ok((await panel.innerText()).includes('Synthetic source'));
    assert.ok((await panel.innerText()).includes('Synthetic owner'));
    await panel.locator('.jarvis-results button').click();
    await page.getByRole('dialog').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.locator('.filters input[type="search"]').fill('no-matching-project');
    await page.waitForFunction(() => !document.querySelector('.jarvis-results li'));
    await page.locator('.filters input[type="search"]').fill('');
    await panel.locator('.jarvis-results li').waitFor();
    // The actual browser voice inventory is observed, never replaced with mocks.
    // No utterance is started; this cannot certify audible playback or OS locality.
    const voices = await page.evaluate(() => speechSynthesis.getVoices().map(v => ({ lang: v.lang, local: v.localService })));
    const hasLocal = voices.some(v => v.local && v.lang.toLowerCase().split(/[-_]/)[0] === lang);
    const read = panel.locator('.jarvis-result > .jarvis-actions button').first();
    if (!hasLocal) assert.ok(await read.isDisabled(), 'readback disabled without an actual matching local voice');
    await page.evaluate(() => document.querySelector('.jarvis-core').classList.add('is-speaking'));
    assert.equal(await panel.locator('.jarvis-core span').first().evaluate(e => getComputedStyle(e).animationName), 'none');
    await page.evaluate(() => document.querySelector('.jarvis-core').classList.remove('is-speaking'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal overflow');
    await panel.screenshot({ path: `${output}/${lang}-${width}.png` });
    assert.deepEqual(errors, []);
    assert.deepEqual(network, [], 'standalone panel makes no network requests');
    console.log(`PASS: ${lang}/${width}, keyboard command/focus, scoped evidence, drawer/Escape, filtering, reduced motion, no overflow; actual matching local voice=${hasLocal}, no audio played.`);
    await context.close();
  }
} finally { await browser.close(); }
