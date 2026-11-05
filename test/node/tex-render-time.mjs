// The render-time gate of the tikz type. It runs under Node and under Bun against the BUILT package (dist/).
// It renders the circuit of the corpus once (first render), then `warmRuns` more times, and compares the median
// of the warm renders with the budget of this runtime: the warm TeX and SVG medians that the T6 build measured,
// times (1 + marginRatio), plus marginMs. The budget file holds all numbers and the reasons for the margin.
//   SCIENG_TEX_BUNDLE_DIR    folder of the packed bundles (without it the gate skips with a printed reason)
//   SCIENG_TEX_BUDGET_FILE   budget file (default test/support/tex-render-budget.json)
//   SCIENG_TEX_TIME_REPORT   when set to 1, print the timings and do not compare (used to measure the variance)
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { render } from "../../dist/index.js";
import { TexTree, detectBundles, findBundle, loadBundleBytes, renderTex, unpackBundle, wrapSource } from "../../dist/tex/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const bundleDir = process.env.SCIENG_TEX_BUNDLE_DIR;
if (!bundleDir) {
  console.log("SKIP test/node/tex-render-time.mjs: SCIENG_TEX_BUNDLE_DIR is not set. It names the folder that `node tools/tex/bundles.mjs pack` wrote.");
  process.exit(0);
}
const budgetFile = resolve(process.env.SCIENG_TEX_BUDGET_FILE ?? join(here, "..", "support", "tex-render-budget.json"));
const budget = JSON.parse(readFileSync(budgetFile, "utf8"));
const runtime = process.versions.bun ? "bun" : "node";
const key = `${process.platform}-${runtime}`;
const row = budget.runtimes[key];
const report = process.env.SCIENG_TEX_TIME_REPORT === "1";
if (!row && !report) {
  console.error(`FAIL: ${budgetFile} has no row for ${key}. Add the T6 numbers of this runtime to the file.`);
  process.exit(1);
}

const source = readFileSync(join(here, "..", "corpus", "tikz", budget.sample), "utf8");
const cache = mkdtempSync(join(tmpdir(), "scieng-time-cache-"));
const cfg = { cacheDir: cache, texBundleUrl: pathToFileURL(bundleDir).href + "/", allowNetwork: "tex-bundles", timeoutMs: 120000 };

const bundleSettings = { cacheDir: cache, texBundleUrl: cfg.texBundleUrl, allowNetwork: "tex-bundles", timeoutMs: 120000 };
const ENGINE_FILES = new Set(["engine.wasm", "engine.symbols.json", "tex.pool", "scieng.fmt"]);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

let texTimes = [];
let svgTimes = [];
const endToEnd = [];
try {
  // The engine layer: the same calls as src/tex/stage.ts, with the core bundle loaded once. texMs and svgMs are the T6 measure.
  const files = unpackBundle(await loadBundleBytes(findBundle("core"), bundleSettings));
  const tree = new TexTree();
  for (const [name, bytes] of files) if (!ENGINE_FILES.has(name)) tree.add(name, bytes);
  const engine = {
    module: await WebAssembly.compile(files.get("engine.wasm")),
    symbols: JSON.parse(new TextDecoder().decode(files.get("engine.symbols.json"))),
    pool: files.get("tex.pool"),
  };
  const format = { name: "scieng.fmt", bytes: files.get("scieng.fmt") };
  const wrapped = wrapSource(source, detectBundles(source).packages);
  for (let i = 0; i < 1 + budget.warmRuns; i++) {
    const r = await renderTex({ engine, format, tree: tree.fork(), source: wrapped, jobName: "job", timeoutMs: 120000 });
    texTimes.push(r.texMs);
    svgTimes.push(r.svgMs);
  }
  // The public layer: render() end to end. Printed for the record; the gate does not compare it.
  for (let i = 0; i < 4; i++) {
    const t = performance.now();
    await render({ type: "tikz", format: "svg", source }, cfg);
    endToEnd.push(performance.now() - t);
  }
} finally {
  rmSync(cache, { recursive: true, force: true });
}
const firstTex = texTimes[0];
texTimes = texTimes.slice(1);
svgTimes = svgTimes.slice(1);
const texMedian = median(texTimes);
const svgMedian = median(svgTimes);
const line = `tex render time (${key}, ${process.versions.node}): first TeX ${firstTex.toFixed(1)} ms, warm TeX median ${texMedian.toFixed(1)} ms (min ${Math.min(...texTimes).toFixed(1)}, max ${Math.max(...texTimes).toFixed(1)}), warm SVG median ${svgMedian.toFixed(1)} ms; render() end to end ${endToEnd.map((x) => x.toFixed(0)).join("/")} ms`;
console.log(line);
if (report) process.exit(0);

const limit = (name, t6) => t6 * (1 + budget.marginRatio) + budget.marginMs;
const texLimit = limit("tex", row.warmTexMs);
const svgLimit = limit("svg", row.warmSvgMs);
console.log(`budget TeX ${texLimit.toFixed(1)} ms = ${row.warmTexMs} * ${1 + budget.marginRatio} + ${budget.marginMs}; SVG ${svgLimit.toFixed(1)} ms`);
let failed = false;
if (texMedian > texLimit) { console.error(`FAIL: the warm TeX median ${texMedian.toFixed(1)} ms is over the budget ${texLimit.toFixed(1)} ms.`); failed = true; }
if (svgMedian > svgLimit) { console.error(`FAIL: the warm SVG median ${svgMedian.toFixed(1)} ms is over the budget ${svgLimit.toFixed(1)} ms.`); failed = true; }
if (failed) process.exit(1);
console.log("PASS");
