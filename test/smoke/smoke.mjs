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
// The smoke test checks the package with no browser stage, so a browser path of the caller does not reach the checks.
const env = { ...process.env };
delete env.SCIENG_BROWSER;

const work = mkdtempSync(join(tmpdir(), "sciengjs-smoke-"));

// On Windows npm is a .cmd file. Node starts .cmd files only through a shell. The shell gets one quoted command string.
function run(cmd, args, cwd, shell = false) {
  let r;
  if (shell) {
    const line = [cmd, ...args.map(shellArg)].join(" ");
    r = spawnSync(line, { cwd, encoding: "utf8", shell: true, env });
  } else {
    r = spawnSync(cmd, args, { cwd, encoding: "utf8", env });
  }
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with ${r.status}\n${r.stdout}\n${r.stderr}`);
  }
  return r.stdout;
}

function shellArg(arg) {
  if (/["%\r\n]/.test(arg)) {
    throw new Error("an argument cannot go through the shell: " + arg);
  }
  return '"' + arg + '"';
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
  const shippedMermaid = join(installedAssets, "mermaid.min.js");
  if (!existsSync(shippedMermaid)) throw new Error("the installed package has no assets/mermaid.min.js");
  const lockedMermaid = createRequire(join(repo, "package.json")).resolve("mermaid/dist/mermaid.min.js");
  if (!readFileSync(shippedMermaid).equals(readFileSync(lockedMermaid))) {
    throw new Error("the shipped assets/mermaid.min.js differs from the locked mermaid dist file");
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
import * as mermaid from "@danielsimonjr/sciengjs/mermaid";
if (typeof graph.dotToSvg !== "function" || typeof raster.svgToPng !== "function") throw new Error("a stage subpath did not load");
if (typeof mermaid.renderMermaidSvg !== "function" || typeof mermaid.layoutSequence !== "function") throw new Error("the mermaid subpath did not load");
const browser = await import("@danielsimonjr/sciengjs/browser");
if (typeof browser.CdpConnection !== "function" || typeof browser.renderHtmlPage !== "function") throw new Error("the browser subpath did not load");
const plot = await import("@danielsimonjr/sciengjs/plot");
if (typeof plot.bode !== "function" || typeof plot.rootLocus !== "function") throw new Error("the plot subpath did not load");
for (const empty of ["tex", "sysml", "mesh", "html"]) {
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
const mermaidSequence = "sequenceDiagram\\nAlice->>Bob: Hello Bob";
const mermaidSources = [["class", "classDiagram\\nclass Animal\\nAnimal <|-- Dog"], ["state", "stateDiagram-v2\\n[*] --> Still"], ["sequence", mermaidSequence]];
for (const [label, source] of mermaidSources) {
  const out = await render({ type: "mermaid", source, format: "svg" }, {});
  if (out.backend !== "mermaid/native") throw new Error("mermaid " + label + " did not use the mermaid backend");
  if (!new TextDecoder().decode(out.bytes).includes("<svg")) throw new Error("mermaid " + label + " to svg returned no svg");
}
const mermaidPng = await render({ type: "mermaid", source: mermaidSequence, format: "png" }, {});
if (mermaidPng.bytes[0] !== 0x89 || mermaidPng.bytes[1] !== 0x50 || mermaidPng.bytes[2] !== 0x4e || mermaidPng.bytes[3] !== 0x47) throw new Error("mermaid to png returned no PNG");
let flowCode = "none";
try {
  await render({ type: "mermaid", source: "flowchart LR\\nA --> B", format: "svg" }, {});
} catch (err) {
  if (!(err instanceof RenderError)) throw err;
  flowCode = err.code;
}
if (flowCode !== "E_STAGE_MISSING") throw new Error("expected E_STAGE_MISSING for a flowchart with no browser, got " + flowCode);
for (const [label, req] of [["dot to pdf", { type: "dot", source: "digraph G { a -> b }", format: "pdf" }], ["mermaid to pdf", { type: "mermaid", source: mermaidSequence, format: "pdf" }]]) {
  let pdfCode = "none";
  try {
    await render(req, {});
  } catch (err) {
    if (!(err instanceof RenderError)) throw err;
    pdfCode = err.code;
  }
  if (pdfCode !== "E_STAGE_MISSING") throw new Error(label + " with no browser must reject with E_STAGE_MISSING, got " + pdfCode);
}

const mathSource = "\\\\frac{a+b}{c-d} + \\\\ce{H2O}";
const mathSvg = await render({ type: "math", source: mathSource, format: "svg" }, {});
const mathSvgText = new TextDecoder().decode(mathSvg.bytes);
if (!mathSvgText.startsWith("<svg") || /<text[\\s>]|font-family/i.test(mathSvgText)) throw new Error("math to svg returned no standalone svg without a font reference");
const mathPng = await render({ type: "math", source: mathSource, format: "png" }, {});
if (mathPng.bytes[0] !== 0x89 || mathPng.bytes[1] !== 0x50 || mathPng.bytes[2] !== 0x4e || mathPng.bytes[3] !== 0x47) throw new Error("math to png returned no PNG");
let mathPdfCode = "none";
try {
  await render({ type: "math", source: mathSource, format: "pdf" }, {});
} catch (err) {
  if (!(err instanceof RenderError)) throw err;
  mathPdfCode = err.code;
}
if (mathPdfCode !== "E_STAGE_MISSING") throw new Error("math to pdf with no browser must reject with E_STAGE_MISSING, got " + mathPdfCode);
console.log("smoke ok: " + caps.length + " pairs; dot to svg " + svg.bytes.length + " bytes; dot to png " + png.bytes.length + " bytes; mermaid class, state and sequence to svg; mermaid sequence to png " + mermaidPng.bytes.length + " bytes; flowchart rejected with " + flowCode + "; math to svg " + mathSvg.bytes.length + " bytes; math to png " + mathPng.bytes.length + " bytes; math to pdf rejected with " + mathPdfCode);
`,
  );
  const out = run(process.execPath, ["check.mjs"], app);
  process.stdout.write(out);
} finally {
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
