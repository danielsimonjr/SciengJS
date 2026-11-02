// Runs under Node 22 against the BUILT package (dist/). It proves the worker path of the release runtime.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { runInWorker } from "../../dist/worker/run.js";

const here = dirname(fileURLToPath(import.meta.url));
const backend = (name) => pathToFileURL(join(here, "backends", `${name}.mjs`)).href;

function job(name, source) {
  return { moduleUrl: backend(name), backend: `test/${name}`, request: { type: "dot", format: "svg", source, options: {} } };
}

async function rejection(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("expected a rejection");
}

test("the built worker renders through a backend file", async () => {
  const out = await runInWorker(job("ok", "digraph {}"), { timeoutMs: 10000, maxMemoryMb: 256 });
  assert.match(new TextDecoder().decode(out.bytes), /<svg/);
});

test("a looping backend rejects with E_TIMEOUT inside timeoutMs plus one second", async () => {
  const timeoutMs = 500;
  const start = performance.now();
  const err = await rejection(runInWorker(job("loop", "loop"), { timeoutMs, maxMemoryMb: 256 }));
  const elapsed = performance.now() - start;
  assert.equal(err.code, "E_TIMEOUT");
  assert.ok(elapsed < timeoutMs + 1000, `took ${elapsed} ms`);
});

test("a heap-exhausting backend rejects with E_LIMIT, and the next render still works", async () => {
  // ERR_WORKER_OUT_OF_MEMORY maps to E_LIMIT: the heap limit is a resource limit of the source.
  const err = await rejection(runInWorker(job("heap", "heap"), { timeoutMs: 20000, maxMemoryMb: 16 }));
  assert.equal(err.code, "E_LIMIT");
  assert.match(err.message, /16 MB/);
  const out = await runInWorker(job("ok", "again"), { timeoutMs: 10000, maxMemoryMb: 256 });
  assert.match(new TextDecoder().decode(out.bytes), /<svg/);
});
