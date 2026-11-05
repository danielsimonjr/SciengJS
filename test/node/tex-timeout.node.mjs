// Runs under Node against the BUILT package (dist/). It proves that the render worker ends a TeX run that loops
// without any file call: `\def\a{\a}\a` gives the host no chance to read the clock. It needs a TeX engine build
// in SCIENG_TEX_BUILD_DIR (layout in test/support/tex-engine.ts) and skips with a printed reason without one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { runInWorker } from "../../dist/worker/run.js";

const here = dirname(fileURLToPath(import.meta.url));
const dir = process.env.SCIENG_TEX_BUILD_DIR;
const skip = dir ? false : "SCIENG_TEX_BUILD_DIR is not set";
if (skip) console.log(`SKIP test/node/tex-timeout.node.mjs: ${skip}`);
const moduleUrl = pathToFileURL(join(here, "backends", "tex-source.mjs")).href;
const doc = (body) => `\\documentclass{standalone}\n\\begin{document}\n${body}\n\\end{document}\n`;

function job(source, timeoutMs) {
  return {
    moduleUrl,
    backend: "test/tex-source",
    request: { type: "tikz", format: "svg", source, options: {}, settings: { timeoutMs } },
  };
}

test("an infinite expansion loop rejects with E_TIMEOUT inside timeoutMs plus one second", { skip }, async () => {
  const timeoutMs = 2000;
  const start = performance.now();
  await assert.rejects(runInWorker(job(doc("\\def\\a{\\a}\\a"), timeoutMs), { timeoutMs, maxMemoryMb: 2048 }), (err) => {
    assert.equal(err.code, "E_TIMEOUT");
    return true;
  });
  const elapsed = performance.now() - start;
  assert.ok(elapsed < timeoutMs + 1000, `took ${elapsed} ms`);
});

test("a loop with file calls rejects with E_TIMEOUT from the host clock", { skip }, async () => {
  const timeoutMs = 1500;
  await assert.rejects(runInWorker(job(doc("\\def\\a{\\immediate\\write16{x}\\a}\\a"), timeoutMs), { timeoutMs, maxMemoryMb: 2048 }), (err) => {
    assert.equal(err.code, "E_TIMEOUT");
    return true;
  });
});

test("the circuit renders in the worker", { skip }, async () => {
  const source = (await import("node:fs")).readFileSync(join(here, "..", "..", "trials", "t6-etex-build", "samples", "circuit.tex"), "utf8");
  const out = await runInWorker(job(source, 60000), { timeoutMs: 60000, maxMemoryMb: 2048 });
  assert.match(new TextDecoder().decode(out.bytes), /<svg/);
});
