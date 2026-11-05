// One run of the large build: node tex-run.mjs <build-dir> <out-dir> <terminal line> [root folders...]
// The build dir holds texprod.wasm, texprod.symbols.json and texprod.pool. The environment
// variable TEX_PROGRAM gives another program name of the build dir (T6: setprod).
// The out dir gets every file that the run wrote, the terminal text,
// and run.json with the times and the list of files that the run read.
import fs from 'node:fs';
import path from 'node:path';
import { runProgram } from '../../src/tex/run.ts';
import { flatKey, treeFromRoots } from './tree.mjs';

const program = process.env.TEX_PROGRAM || 'texprod';

const [buildDir, outDir, line, ...roots] = process.argv.slice(2);
if (!buildDir || !outDir || line === undefined) {
  console.error('usage: tex-run.mjs <build-dir> <out-dir> <terminal line> [root folders...]');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
const t0 = performance.now();
const module = await WebAssembly.compile(fs.readFileSync(path.join(buildDir, `${program}.wasm`)));
const compileMs = performance.now() - t0;
const symbols = JSON.parse(fs.readFileSync(path.join(buildDir, `${program}.symbols.json`), 'utf8'));
const { tree: vfs, paths } = treeFromRoots([outDir, ...roots]);
vfs.put('tex.pool', new Uint8Array(fs.readFileSync(path.join(buildDir, `${program}.pool`))));
const r = await runProgram({
  module, symbols, files: vfs, terminal: [line], nameKey: flatKey,
});
for (const [n, d] of vfs.written) if (n !== 'tex.pool') fs.writeFileSync(path.join(outDir, n), d);
fs.writeFileSync(path.join(outDir, 'terminal.txt'), r.terminal, 'latin1');
const info = {
  line, exit: r.exit, wasmCompileMs: Math.round(compileMs), instantiateMs: Math.round(r.instantiateMs), runMs: Math.round(r.runMs),
  wrote: [...vfs.written.keys()].filter((n) => n !== 'tex.pool').map((n) => ({ name: n, bytes: vfs.written.get(n).length })),
  read: [...vfs.read].map((n) => ({ name: n, path: paths.get(n) ?? null })),
};
fs.writeFileSync(path.join(outDir, 'run.json'), JSON.stringify(info, null, 1));
console.log(JSON.stringify({ ...info, read: info.read.length }));
