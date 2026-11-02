// Build every program of the trial from the pinned sources.
// node build.mjs <sources-dir> <build-dir>
// It downloads each source that is not in the sources dir yet (pinned sha256),
// then tangles and compiles each program of config.json. It prints the sizes and times as JSON.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { tangle } from './tangle.mjs';
import { compile } from './pascal.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const trial = path.resolve(here, '..');
const config = JSON.parse(fs.readFileSync(path.join(trial, 'config.json'), 'utf8'));
const [srcDir, buildDir] = process.argv.slice(2);
if (!srcDir || !buildDir) {
  console.error('usage: build.mjs <sources-dir> <build-dir>');
  process.exit(2);
}
fs.mkdirSync(buildDir, { recursive: true });
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const out = { sources: [], programs: [], runtime: typeof Bun !== 'undefined' ? `bun ${Bun.version}` : `node ${process.versions.node}`, platform: `${process.platform}-${process.arch}` };
for (const f of config.sources.files) {
  const p = path.join(srcDir, f.path);
  if (!fs.existsSync(p)) {
    const url = config.sources.base + f.path;
    // the CTAN redirector picks a mirror for each request; a mirror can refuse, so try again
    let res, b, tries = 0;
    for (;;) {
      tries++;
      try {
        res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'sciengjs-trial-t5' } });
        if (res.ok) { b = new Uint8Array(await res.arrayBuffer()); if (sha(b) === f.sha256) break; }
      } catch (e) {
        res = { ok: false, status: e.cause?.code ?? e.message };
      }
      if (tries >= 6) break;
      await new Promise((ok) => setTimeout(ok, 1000 * tries));
    }
    if (!res.ok) throw new Error(`download ${url}: ${res.status} after ${tries} tries`);
    if (sha(b) !== f.sha256) throw new Error(`sha256 of ${f.path} is ${sha(b)}, pinned ${f.sha256}`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, b);
    out.sources.push({ path: f.path, url: res.url, bytes: b.length, downloaded: true });
  } else {
    const b = fs.readFileSync(p);
    if (sha(b) !== f.sha256) throw new Error(`sha256 of ${p} is ${sha(b)}, pinned ${f.sha256}`);
    out.sources.push({ path: f.path, bytes: b.length, downloaded: false });
  }
}

for (const prog of config.programs) {
  const t0 = performance.now();
  const web = fs.readFileSync(path.join(srcDir, prog.web), 'latin1');
  const tg = tangle(web, prog.changes.map((c) => ({ name: c, text: fs.readFileSync(path.join(trial, c), 'latin1') })));
  const t1 = performance.now();
  const cr = compile(tg.pascal, { realBytes: prog.realBytes });
  const t2 = performance.now();
  await WebAssembly.compile(cr.wasm);
  fs.writeFileSync(path.join(buildDir, `${prog.name}.p`), tg.pascal, 'latin1');
  fs.writeFileSync(path.join(buildDir, `${prog.name}.pool`), tg.pool, 'latin1');
  fs.writeFileSync(path.join(buildDir, `${prog.name}.wasm`), cr.wasm);
  fs.writeFileSync(path.join(buildDir, `${prog.name}.symbols.json`), JSON.stringify({ stackTop: cr.stackTop, pages: cr.pages, symbols: cr.symbols }));
  out.programs.push({
    name: prog.name, tangleMs: Math.round(t1 - t0), compileMs: Math.round(t2 - t1),
    modules: tg.stats.modules, poolStrings: tg.stats.strings, pascalBytes: tg.pascal.length,
    wasmBytes: cr.wasm.length,
    wasmGzip9: zlib.gzipSync(cr.wasm, { level: 9 }).length,
    wasmBrotli11: zlib.brotliCompressSync(cr.wasm, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    wasmSha256: sha(cr.wasm), memoryPages: cr.pages, procedures: cr.procCount,
  });
}
const lines = (files) => files.map((f) => ({ file: f, lines: fs.readFileSync(path.join(trial, f), 'utf8').split('\n').length - 1 }));
out.compilerLines = lines(config.compilerFiles);
out.runtimeLines = lines(config.runtimeFiles);
fs.writeFileSync(path.join(buildDir, 'build.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
