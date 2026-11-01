// Trial T1: measure @viz-js/viz on Bun or Node. Runs unchanged under both.
// Uses only node: modules and web APIs. Prints one JSON line to stdout.
// Usage: <bun|node> measure.mjs [--svg-dir <dir>]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const vizDir = join(here, "node_modules", "@viz-js", "viz");
const probeImage = join(here, "probe-image.png");

function sizeOf(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    total += entry.isDirectory() ? sizeOf(p) : statSync(p).size;
  }
  return total;
}

// The WASM build is embedded in dist/viz.js as a binaryDecode('...') string literal.
// Its decoded length is the WASM byte count.
function wasmBytes(file) {
  const src = readFileSync(file, "latin1");
  const m = src.match(/binaryDecode\('((?:[^'\\]|\\.)*)'\)/);
  if (!m) return null;
  const bytes = new Function("return '" + m[1] + "';")();
  const magic = [...bytes.slice(0, 4)].map((c) => c.charCodeAt(0));
  return { bytes: bytes.length, magicOk: magic.join(",") === "0,97,115,109" };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// Warm runs per source. The small graph gets the brief's 20. The generated graphs get 3,
// because one 200-node render takes about 2.5 minutes under the local Bun build.
const WARM_RUNS_BY_SOURCE = { small: 20, large100: 3, large200: 3 };

// Sources are read from committed files (see make-sources.mjs), so the Graphviz CLI
// renders the same bytes.
const SOURCES = {
  small: readFileSync(join(here, "small.dot"), "utf8"),
  large100: readFileSync(join(here, "large100.dot"), "utf8"),
  large200: readFileSync(join(here, "large200.dot"), "utf8"),
  probe: readFileSync(join(here, "probe.dot"), "utf8"),
};

const args = process.argv.slice(2);
const svgDirIdx = args.indexOf("--svg-dir");
const svgDir = svgDirIdx >= 0 ? args[svgDirIdx + 1] : null;
if (svgDir) mkdirSync(svgDir, { recursive: true });

const runtime = process.versions.bun ? "bun" : "node";
const version = process.versions.bun ?? process.version;

const t0 = performance.now();
const mod = await import("@viz-js/viz");
const viz = await mod.instance();
const firstSvg = viz.renderString(SOURCES.small, { format: "svg" });
const firstRenderMs = performance.now() - t0;

const sources = {};
const svgs = {};
for (const [name, src] of Object.entries(SOURCES)) {
  if (name === "probe") continue;
  const times = [];
  let svg = null;
  const runs = WARM_RUNS_BY_SOURCE[name];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    svg = viz.renderString(src, { format: "svg" });
    times.push(performance.now() - s);
  }
  svgs[name] = svg;
  sources[name] = {
    warmRuns: runs,
    warmMedianMs: Number(median(times).toFixed(3)),
    warmMinMs: Number(Math.min(...times).toFixed(3)),
    svgBytes: svg.length,
    svgSha256: sha256(svg),
  };
}
if (sha256(firstSvg) !== sources.small.svgSha256) throw new Error("first SVG differs from warm SVG of the same source");

// Image attribute probe. Default render, then render with the image size declared.
const probeDefault = viz.render(SOURCES.probe, { format: "svg" });
const probeSized = viz.render(SOURCES.probe, { format: "svg", images: [{ name: "probe-image.png", width: 1, height: 1 }] });
const hrefOf = (svg) => {
  const m = svg && svg.match(/<image[^>]*?(?:xlink:)?href="([^"]*)"/);
  return m ? m[1] : null;
};
const probe = {
  fileExistsLocally: existsSync(probeImage),
  defaultStatus: probeDefault.status,
  defaultErrors: probeDefault.errors ?? [],
  defaultHref: hrefOf(probeDefault.output),
  defaultHasImageElement: Boolean(probeDefault.output && probeDefault.output.includes("<image")),
  sizedStatus: probeSized.status,
  sizedHref: hrefOf(probeSized.output),
  embedsDataUri: Boolean(probeSized.output && /data:image/.test(probeSized.output)),
};
if (svgDir) {
  writeFileSync(join(svgDir, `${runtime}.small.viz.svg`), svgs.small);
  writeFileSync(join(svgDir, `${runtime}.large100.viz.svg`), svgs.large100);
  writeFileSync(join(svgDir, `${runtime}.large200.viz.svg`), svgs.large200);
  writeFileSync(join(svgDir, `${runtime}.probe.viz.svg`), probeDefault.output ?? "");
}

const result = {
  trial: "T1-graph",
  runtime,
  version,
  platform: process.platform,
  arch: process.arch,
  nodeVersion: process.version,
  vizVersion: JSON.parse(readFileSync(join(vizDir, "package.json"), "utf8")).version,
  graphvizVersion: viz.graphvizVersion,
  firstRenderMs: Number(firstRenderMs.toFixed(3)),
  sources,
  packageBytes: sizeOf(vizDir),
  wasm: wasmBytes(join(vizDir, "dist", "viz.js")),
  probe,
};
console.log(JSON.stringify(result));
