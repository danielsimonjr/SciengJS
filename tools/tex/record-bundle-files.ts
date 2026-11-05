// Records which tree files a render of each sample reads. Run with Bun at the repository root:
//   bun tools/tex/record-bundle-files.ts <sources-dir> <build-dir> [sample names...]
// The tree holds every file of <sources>/texmf and <sources>/texmf-bundles. A name that is in two places keeps the first
// file of a sorted walk, and a second file with other bytes is an error. The tool prints one JSON object:
// { sample: [names read, sorted] }. The names go into the `include` lists of `bundles` in config.json.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderTex } from "../../src/tex/render.ts";
import { TexTree } from "../../src/tex/vfs.ts";
import { collectTree } from "./bundle-tree.mjs";

const [srcDir, buildDir, ...names] = process.argv.slice(2);
if (!srcDir || !buildDir) {
  console.error("usage: record-bundle-files.ts <sources-dir> <build-dir> [samples...]");
  process.exit(2);
}
const samples = names.length ? names : ["core", "diagrams", "science", "math"];
const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = collectTree([join(srcDir, "texmf"), join(srcDir, "texmf-bundles")]);
const tree = new TexTree();
for (const [name, p] of files) tree.add(name, () => new Uint8Array(readFileSync(p)));
const out = join(buildDir, "out");
const engine = {
  module: new WebAssembly.Module(readFileSync(join(out, "setprod.wasm"))),
  symbols: JSON.parse(readFileSync(join(out, "setprod.symbols.json"), "utf8")),
  pool: new Uint8Array(readFileSync(join(out, "setprod.pool"))),
};
const format = { name: "scieng.fmt", bytes: new Uint8Array(readFileSync(join(out, "fmt", "scieng.fmt"))) };
const result: Record<string, string[]> = {};
for (const s of samples) {
  tree.read.clear();
  const source = readFileSync(join(here, "samples", `${s}.tex`), "utf8");
  const r = await renderTex({ engine, format, tree, source, jobName: s, timeoutMs: 120000 });
  result[s] = [...tree.read].sort();
  const clash = result[s]!.filter((n) => files.conflicts.has(n));
  if (clash.length) throw new Error(`${s} reads names with two contents: ${clash.join(", ")}`);
  console.error(`${s}: ${result[s]!.length} files, ${r.glyphs} glyphs, missing ${JSON.stringify(r.missing)}, refused ${JSON.stringify(r.refused)}`);
}
console.log(JSON.stringify(result, null, 1));
void readdirSync;
void statSync;
