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
  // The tarball must ship the six pinned Three.js files that the viewer page and the png render need.
  const threeFiles = {
    "three.module.js": "build/three.module.js",
    "three.core.js": "build/three.core.js",
    "three.OrbitControls.js": "examples/jsm/controls/OrbitControls.js",
    "three.GLTFLoader.js": "examples/jsm/loaders/GLTFLoader.js",
    "three.BufferGeometryUtils.js": "examples/jsm/utils/BufferGeometryUtils.js",
    "three.SkeletonUtils.js": "examples/jsm/utils/SkeletonUtils.js",
  };
  for (const [shipped, inPackage] of Object.entries(threeFiles)) {
    const shippedFile = join(installedAssets, shipped);
    if (!existsSync(shippedFile)) throw new Error("the installed package has no assets/" + shipped);
    if (!readFileSync(shippedFile).equals(readFileSync(join(repo, "node_modules", "three", inPackage)))) {
      throw new Error("the shipped assets/" + shipped + " differs from the locked three file");
    }
  }
  // A folder with the bundled font and no WASM file: a render through the folder must reject with E_STAGE_MISSING.
  const noWasmFolder = join(app, "no-wasm-assets");
  mkdirSync(join(noWasmFolder, "fonts"), { recursive: true });
  copyFileSync(join(installedAssets, "fonts", "LiberationSerif-Regular.ttf"), join(noWasmFolder, "fonts", "LiberationSerif-Regular.ttf"));
  const noWasmUrl = pathToFileURL(noWasmFolder).href + "/";

  // The mesh check reads a BREP sample of the corpus. The tarball does not hold the corpus, so the sample goes into the app folder.
  copyFileSync(join(repo, "test", "corpus", "mesh", "cylinder1.brep"), join(app, "cylinder1.brep"));
  writeFileSync(
    join(app, "check.mjs"),
    `import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { capabilities, render, RenderError } from "@danielsimonjr/sciengjs";
import * as graph from "@danielsimonjr/sciengjs/graph";
import * as raster from "@danielsimonjr/sciengjs/raster";
import * as mermaid from "@danielsimonjr/sciengjs/mermaid";
if (typeof graph.dotToSvg !== "function" || typeof raster.svgToPng !== "function") throw new Error("a stage subpath did not load");
if (typeof mermaid.renderMermaidSvg !== "function" || typeof mermaid.layoutSequence !== "function") throw new Error("the mermaid subpath did not load");
const browser = await import("@danielsimonjr/sciengjs/browser");
if (typeof browser.CdpConnection !== "function" || typeof browser.renderHtmlPage !== "function") throw new Error("the browser subpath did not load");
const plot = await import("@danielsimonjr/sciengjs/plot");
if (typeof plot.bode !== "function" || typeof plot.rootLocus !== "function") throw new Error("the plot subpath did not load");
const mesh = await import("@danielsimonjr/sciengjs/mesh");
if (typeof mesh.readCad !== "function" || typeof mesh.writeGlb !== "function") throw new Error("the mesh subpath did not load");
const brep = new Uint8Array(readFileSync(new URL("./cylinder1.brep", import.meta.url)));
const glb = await render({ type: "brep", source: brep, format: "glb" }, {});
const glbView = new DataView(glb.bytes.buffer, glb.bytes.byteOffset, glb.bytes.byteLength);
if (glb.mime !== "model/gltf-binary" || glbView.getUint32(0, true) !== 0x46546c67 || glbView.getUint32(8, true) !== glb.bytes.byteLength) throw new Error("brep to glb returned no glTF binary");
const viewer = await render({ type: "brep", source: brep, format: "html" }, {});
const viewerText = new TextDecoder().decode(viewer.bytes);
if (!viewerText.includes('<script type="importmap">') || !viewerText.includes("https://cdn.jsdelivr.net/npm/three@") || !viewerText.includes("GLB_BASE64")) throw new Error("brep to html returned no viewer page");
const cadSource = JSON.stringify({ version: 1, model: { type: "difference", children: [{ type: "cube", size: 2, center: true }, { type: "sphere", radius: 1.2 }] } });
const stl = await render({ type: "cad", source: cadSource, format: "stl" }, {});
const stlFacets = new DataView(stl.bytes.buffer, stl.bytes.byteOffset, stl.bytes.byteLength).getUint32(80, true);
if (stlFacets === 0 || stl.bytes.byteLength !== 84 + 50 * stlFacets) throw new Error("cad to stl returned no binary STL");
const cadGlb = await render({ type: "cad", source: cadSource, format: "glb" }, {});
if (cadGlb.mime !== "model/gltf-binary") throw new Error("cad to glb returned no glTF binary");
const cad3mf = await render({ type: "cad", source: cadSource, format: "3mf" }, {});
const cad3mfModel = new TextDecoder().decode(cad3mf.bytes);
const cadDxf = await render({ type: "cad", source: cadSource, format: "dxf" }, {});
if (cadDxf.mime !== "image/vnd.dxf" || !new TextDecoder().decode(cadDxf.bytes).includes("POLYLINE")) throw new Error("cad to dxf returned no DXF drawing");
const cadDfm = await render({ type: "cad", source: cadSource, format: "md" }, {});
if (!new TextDecoder().decode(cadDfm.bytes).startsWith("# Design for manufacture")) throw new Error("cad to md returned no report of the design for manufacture");
if (cad3mf.mime !== "model/3mf" || cad3mf.bytes[0] !== 0x50 || cad3mf.bytes[1] !== 0x4b || !cad3mfModel.includes('unit="millimeter"')) throw new Error("cad to 3mf returned no 3MF package");
const html = await import("@danielsimonjr/sciengjs/html");
if (typeof html.htmlToMarkdown !== "function" || html.htmlToMarkdown("<h1>T</h1>").trim() !== "# T") throw new Error("the html subpath did not load");
const md = await render({ type: "html", source: "<p>a <b>b</b></p>", format: "md" }, {});
if (new TextDecoder().decode(md.bytes).trim() !== "a **b**") throw new Error("html to md returned the wrong markdown");
const sysml = await import("@danielsimonjr/sciengjs/sysml");
if (typeof sysml.parseSysml !== "function" || typeof sysml.sysmlToDot !== "function") throw new Error("the sysml subpath did not load");
const sysmlSvg = await render({ type: "sysml", source: "part def A { part b : B; } part def B;", format: "svg" }, {});
if (!new TextDecoder().decode(sysmlSvg.bytes).includes("<svg")) throw new Error("sysml to svg returned no svg");
const tex = await import("@danielsimonjr/sciengjs/tex");
if (!Array.isArray(tex.BUNDLES) || tex.BUNDLES.length !== 4 || typeof tex.detectBundles !== "function") throw new Error("the tex subpath did not load with its bundle list");
let texLine = "tex subpath loads; tikz render not run (SCIENG_TEX_BUNDLE_DIR is not set)";
if (process.env.SCIENG_TEX_BUNDLE_DIR) {
  const texCache = fileURLToPath(new URL("./tex-cache/", import.meta.url));
  const picture = await render({ type: "tikz", source: "\\\\begin{tikzpicture}\\\\draw (0,0) -- (1,1);\\\\end{tikzpicture}", format: "svg" }, { cacheDir: texCache, texBundleUrl: pathToFileURL(process.env.SCIENG_TEX_BUNDLE_DIR).href + "/", allowNetwork: "tex-bundles", timeoutMs: 120000 });
  if (!new TextDecoder().decode(picture.bytes).includes("<path")) throw new Error("tikz to svg returned no path");
  texLine = "tikz to svg " + picture.bytes.length + " bytes through the bundles of SCIENG_TEX_BUNDLE_DIR";
}
console.log(texLine);
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
console.log("smoke ok: " + caps.length + " pairs; dot to svg " + svg.bytes.length + " bytes; dot to png " + png.bytes.length + " bytes; mermaid class, state and sequence to svg; mermaid sequence to png " + mermaidPng.bytes.length + " bytes; flowchart rejected with " + flowCode + "; math to svg " + mathSvg.bytes.length + " bytes; math to png " + mathPng.bytes.length + " bytes; math to pdf rejected with " + mathPdfCode + "; brep to glb " + glb.bytes.length + " bytes; brep to html " + viewer.bytes.length + " bytes; cad to stl " + stlFacets + " facets; cad to glb " + cadGlb.bytes.length + " bytes; cad to 3mf " + cad3mf.bytes.length + " bytes; cad to dxf " + cadDxf.bytes.length + " bytes; cad to md " + cadDfm.bytes.length + " bytes");
`,
  );
  const out = run(process.execPath, ["check.mjs"], app);
  process.stdout.write(out);
} finally {
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
