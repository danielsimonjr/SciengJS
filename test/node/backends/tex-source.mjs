// Test-only backend, loaded by path under Node. It renders the request source with the TeX build of
// SCIENG_TEX_BUILD_DIR (the layout is described in test/support/tex-engine.ts). It is not in the published registry.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderTex } from "../../../dist/tex/render.js";
import { TexTree } from "../../../dist/tex/vfs.js";

function addFolder(tree, dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) addFolder(tree, p);
    else tree.add(e.name, () => new Uint8Array(readFileSync(p)));
  }
}

export async function render(request) {
  const dir = process.env.SCIENG_TEX_BUILD_DIR;
  const tree = new TexTree();
  addFolder(tree, join(dir, "src", "texmf", "tex"));
  addFolder(tree, join(dir, "src", "texmf", "fonts"));
  const out = join(dir, "out");
  const result = await renderTex({
    engine: {
      module: new WebAssembly.Module(readFileSync(join(out, "setprod.wasm"))),
      symbols: JSON.parse(readFileSync(join(out, "setprod.symbols.json"), "utf8")),
      pool: new Uint8Array(readFileSync(join(out, "setprod.pool"))),
    },
    format: { name: "scieng.fmt", bytes: new Uint8Array(readFileSync(join(out, "fmt", "scieng.fmt"))) },
    tree,
    source: request.source,
    jobName: "job",
    timeoutMs: request.settings.timeoutMs,
  });
  return { bytes: new TextEncoder().encode(result.svg), warnings: [] };
}
