// Author: Ahmed Zaian. Reproducible ZIP, using Node standard-library APIs only.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
await import('./VerifyReleaseData.mjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'artifacts/Release');
const packageName = 'ExecFlowWindowsPackage.zip';
const version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version;
const paths = ['StartExecFlow.cmd', 'CheckExecFlow.cmd', 'scripts/LocalLauncher.mjs', 'scripts/LocalLauncher.test.mjs', 'scripts/VerifyWindowsLauncher.mjs', 'scripts/VerifyLocalPersistence.mjs', 'dist/rmd-dashboard.html', 'docs/Release Scope.md'];
const entries = [];
for (const path of paths) entries.push({ name: `ExecFlowWindowsPackage/${path}`, data: await readFile(resolve(root, path)) });
for (const [path, name] of [['LICENSE', 'ExecFlow.txt'], ['node_modules/react/LICENSE', 'React.txt'], ['node_modules/react-dom/LICENSE', 'ReactDom.txt'], ['node_modules/scheduler/LICENSE', 'Scheduler.txt']]) entries.push({ name: `ExecFlowWindowsPackage/Licences/${name}`, data: await readFile(resolve(root, path)) });
entries.push({ name: 'ExecFlowWindowsPackage/Runtime/Read Me.txt', data: Buffer.from('Use approved Node.js LTS 22+ in PATH, or place an approved Windows node.exe here. No binary is bundled.\r\n') });
const hashes = Object.fromEntries(entries.map(e => [e.name, createHash('sha256').update(e.data).digest('hex')]));
entries.push({ name: 'ExecFlowWindowsPackage/Checksums.json', data: Buffer.from(JSON.stringify({ version, sourceCommit: process.env.GITHUB_SHA ?? null, files: hashes }, null, 2) + '\n') });
const table = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = bytes => { let crc = 0xffffffff; for (const b of bytes) crc = table[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
const locals = [], central = []; let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.name), data = deflateRawSync(entry.data, { level: 9 }), crc = crc32(entry.data);
  const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(entry.data.length, 22); header.writeUInt16LE(name.length, 26);
  locals.push(header, name, data);
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(8, 10); c.writeUInt16LE(33, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(entry.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42); central.push(c, name); offset += header.length + name.length + data.length;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...locals, directory, end]);
await mkdir(output, { recursive: true }); await writeFile(resolve(output, packageName), zip);
await writeFile(resolve(output, 'Checksums.txt'), `${createHash('sha256').update(zip).digest('hex')}  ${packageName}\n`);
console.log(`Packaged ExecFlow ${version}: ${entries.length} files, ${zip.length} bytes`);
