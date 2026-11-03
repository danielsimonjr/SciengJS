// Smoke test of the BUILT package. It packs the repository, installs the tarball in a fresh folder,
// and imports the package from there. It runs under Node only, so it uses only Node APIs.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

  writeFileSync(
    join(app, "check.mjs"),
    `import { capabilities, render, RenderError } from "@danielsimonjr/sciengjs";
import * as graph from "@danielsimonjr/sciengjs/graph";
import * as raster from "@danielsimonjr/sciengjs/raster";
import * as plot from "@danielsimonjr/sciengjs/plot";
if (typeof graph !== "object" || typeof raster !== "object" || typeof plot !== "object") throw new Error("a stage subpath did not load");
const caps = await capabilities({});
if (!Array.isArray(caps) || caps.length === 0) throw new Error("capabilities returned no pairs");
const svg = await render({ type: "dot", source: "digraph G { a -> b }", format: "svg" }, {});
if (!new TextDecoder().decode(svg.bytes).includes("<svg")) throw new Error("dot to svg returned no svg");
const png = await render({ type: "dot", source: "digraph G { a -> b }", format: "png" }, {});
if (png.bytes[0] !== 0x89 || png.bytes[1] !== 0x50 || png.bytes[2] !== 0x4e || png.bytes[3] !== 0x47) throw new Error("dot to png returned no PNG");
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
