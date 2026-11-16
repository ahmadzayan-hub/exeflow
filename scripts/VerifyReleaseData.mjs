// Public distribution must exclude the organisation-specific register.
// The register is no longer tracked; when a local copy exists (data/private/register.json) it is used
// as the audit source, otherwise only the synthetic-seed assertion runs.
import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../dist/rmd-dashboard.html', import.meta.url), 'utf8');
if (!html.includes('Public release with an empty demonstration portfolio')) throw new Error('Synthetic release seed was not included');
let source = { projects: [] };
try {
  source = JSON.parse(await readFile(new URL('../data/private/register.json', import.meta.url), 'utf8'));
} catch { /* no local register: nothing further to compare against */ }
for (const p of source.projects ?? []) {
  for (const value of [p.name?.en, p.name?.ar, p.contractor, p.consultant, ...(p.sources ?? [])]) {
    if (typeof value === 'string' && value.length >= 14 && html.includes(value)) throw new Error('An organisational register value is present in the public bundle');
  }
}
console.log('PASS public release data audit: empty demonstration seed; local register values (when present) excluded.');
