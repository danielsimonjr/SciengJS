// Write the `include` lists of the bundles in config.json from the output of record-bundle-files.ts.
//   node set-bundle-includes.mjs <read.json> <sources-dir>
// core    = the files the core sample reads, plus every Computer Modern, LaTeX symbol and line font (the TFM file and
//           the PFB file) so that any text or math size has an outline.
// others  = the files that their own sample reads and the core sample does not read, plus the AMS font families of
//           the math bundle (msam, msbm, eufm, eusm and the other eu* fonts, TFM and PFB).
// Each name is a flat lower-case tree name. The tool fails when a name is missing in the tree.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectTree } from './bundle-tree.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.env.TEX_BUILD_CONFIG ? path.resolve(process.env.TEX_BUILD_CONFIG) : path.join(here, 'config.json');
const [readFile, srcDir] = process.argv.slice(2);
if (!readFile || !srcDir) {
  console.error('usage: set-bundle-includes.mjs <read.json> <sources-dir>');
  process.exit(2);
}
const read = JSON.parse(fs.readFileSync(readFile, 'utf8'));
const tree = collectTree([path.join(srcDir, 'texmf'), path.join(srcDir, 'texmf-bundles')]);
const fontsOf = (re) => {
  const out = [];
  for (const n of tree.keys()) {
    if (!n.endsWith('.pfb')) continue;
    const base = n.slice(0, -4);
    if (!re.test(base)) continue;
    out.push(n);
    if (tree.has(`${base}.tfm`)) out.push(`${base}.tfm`);
  }
  return out;
};
const core = new Set([...read.core, ...fontsOf(/^(cm|lasy|line|lcircle|lcmss)/)]);
const lists = {
  core,
  diagrams: new Set(read.diagrams),
  science: new Set(read.science),
  math: new Set([...read.math, ...fontsOf(/^(ms|eu)/)]),
};
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
for (const b of cfg.bundles.outputs) {
  const names = [...lists[b.name]].filter((n) => b.name === 'core' || !core.has(n)).sort();
  for (const n of names) if (!tree.has(n)) throw new Error(`bundle ${b.name}: no file ${n} in the tree`);
  b.include = names;
}
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
console.log(cfg.bundles.outputs.map((b) => `${b.name}: ${b.include.length} files`).join(', '));
