// Author: Ahmed Zaian. Dependency-free, loopback-only static launcher.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createLocalServices } from './services/LocalServices.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HOST = '127.0.0.1';
export const PORT = 4173;
export const APP_URL = `http://${HOST}:${PORT}/#commitments`;
const defaultHtml = new URL('../dist/rmd-dashboard.html', import.meta.url);

export async function startLocalApp({ htmlPath = defaultHtml, port = PORT, services = true, serviceOptions = {} } = {}) {
  let html;
  try { html = await readFile(htmlPath); }
  catch { throw new Error('Built app missing or unreadable. Extract the complete Windows package, or run npm ci then npm run build in the source checkout. No packages are installed automatically.'); }
  const runtime = services ? await import(new URL('../dist/CommitmentRuntime.mjs', import.meta.url)) : null;
  const local = services ? await createLocalServices({ ...serviceOptions, validator: runtime.isRegister }) : null;
  const server = createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      // Keep this offline package local even if a build contains a remote API URL.
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    };
    if (req.headers.host !== `${HOST}:${server.address().port}`) {
      res.writeHead(403, headers); res.end('Use the fixed 127.0.0.1 address printed in the launcher.'); return;
    }
    if (local && await local.handle(req, res, `http://${HOST}:${server.address().port}`)) return;
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { ...headers, Allow: 'GET, HEAD' }); res.end(); return; }
    const pathname = req.url?.split('?')[0];
    if (pathname !== '/' && pathname !== '/index.html' && pathname !== '/rmd-dashboard.html') {
      res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not available in this offline package. Backend reporting requires its separately configured service.'); return;
    }
    res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : html);
  });
  server.execflowPairingCode = local?.pairingCode;
  server.once("close", () => local?.close());
  await new Promise((resolve, reject) => {
    const failed = error => {
      local?.close();
      if (error.code === 'EADDRINUSE') reject(new Error(`Port ${port} is already in use. Close the other ExecFlow launcher with Ctrl+C, or close the application using this port. No other process was stopped and no alternate port was selected.`));
      else reject(new Error(`Cannot start local server (${error.code ?? error.message}). Check local security policy and permissions.`));
    };
    server.once('error', failed);
    server.listen(port, HOST, () => { server.off('error', failed); resolve(); });
  });
  return server;
}

export function openBrowser(url) {
  if (process.platform !== 'win32') return;
  const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { stdio: 'ignore', windowsHide: true });
  child.on('error', () => console.error(`Browser could not open. Copy this address into your normal browser: ${url}`));
  child.on('exit', code => { if (code) console.error(`Browser did not open. Copy this address: ${url}`); });
  child.unref();
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required. Install an approved Node.js LTS runtime and reopen the launcher.');
  const server = await startLocalApp();
  console.log(`\nExecFlow is running locally: ${APP_URL}\nKeep this window open. Press Enter or Ctrl+C here to stop the server.\nClosing the browser does not stop the server.\nUse the SAME browser profile and this EXACT address every time.\nExport register JSON backups to a separate safe folder. Browser storage is not a permanent backup.\nNo public hosting or cloud service is started.\n`);
  console.log(`Local pairing code: ${server.execflowPairingCode}`);
  if (process.env.EXECFLOW_OPEN_BROWSER !== "0") openBrowser(`${APP_URL}&pair=${server.execflowPairingCode}`);
  const input = createInterface({ input: process.stdin, terminal: false });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    input.close();
    process.stdin.pause();
    process.stdin.destroy();
    console.log('\nStopping ExecFlow. Browser data is not deleted.');
    server.close(() => { console.log('ExecFlow stopped.'); process.exitCode = 0; });
    server.closeAllConnections();
  };
  input.on('line', stop);
  process.on('SIGINT', stop);
  if (process.platform === 'win32') process.on('SIGBREAK', stop);
  process.on('SIGTERM', stop);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) {
  main().catch(error => { console.error(`\nExecFlow could not start: ${error.message}`); process.exitCode = 1; });
}
