// Public distribution must exclude the organisation-specific seed register.
import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../dist/rmd-dashboard.html', import.meta.url), 'utf8');
const source = JSON.parse(await readFile(new URL('../src/data/portfolio.json', import.meta.url), 'utf8'));
if (!html.includes('Public release with an empty demonstration portfolio')) throw new Error('Synthetic release seed was not included');
for (const p of source.projects) {
  for (const value of [p.name?.en, p.name?.ar, p.contractor, p.consultant, ...(p.sources ?? [])]) {
    if (typeof value === 'string' && value.length >= 14 && html.includes(value)) throw new Error('An organisational seed value is present in the public bundle');
  }
}
console.log('PASS public release data audit: empty demonstration seed; source project names, contractors, consultants and sources excluded.');
