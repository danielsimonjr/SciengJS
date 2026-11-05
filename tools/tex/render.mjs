// Render a sample with the large build and a format, then DVI to SVG; measure the times.
// node render.mjs <build-dir> <format-file> <sample.tex> <font-dir> <out-dir> <repeats> [root folders...]
// The font dir holds the TFM and PFB files; the roots hold the other input files.
// Environment: TEX_PROGRAM gives the program name of the build dir (default texprod).
// The \special commands of the DVI file go through createSpecials() of src/tex/specials.ts.
import fs from 'node:fs';
import path from 'node:path';
import { runProgram } from '../../src/tex/run.ts';
import { dviToSvg } from '../../src/tex/dvi.ts';
import { createSpecials, SPECIAL_UNIT_PER_PT } from '../../src/tex/specials.ts';
import { flatKey, treeFromRoots } from './tree.mjs';

const program = process.env.TEX_PROGRAM || 'texprod';

const [buildDir, fmtFile, sample, fontDir, outDir, repeatsArg, ...roots] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: render.mjs <build-dir> <format-file> <sample.tex> <font-dir> <out-dir> <repeats> [roots...]');
  process.exit(2);
}
const repeats = Number(repeatsArg ?? 10);
fs.mkdirSync(outDir, { recursive: true });
const t0 = performance.now();
const module = await WebAssembly.compile(fs.readFileSync(path.join(buildDir, `${program}.wasm`)));
const wasmCompileMs = performance.now() - t0;
const symbols = JSON.parse(fs.readFileSync(path.join(buildDir, `${program}.symbols.json`), 'utf8'));
const pool = new Uint8Array(fs.readFileSync(path.join(buildDir, `${program}.pool`)));
const fmtName = path.basename(fmtFile).toLowerCase();
const fmt = new Uint8Array(fs.readFileSync(fmtFile));
const job = path.basename(sample, '.tex').toLowerCase();
const src = new Uint8Array(fs.readFileSync(sample));
const fontFs = treeFromRoots([fontDir]).tree;
const fontFiles = (name) => {
  const tfm = fontFs.get(`${name}.tfm`), pfb = fontFs.get(`${name}.pfb`);
  return tfm ? { tfm, pfb: pfb ?? null } : null;
};

const one = async () => {
  const vfs = treeFromRoots([fontDir, ...roots]).tree;
  vfs.put('tex.pool', pool);
  vfs.put(fmtName, fmt);
  vfs.put(`${job}.tex`, src);
  const a = performance.now();
  const r = await runProgram({
    module, symbols, files: vfs, terminal: [`&${fmtName.replace(/\.fmt$/, '')} ${job}`], nameKey: flatKey,
  });
  const texMs = performance.now() - a;
  const dvi = vfs.written.get(`${job}.dvi`);
  if (!dvi) throw new Error(`no DVI; terminal:\n${r.terminal}`);
  const b = performance.now();
  const sp = createSpecials();
  const svg = dviToSvg(dvi, fontFiles, { special: sp.special, unitPerPt: SPECIAL_UNIT_PER_PT });
  const svgMs = performance.now() - b;
  return { texMs, svgMs, svg, dvi, log: vfs.written.get(`${job}.log`), terminal: r.terminal, ignoredSpecials: sp.ignored() };
};

const first = await one();
const warm = [];
for (let i = 0; i < repeats; i++) warm.push(await one());
const median = (xs) => { const a = [...xs].sort((p, q) => p - q); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const svgText = first.svg.svg;
fs.writeFileSync(path.join(outDir, `${job}.svg`), svgText);
fs.writeFileSync(path.join(outDir, `${job}.dvi`), first.dvi);
if (first.log) fs.writeFileSync(path.join(outDir, `${job}.log`), first.log);
const count = (re) => (svgText.match(re) ?? []).length;
const result = {
  sample: job,
  runtime: typeof Bun !== 'undefined' ? `bun ${Bun.version}` : `node ${process.versions.node}`,
  platform: process.platform, arch: process.arch,
  wasmCompileMs: +wasmCompileMs.toFixed(1),
  firstTexMs: +first.texMs.toFixed(1), firstSvgMs: +first.svgMs.toFixed(1),
  warmTexMedianMs: +median(warm.map((w) => w.texMs)).toFixed(1), warmSvgMedianMs: +median(warm.map((w) => w.svgMs)).toFixed(1),
  repeats,
  glyphCheck: {
    glyphPaths: first.svg.glyphs, rules: first.svg.rules, pathElements: count(/<path\b/g),
    textElements: count(/<text\b/g), fontFamily: count(/font-family/g), missing: first.svg.missing, fonts: first.svg.fonts,
  },
  specials: first.svg.specials,
  ...(first.ignoredSpecials ? { ignoredSpecials: first.ignoredSpecials } : {}),
  sameSvgEveryRun: warm.every((w) => w.svg.svg === svgText),
};
fs.writeFileSync(path.join(outDir, `render-${job}.json`), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result));
// the glyph check fails when a glyph has no outline or when the SVG holds text
if (result.glyphCheck.missing.length || result.glyphCheck.textElements || !result.sameSvgEveryRun) process.exitCode = 1;
