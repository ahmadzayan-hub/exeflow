import ts from 'typescript';
import { readFile, writeFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/commitments/register.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
await writeFile(new URL('../dist/CommitmentRuntime.mjs', import.meta.url), compiled);
