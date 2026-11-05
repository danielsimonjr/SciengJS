// Command line of the compiler: node compile-cli.mjs <program.p> <out-base>
// Writes <out-base>.wasm and <out-base>.symbols.json and prints the statistics as JSON.
import fs from 'node:fs';
import { compile } from './pascal.mjs';

const [src, outBase, stack] = process.argv.slice(2);
if (!src || !outBase) {
  console.error('usage: compile-cli.mjs <program.p> <out-base> [stack bytes]');
  process.exit(2);
}
const t0 = performance.now();
const r = compile(fs.readFileSync(src, 'latin1'), { ...(stack ? { stackSize: Number(stack) } : {}), check: !!process.env.T5_CHECK, realBytes: Number(process.env.T5_REAL_BYTES ?? 8) });
const ms = Math.round(performance.now() - t0);
fs.writeFileSync(`${outBase}.wasm`, r.wasm);
fs.writeFileSync(`${outBase}.symbols.json`, JSON.stringify({ stackTop: r.stackTop, pages: r.pages, symbols: r.symbols }));
// a check of the binary by the host WASM engine
await WebAssembly.compile(r.wasm);
console.log(JSON.stringify({ src, ms, wasmBytes: r.wasm.length, pages: r.pages, procedures: r.procCount }));
