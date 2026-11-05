// Build the TeX bundles from the pinned archives and the TeX build.
//   node bundles.mjs fetch <sources-dir>
//       Download the bundlePackages of config.json (each sha256 is checked) and extract them into <sources>/texmf-bundles.
//   node bundles.mjs pack <sources-dir> <build-dir> <out-dir> [bundles.json]
//       Write one file per bundle into <out-dir> and the list of the bundles (name, file, sha256, bytes) into
//       bundles.json (default <out-dir>/bundles.json).
//
// Container (format SCTB1), the same bytes on every OS:
//   file    = "SCTB1\0\0\0" (8 bytes) + raw deflate (level 9, node:zlib) of the body
//   body    = u32 count, then count entries in sorted order of the UTF-8 name bytes
//   entry   = u16 name length, name (lower-case flat tree name), u32 size, the file bytes
//   All integers are little endian. The container holds no time stamp, no mode, no owner and no host path.
// The `engine` bundle also holds engine.wasm, engine.symbols.json, tex.pool and scieng.fmt of the TeX build.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchPinned, sha } from './build-lib.mjs';
import { collectTree } from './bundle-tree.mjs';

export const MAGIC = Buffer.from('SCTB1\0\0\0', 'latin1');
const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.env.TEX_BUILD_CONFIG ? path.resolve(process.env.TEX_BUILD_CONFIG) : path.join(here, 'config.json');

/**
 * Pack named files into one container.
 * @param {Map<string, Uint8Array>} files
 * @returns {Buffer}
 */
export function packBundle(files) {
  const names = [...files.keys()].map((n) => Buffer.from(n, 'utf8')).sort(Buffer.compare);
  const parts = [];
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  parts.push(u32(names.length));
  for (const nb of names) {
    const data = files.get(nb.toString('utf8'));
    const len = Buffer.alloc(2);
    len.writeUInt16LE(nb.length);
    parts.push(len, nb, u32(data.length), Buffer.from(data.buffer, data.byteOffset, data.length));
  }
  return Buffer.concat([MAGIC, zlib.deflateRawSync(Buffer.concat(parts), { level: 9 })]);
}

/**
 * Unpack a container.
 * @param {Uint8Array} bytes
 * @returns {Map<string, Uint8Array>}
 */
export function unpackBundle(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  if (!buf.subarray(0, 8).equals(MAGIC)) throw new Error('not an SCTB1 container');
  const body = zlib.inflateRawSync(buf.subarray(8));
  const out = new Map();
  let at = 4;
  for (let i = 0, n = body.readUInt32LE(0); i < n; i++) {
    const nl = body.readUInt16LE(at); at += 2;
    const name = body.toString('utf8', at, at + nl); at += nl;
    const size = body.readUInt32LE(at); at += 4;
    out.set(name, new Uint8Array(body.subarray(at, at + size))); at += size;
  }
  return out;
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'fetch' && args.length === 1) await fetchCmd(path.resolve(args[0]));
  else if (cmd === 'pack' && args.length >= 3) packCmd(path.resolve(args[0]), path.resolve(args[1]), path.resolve(args[2]), args[3] ? path.resolve(args[3]) : undefined);
  else {
    console.error('usage: bundles.mjs fetch <sources-dir> | pack <sources-dir> <build-dir> <out-dir> [bundles.json]');
    process.exit(2);
  }
}

async function fetchCmd(srcDir) {
  const archives = path.join(srcDir, 'archives');
  const dest = path.join(srcDir, 'texmf-bundles');
  fs.mkdirSync(dest, { recursive: true });
  for (const p of config.bundlePackages.files) {
    const a = path.join(archives, `${p.name}.tar.xz`);
    await fetchPinned({ url: `${config.bundlePackages.base}${p.name}.tar.xz`, sha256: p.sha256, dest: a, userAgent: config.userAgent });
    const stamp = path.join(dest, 'tlpkg', 'tlpobj', `${p.name}.tlpobj`);
    if (!fs.existsSync(stamp)) execFileSync('tar', ['-xJf', path.relative(dest, a).split(path.sep).join('/')], { cwd: dest, stdio: 'pipe' });
  }
  console.log(`fetched ${config.bundlePackages.files.length} archives into ${dest}`);
}

function packCmd(srcDir, buildDir, outDir, listFile) {
  const tree = collectTree([path.join(srcDir, 'texmf'), path.join(srcDir, 'texmf-bundles')]);
  const out = path.join(buildDir, 'out');
  const engineFiles = new Map([
    ['engine.wasm', path.join(out, 'setprod.wasm')],
    ['engine.symbols.json', path.join(out, 'setprod.symbols.json')],
    ['tex.pool', path.join(out, 'setprod.pool')],
    ['scieng.fmt', path.join(out, 'fmt', 'scieng.fmt')],
  ]);
  fs.mkdirSync(outDir, { recursive: true });
  const list = [];
  const seen = new Set();
  for (const b of config.bundles.outputs) {
    const files = new Map();
    if (b.engine) for (const [n, p] of engineFiles) files.set(n, fs.readFileSync(p));
    for (const n of b.include) {
      const p = tree.get(n);
      if (tree.conflicts.has(n)) throw new Error(`bundle ${b.name}: ${n} is in the tree with two different contents`);
      if (p === undefined) throw new Error(`bundle ${b.name}: no file ${n} in the tree`);
      if (files.has(n)) throw new Error(`bundle ${b.name}: ${n} twice`);
      files.set(n, fs.readFileSync(p));
    }
    if (b.name !== 'core') for (const n of files.keys()) if (seen.has(n) && config.bundles.outputs[0].include.includes(n)) throw new Error(`bundle ${b.name}: ${n} is in core`);
    for (const n of files.keys()) seen.add(n);
    const bytes = packBundle(files);
    fs.writeFileSync(path.join(outDir, b.file), bytes);
    list.push({ name: b.name, file: b.file, sha256: sha(bytes), bytes: bytes.length });
  }
  const target = listFile ?? path.join(outDir, 'bundles.json');
  fs.writeFileSync(target, JSON.stringify(list, null, 2) + '\n');
  console.log(JSON.stringify(list));
}
