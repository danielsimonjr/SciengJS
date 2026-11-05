// Run a compiled texware program (pltotf, tftopl, dvitype) on host files.
// node run-texware.mjs <build-dir> <program> <in-name=host-path>... [--term line]... [--out name=host-path]...
// The program names its files by its Pascal variable names, for example plfile and tfmfile.
import fs from 'node:fs';
import { runProgram } from '../../src/tex/run.ts';
import { treeOf } from './tree.mjs';

const [dir, prog, ...rest] = process.argv.slice(2);
const inputs = [];
const terminal = [];
const outs = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === '--term') { terminal.push(rest[++i]); continue; }
  if (a === '--out') { const [n, p] = rest[++i].split('='); outs.push([n, p]); continue; }
  const [n, p] = a.split('=');
  inputs.push([n, fs.readFileSync(p)]);
}
const module = await WebAssembly.compile(fs.readFileSync(`${dir}/${prog}.wasm`));
const symbols = JSON.parse(fs.readFileSync(`${dir}/${prog}.symbols.json`, 'utf8'));
const files = treeOf(inputs);
const r = await runProgram({ module, symbols, files, terminal });
for (const [n, p] of outs) {
  const d = files.get(n);
  if (!d) { console.error(`no output file ${n}`); process.exitCode = 1; continue; }
  fs.writeFileSync(p, d);
}
process.stdout.write(r.terminal);
console.error(JSON.stringify({ prog, exit: r.exit, runMs: Math.round(r.runMs) }));
