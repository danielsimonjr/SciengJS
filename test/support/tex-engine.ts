/**
 * Loads a TeX build for the tests that need the real engine. The folder in `SCIENG_TEX_BUILD_DIR` holds:
 * `out/setprod.wasm`, `out/setprod.symbols.json`, `out/setprod.pool` (the engine build),
 * `fmt/scieng.fmt` (the format), and `src/texmf/tex` and `src/texmf/fonts` (the macro, TFM and PFB files).
 * A test that needs the build skips with a printed reason when the variable is not set.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TexEngine } from "../../src/tex/render.ts";
import { TexTree } from "../../src/tex/vfs.ts";

/** The name of the environment variable that gives the build folder. */
export const BUILD_DIR_VAR = "SCIENG_TEX_BUILD_DIR";

/** A loaded build. */
export interface TexBuild {
  engine: TexEngine;
  format: { name: string; bytes: Uint8Array };
  /** A tree with the macro, TFM and PFB files. Files read on first use. */
  tree: TexTree;
}

function addFolder(tree: TexTree, dir: string): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) addFolder(tree, p);
    else tree.add(e.name, () => new Uint8Array(readFileSync(p)));
  }
}

/** Loads the build in the folder. */
export function loadTexBuild(dir: string): TexBuild {
  const out = join(dir, "out");
  const tree = new TexTree();
  addFolder(tree, join(dir, "src", "texmf", "tex"));
  addFolder(tree, join(dir, "src", "texmf", "fonts"));
  return {
    engine: {
      module: new WebAssembly.Module(readFileSync(join(out, "setprod.wasm"))),
      symbols: JSON.parse(readFileSync(join(out, "setprod.symbols.json"), "utf8")),
      pool: new Uint8Array(readFileSync(join(out, "setprod.pool"))),
    },
    format: { name: "scieng.fmt", bytes: new Uint8Array(readFileSync(join(dir, "fmt", "scieng.fmt"))) },
    tree,
  };
}

/** The build of the environment variable, or `undefined` with a printed reason when the variable is not set. */
export function texBuildOrSkip(testFile: string): TexBuild | undefined {
  const dir = process.env[BUILD_DIR_VAR];
  if (dir === undefined || dir === "") {
    console.log(`SKIP ${testFile}: ${BUILD_DIR_VAR} is not set. It names the folder of a TeX engine build (see test/support/tex-engine.ts).`);
    return undefined;
  }
  return loadTexBuild(dir);
}
