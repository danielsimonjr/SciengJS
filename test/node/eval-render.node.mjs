// Runs under Node 22 against the BUILT package (dist/). It proves that a render from `node -e` works.
// The render worker must not inherit the loader flags of the parent (`--input-type`, `-e`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const indexUrl = pathToFileURL(join(here, "..", "..", "dist", "index.js")).href;

test("node --input-type=module -e renders a dot graph through the worker", () => {
  const code = `import {render} from ${JSON.stringify(indexUrl)}; const out = await render({type:'dot',source:'digraph{a->b}',format:'svg'}); console.log('RENDERED ' + new TextDecoder().decode(out.bytes).includes('<svg'));`;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 60000 });
  assert.equal(run.status, 0, `exit ${run.status}: ${run.stderr}`);
  assert.match(run.stdout, /RENDERED true/);
});
