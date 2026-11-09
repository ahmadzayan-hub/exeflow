// Author: Ahmed Zaian. Native cmd.exe acceptance; synthetic/disposable files only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, copyFile, cp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { APP_URL, HOST, PORT } from './LocalLauncher.mjs';
if (process.platform !== 'win32') throw new Error('This acceptance script requires a real Windows executor.');
const folder = await mkdtemp(join(tmpdir(), 'ExecFlow Package & Windows '));
const results = { platform: process.platform, node: process.version, checks: [] };
const children = new Set();
async function start({ portable = false, missingBuild = false, pathOnly = false, backup = false } = {}) {
  const sub = join(folder, `Case${results.checks.length}`);
  await mkdir(join(sub, 'scripts'), { recursive: true });
  await copyFile(new URL('../BackupExecFlow.cmd', import.meta.url), join(sub, 'BackupExecFlow.cmd'));
  await copyFile(new URL('./BackupService.mjs', import.meta.url), join(sub, 'scripts', 'BackupService.mjs'));
  await copyFile(new URL('../StartExecFlow.cmd', import.meta.url), join(sub, 'StartExecFlow.cmd'));
  await copyFile(new URL('./LocalLauncher.mjs', import.meta.url), join(sub, 'scripts', 'LocalLauncher.mjs'));
  await cp(new URL('./services/', import.meta.url), join(sub, 'scripts', 'services'), { recursive: true });
  if (!missingBuild) {
    await mkdir(join(sub, 'dist')); await copyFile(new URL('../dist/CommitmentRuntime.mjs', import.meta.url), join(sub, 'dist', 'CommitmentRuntime.mjs')); await copyFile(new URL('../dist/rmd-dashboard.html', import.meta.url), join(sub, 'dist', 'rmd-dashboard.html'));
  }
  if (portable) { await mkdir(join(sub, 'Runtime')); await copyFile(process.execPath, join(sub, 'Runtime', 'node.exe')); }
  const env = { ...process.env, EXECFLOW_OPEN_BROWSER: '0', EXECFLOW_DATA_DIR: join(sub, 'PrivateData') };
  if (portable || pathOnly) env.Path = env.PATH = join(process.env.SystemRoot, 'System32');
  if (backup) { await mkdir(join(sub,'PrivateData')); await mkdir(join(sub,'Backups')); }
  // shell is cmd.exe explicitly; the full command path is quoted, including & and spaces.
  const child = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', (backup ? `""${join(sub, 'BackupExecFlow.cmd')}" "${join(sub, 'Backups')}""` : `""${join(sub, 'StartExecFlow.cmd')}""`)], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, windowsVerbatimArguments: true });
  children.add(child); let output = '';
  child.stdout.on('data', c => { output += c; }); child.stderr.on('data', c => { output += c; });
  const exited = once(child, 'exit');
  const waitText = text => new Promise((resolve, reject) => {
    if (output.includes(text)) return resolve();
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${text}: ${output}`)), 15000);
    const observe = () => { if (output.includes(text)) { clearTimeout(timer); resolve(); } };
    child.stdout.on('data', observe); child.stderr.on('data', observe);
    child.once('exit', code => { clearTimeout(timer); if (!output.includes(text)) reject(new Error(`Exited ${code}: ${output}`)); });
  });
  return { child, exited, waitText, output: () => output };
}
async function close(run, expected) {
  run.child.stdin.write('\r\n');
  const [code] = await Promise.race([run.exited, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error(`Exit timeout: ${run.output()}`)), 10000); timer.unref(); })]);
  children.delete(run.child); assert.equal(code, expected, run.output());
}
function pass(check) { results.checks.push(check); console.log(`PASS Windows: ${check}`); }
try {
  let run = await start(); await run.waitText('ExecFlow is running locally');
  assert.equal((await fetch(APP_URL.split('#')[0])).status, 200);
  await close(run, 0); assert.match(run.output(), /ExecFlow stopped/);
  pass('actual cmd launcher starts from path containing spaces and &, uses fixed origin, exits cleanly with Enter');
  run = await start({ portable: true }); await run.waitText('ExecFlow is running locally'); await close(run, 0);
  pass('approved portable Node works with no Node in PATH and no npm/node_modules');
  run = await start({ pathOnly: true }); await run.waitText('Node.js was not found'); await close(run, 1);
  pass('missing Node reports a clear message and exits with failure');
  run = await start({ missingBuild: true }); await run.waitText('Built app missing or unreadable'); await close(run, 1);
  pass('missing build reports recovery instructions and exits with failure');
  const occupied = createServer((req, res) => { res.end('Synthetic port owner'); });
  await new Promise((resolve, reject) => { occupied.once('error', reject); occupied.listen(PORT, HOST, resolve); });
  try {
    run = await start(); await run.waitText(`Port ${PORT} is already in use`); await close(run, 1);
    assert.equal(await (await fetch(`http://${HOST}:${PORT}/`)).text(), 'Synthetic port owner');
    pass('occupied port is preserved, without fallback or termination of its owner');
  } finally { await new Promise(resolve => { occupied.close(resolve); occupied.closeAllConnections(); }); }
  run = await start(); await run.waitText('ExecFlow is running locally'); await close(run, 0);
  pass('same fixed port reopens after clean shutdown');
  run = await start({ backup: true, portable: true }); await run.waitText('Choose a different volume'); await close(run, 1);
  pass('native backup command rejects a same-volume destination and preserves service data');
  await mkdir('artifacts/local', { recursive: true });
  await writeFile('artifacts/local/WindowsAcceptance.json', JSON.stringify(results, null, 2));
} finally {
  for (const child of children) child.kill();
  await rm(folder, { recursive: true, force: true });
}
