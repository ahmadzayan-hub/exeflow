import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startLocalApp, HOST, PORT, APP_URL } from './LocalLauncher.mjs';
import { request } from 'node:http';

function get(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: HOST, port, path, ...options }, res => {
      let body = ''; res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }); req.on('error', reject); req.end();
  });
}
test('fixed loopback origin', () => {
  assert.equal(APP_URL, 'http://127.0.0.1:4173/#commitments'); assert.equal(PORT, 4173);
});
test('missing build gives actionable error', async () => {
  await assert.rejects(startLocalApp({ htmlPath: '/missing/ExecFlow.html', port: 0 }), /Built app missing.*npm ci.*npm run build/);
});
test('server boundaries, occupied port, and restart', async t => {
  let server = await startLocalApp({ port: 0 });
  const port = server.address().port;
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  await t.test('only binds IPv4 loopback', () => assert.equal(server.address().address, HOST));
  await t.test('serves built app without npm dependencies', async () => {
    const r = await get(port, '/', { headers: { host: `${HOST}:${port}` } });
    assert.equal(r.status, 200); assert.match(r.body, /<script type="module">/);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.match(r.headers['content-security-policy'], /connect-src 'self'/);
  });
  await t.test('rejects other Host names', async () => assert.equal((await get(port, '/', { headers: { host: `localhost:${port}` } })).status, 403));
  await t.test('does not expose source files or backend', async () => {
    for (const path of ['/package.json', '/.env', '/..%2fpackage.json', '/api/health']) assert.equal((await get(port, path)).status, 404);
  });
  await t.test('rejects writes', async () => assert.equal((await get(port, '/', { method: 'POST' })).status, 405));
  await t.test('occupied port fails without fallback or killing owner', async () => {
    await assert.rejects(startLocalApp({ port }), /already in use.*No other process was stopped/);
    assert.equal((await get(port, '/')).status, 200);
  });
  await t.test('shutdown and reopen same port', async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    server = await startLocalApp({ port });
    assert.equal((await get(port, '/')).status, 200);
  });
});

for (const stopMode of ['Enter', 'SIGINT']) test(`packaged CLI works from a folder with spaces without node_modules and stops with ${stopMode}`, { skip: stopMode === 'SIGINT' && process.platform === 'win32' ? 'Windows process.kill does not simulate console Ctrl+C; use Enter acceptance and manual console check.' : false }, async () => {
  const { mkdtemp, mkdir, copyFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const folder = await mkdtemp(join(tmpdir(), 'ExecFlow Package '));
  let child;
  try {
    await mkdir(join(folder, 'scripts')); await mkdir(join(folder, 'dist'));
    await copyFile(new URL('./LocalLauncher.mjs', import.meta.url), join(folder, 'scripts', 'LocalLauncher.mjs'));
    await copyFile(new URL('../dist/rmd-dashboard.html', import.meta.url), join(folder, 'dist', 'rmd-dashboard.html'));
    child = spawn(process.execPath, [join(folder, 'scripts', 'LocalLauncher.mjs')], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, EXECFLOW_OPEN_BROWSER: '0' } });
    let output = ''; child.stdout.on('data', c => { output += c; }); child.stderr.on('data', c => { output += c; });
    // Wait for the app's own readiness message, not an arbitrary sleep.
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(output || 'Launcher readiness timeout')), 10000);
      child.stdout.on('data', () => { if (output.includes('ExecFlow is running locally')) { clearTimeout(timeout); resolve(); } });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Exited ${code}: ${output}`)); });
    });
    assert.equal((await get(PORT, '/')).status, 200);
    assert.match(output, /Ctrl\+C/); assert.match(output, /permanent backup/);
    const exited = once(child, 'exit');
    if (stopMode === 'Enter') child.stdin.write('\n'); else child.kill('SIGINT');
    const [code] = await Promise.race([exited, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Launcher exit timed out: ' + output)), 5000); timer.unref(); })]);
    assert.equal(code, 0); assert.match(output, /ExecFlow stopped/);
    child = null;
    const restarted = await startLocalApp();
    await new Promise(resolve => { restarted.close(resolve); restarted.closeAllConnections(); });
  } finally { if (child) child.kill(); await rm(folder, { recursive: true, force: true }); }
});
