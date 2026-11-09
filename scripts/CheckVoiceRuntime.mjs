// Author: Ahmed Zaian. Read-only checks; no downloads, worker, account or settings writes.
import { access } from 'node:fs/promises';
import { isAbsolute, basename } from 'node:path';
import { totalmem, freemem, platform, cpus } from 'node:os';
const [executable, model, aiModel] = process.argv.slice(2);
const checks = [];
for (const [name, file] of [['executable', executable], ['model', model]]) {
  const local = typeof file === 'string' && isAbsolute(file) && !/^(?:\\\\|\/\/)/.test(file) && !file.includes('://');
  let exists = false; if (local) try { await access(file); exists = true; } catch {}
  checks.push({ name, passed: local && exists, message: exists ? 'Local file exists; approval/authenticity not inferred.' : 'Supply an existing absolute local file path.' });
}
checks.push({ name: 'multilingual-model-name', passed: !!model && !/\.en(?:[-.]|$)/i.test(basename(model)), message: 'English-only filenames are unsuitable for Arabic. A renamed model still requires engine verification.' });
let installed = false, connectionError;
if (typeof aiModel === 'string' && /^[a-z0-9_.:/-]{1,100}$/i.test(aiModel) && !/cloud/i.test(aiModel)) {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`Ollama returned ${r.status}`);
    const tags = await r.json(); installed = tags.models?.some(m => m.name === aiModel) === true;
  } catch (error) { connectionError = error.message; }
}
checks.push({ name: 'installed-model', passed: installed, message: connectionError ?? (installed ? 'Exact local model tag found. This does not prove semantic accuracy or offline configuration.' : 'Start an approved local Ollama server and supply an exact installed model tag.') });
console.log(JSON.stringify({ platform: platform(), node: process.version, cpuCount: cpus().length, reportedTotalGiB: totalmem() / 2 ** 30, reportedFreeGiB: freemem() / 2 ** 30, checks, suggestedSettings: { OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_NO_CLOUD: '1', OLLAMA_NUM_PARALLEL: '1', OLLAMA_MAX_LOADED_MODELS: '1' }, settingsApplied: false, offlineVerified: false, instructions: 'Verify Ollama cloud-disabled log and outbound policy separately. Run a real recording and the interpretation suite. System-reported memory may differ from container limits.' }, null, 2));
if (checks.some(c => !c.passed)) process.exitCode = 1;
