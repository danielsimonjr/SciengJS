// The steps of a build that T5 and T6 share: a pinned download and one program build.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { tangle } from './tangle.mjs';
import { compile } from './pascal.mjs';

/** @param {Uint8Array} b @returns {string} the sha256 of the bytes, in hex */
export const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

/**
 * Get one pinned file. When the file exists, check its sha256; else download it.
 * A mirror can refuse a request, so the download tries again up to `tries` times.
 * @param {{ url: string, sha256: string, dest: string, userAgent: string, tries?: number }} f
 * @returns {Promise<{ bytes: number, url?: string, downloaded: boolean }>}
 */
export async function fetchPinned({ url, sha256, dest, userAgent, tries: maxTries = 6 }) {
  if (fs.existsSync(dest)) {
    const b = fs.readFileSync(dest);
    if (sha(b) !== sha256) throw new Error(`sha256 of ${dest} is ${sha(b)}, pinned ${sha256}`);
    return { bytes: b.length, downloaded: false };
  }
  let res, b, tries = 0;
  for (;;) {
    tries++;
    try {
      res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': userAgent } });
      if (res.ok) { b = new Uint8Array(await res.arrayBuffer()); if (sha(b) === sha256) break; }
    } catch (e) {
      res = { ok: false, status: e.cause?.code ?? e.message };
    }
    if (tries >= maxTries) break;
    await new Promise((ok) => setTimeout(ok, 1000 * tries));
  }
  if (!res.ok) throw new Error(`download ${url}: ${res.status} after ${tries} tries`);
  if (sha(b) !== sha256) throw new Error(`sha256 of ${url} is ${sha(b)}, pinned ${sha256}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, b);
  return { bytes: b.length, url: res.url, downloaded: true };
}

/**
 * Tangle a WEB file with its change files, compile the Pascal to WASM, and write
 * <name>.p, .pool, .wasm and .symbols.json into the build dir.
 * @param {{ name: string, web: string, changes: { name: string, text: string }[], realBytes: number, buildDir: string }} p
 * @returns {Promise<object>} the sizes and times of the program
 */
export async function buildProgram({ name, web, changes, realBytes, buildDir }) {
  const t0 = performance.now();
  const tg = tangle(web, changes);
  const t1 = performance.now();
  const cr = compile(tg.pascal, { realBytes });
  const t2 = performance.now();
  await WebAssembly.compile(cr.wasm);
  fs.writeFileSync(path.join(buildDir, `${name}.p`), tg.pascal, 'latin1');
  fs.writeFileSync(path.join(buildDir, `${name}.pool`), tg.pool, 'latin1');
  fs.writeFileSync(path.join(buildDir, `${name}.wasm`), cr.wasm);
  fs.writeFileSync(path.join(buildDir, `${name}.symbols.json`), JSON.stringify({ stackTop: cr.stackTop, pages: cr.pages, symbols: cr.symbols }));
  return {
    name, tangleMs: Math.round(t1 - t0), compileMs: Math.round(t2 - t1),
    modules: tg.stats.modules, poolStrings: tg.stats.strings, pascalBytes: tg.pascal.length,
    wasmBytes: cr.wasm.length,
    wasmGzip9: zlib.gzipSync(cr.wasm, { level: 9 }).length,
    wasmBrotli11: zlib.brotliCompressSync(cr.wasm, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    wasmSha256: sha(cr.wasm), memoryPages: cr.pages, procedures: cr.procCount,
  };
}

/** @returns {string} the name and version of the JavaScript runtime */
export const runtimeName = () => (typeof Bun !== 'undefined' ? `bun ${Bun.version}` : `node ${process.versions.node}`);
