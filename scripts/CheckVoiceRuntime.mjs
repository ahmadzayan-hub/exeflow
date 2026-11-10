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
let installed = false, connectionError, selectedModel, modelDetails, detailsError;
if (typeof aiModel === 'string' && /^[a-z0-9_.:/-]{1,100}$/i.test(aiModel) && !/cloud/i.test(aiModel)) {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`Ollama returned ${r.status}`);
    const tags = await r.json(); selectedModel = tags.models?.find(m => m.name === aiModel); installed = !!selectedModel;
    if (installed) {
      try {
        const shown = await fetch('http://127.0.0.1:11434/api/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: aiModel }), redirect: 'error', signal: AbortSignal.timeout(5000) });
        if (!shown.ok) throw new Error(`Ollama show returned ${shown.status}`);
        const details = await shown.json();
        modelDetails = { details: details.details, capabilities: details.capabilities, thinking: details.thinking };
      } catch (error) { detailsError = error.message; }
    }
  } catch (error) { connectionError = error.message; }
}
checks.push({ name: 'installed-model', passed: installed, message: connectionError ?? (installed ? 'Exact local model tag found. This does not prove semantic accuracy or offline configuration.' : 'Start an approved local Ollama server and supply an exact installed model tag.') });
const requestedThink = process.env.EXECFLOW_LOCAL_THINK;
if (requestedThink !== undefined) {
  // Older servers may lack boolean-control metadata. Do not infer support from a tag.
  const supported = requestedThink === 'false' && modelDetails?.thinking?.values?.includes(false) === true;
  checks.push({ name: 'non-thinking-control', passed: supported, message: supported ? 'Installed model explicitly advertises think:false. Validate extraction quality with the existing runner.' : (detailsError ?? 'Cannot verify think:false support. Leave EXECFLOW_LOCAL_THINK unset until the installed model/server documents boolean control.') });
}
console.log(JSON.stringify({ platform: platform(), node: process.version, cpuCount: cpus().length, cpuModel: cpus()[0]?.model, reportedTotalGiB: totalmem() / 2 ** 30, reportedFreeGiB: freemem() / 2 ** 30, selectedModel, modelDetails, detailsError, requestedProfile: { keep_alive: 0, ...(requestedThink === 'false' ? { think: false } : {}), num_thread: 2, num_ctx: 4096, num_predict: 1024 }, checks, suggestedSettings: { OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_NO_CLOUD: '1', OLLAMA_NUM_PARALLEL: '1', OLLAMA_MAX_LOADED_MODELS: '1' }, settingsApplied: false, offlineVerified: false, instructions: 'Verify Ollama cloud-disabled log and outbound policy separately. Run a real recording and the interpretation suite. System-reported memory is not peak model RAM and may differ from container limits.' }, null, 2));
if (checks.some(c => !c.passed)) process.exitCode = 1;
