// Runs under Node 22 against the BUILT package (dist/). It proves that a render worker starts when the parent
// carries flags that a worker rejects: the expanded defaults of `node --test`, and `--stack-trace-limit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "fixtures", "render-under-node-test.fixture.mjs");
const indexUrl = pathToFileURL(join(here, "..", "..", "dist", "index.js")).href;

/**
 * The environment of a child run. `node --test` sets NODE_TEST_CONTEXT in the test files it starts. A child
 * with that variable reports to its parent and does not run as a top-level `node --test`, so the variable is removed.
 */
function childEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

test("a render under node --test exits 0", () => {
  const run = spawnSync(process.execPath, ["--test", fixture], { encoding: "utf8", timeout: 120000, env: childEnv() });
  assert.equal(run.status, 0, `exit ${run.status}: ${run.stdout}\n${run.stderr}`);
});

test("node --input-type=module --stack-trace-limit=10 -e renders through the worker", () => {
  const code = `import {render} from ${JSON.stringify(indexUrl)}; const out = await render({type:'dot',source:'digraph{a->b}',format:'svg'}); console.log('RENDERED ' + new TextDecoder().decode(out.bytes).includes('<svg'));`;
  const run = spawnSync(process.execPath, ["--input-type=module", "--stack-trace-limit=10", "-e", code], { encoding: "utf8", timeout: 120000, env: childEnv() });
  assert.equal(run.status, 0, `exit ${run.status}: ${run.stderr}`);
  assert.match(run.stdout, /RENDERED true/);
});
