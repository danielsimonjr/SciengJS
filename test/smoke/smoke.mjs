// Smoke test of the BUILT package. It packs the repository, installs the tarball in a fresh folder,
// and imports the package from there. It runs under Node only, so it uses only Node APIs.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const work = mkdtempSync(join(tmpdir(), "sciengjs-smoke-"));

function run(cmd, args, cwd, shell = false) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with ${r.status}\n${r.stdout}\n${r.stderr}`);
  }
  return r.stdout;
}

try {
  const packDir = join(work, "pack");
  mkdirSync(packDir);
  run(npm, ["pack", "--pack-destination", packDir, "--silent"], repo, process.platform === "win32");
  const tarball = readdirSync(packDir).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error("npm pack wrote no tarball");

  const app = join(work, "app");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "smoke-app", private: true, type: "module" }));
  run(npm, ["install", "--no-audit", "--no-fund", join(packDir, tarball)], app, process.platform === "win32");

  // The tarball must ship the resvg WASM file that the raster stage reads from the assets folder.
  const installedAssets = join(app, "node_modules", "@danielsimonjr", "sciengjs", "assets");
  const shippedWasm = join(installedAssets, "index_bg.wasm");
  if (!existsSync(shippedWasm)) throw new Error("the installed package has no assets/index_bg.wasm");
  const lockedWasm = createRequire(join(repo, "package.json")).resolve("@resvg/resvg-wasm/index_bg.wasm");
  if (!readFileSync(shippedWasm).equals(readFileSync(lockedWasm))) {
    throw new Error("the shipped assets/index_bg.wasm differs from the locked @resvg/resvg-wasm file");
  }
  // A folder with the bundled font and no WASM file: a render through the folder must reject with E_STAGE_MISSING.
  const noWasmFolder = join(app, "no-wasm-assets");
  mkdirSync(join(noWasmFolder, "fonts"), { recursive: true });
  copyFileSync(join(installedAssets, "fonts", "LiberationSerif-Regular.ttf"), join(noWasmFolder, "fonts", "LiberationSerif-Regular.ttf"));
  const noWasmUrl = pathToFileURL(noWasmFolder).href + "/";

  writeFileSync(
    join(app, "check.mjs"),
    `import { capabilities, render, RenderError } from "@danielsimonjr/sciengjs";
import * as graph from "@danielsimonjr/sciengjs/graph";
import * as raster from "@danielsimonjr/sciengjs/raster";
if (typeof graph.dotToSvg !== "function" || typeof raster.svgToPng !== "function") throw new Error("a stage subpath did not load");
for (const empty of ["mermaid", "math", "tex", "plot", "sysml", "mesh", "browser", "html"]) {
  let refused = false;
  try {
    await import("@danielsimonjr/sciengjs/" + empty);
  } catch (err) {
    refused = err && err.code === "ERR_PACKAGE_PATH_NOT_EXPORTED";
    if (!refused) throw err;
  }
  if (!refused) throw new Error("the subpath ./" + empty + " has no content and must not be exported");
}
const caps = await capabilities({});
if (!Array.isArray(caps) || caps.length === 0) throw new Error("capabilities returned no pairs");
const svg = await render({ type: "dot", source: "digraph G { a -> b }", format: "svg" }, {});
if (!new TextDecoder().decode(svg.bytes).includes("<svg")) throw new Error("dot to svg returned no svg");
const png = await render({ type: "dot", source: "digraph G { a -> b }", format: "png" }, {});
if (png.bytes[0] !== 0x89 || png.bytes[1] !== 0x50 || png.bytes[2] !== 0x4e || png.bytes[3] !== 0x47) throw new Error("dot to png returned no PNG");
let missingCode = "none";
let missingMessage = "";
try {
  await render({ type: "dot", source: "digraph G { a -> b }", format: "png" }, { assetsUrl: ${JSON.stringify(noWasmUrl)} });
} catch (err) {
  if (!(err instanceof RenderError)) throw err;
  missingCode = err.code;
  missingMessage = err.message;
}
if (missingCode !== "E_STAGE_MISSING" || !missingMessage.includes("index_bg.wasm")) {
  throw new Error("a missing WASM file under assetsUrl must reject with E_STAGE_MISSING naming index_bg.wasm, got " + missingCode + ": " + missingMessage);
}
let code = "none";
try {
  await render({ type: "math", source: "x", format: "svg" }, {});
} catch (err) {
  if (!(err instanceof RenderError)) throw err;
  code = err.code;
}
if (code !== "E_UNSUPPORTED") throw new Error("expected E_UNSUPPORTED for a pair with no backend, got " + code);
console.log("smoke ok: " + caps.length + " pairs; dot to svg " + svg.bytes.length + " bytes; dot to png " + png.bytes.length + " bytes; math to svg rejected with " + code);
`,
  );
  const out = run(process.execPath, ["check.mjs"], app);
  process.stdout.write(out);
} finally {
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
