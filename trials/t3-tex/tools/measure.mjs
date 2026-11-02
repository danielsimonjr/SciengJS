// Measure job: loads the format and renders the samples under the running runtime (Bun or Node).
// Environment (all required unless noted):
//   SCIENG_WEB2JS_DIR   web2js checkout (library.js, commonMemory.js)
//   SCIENG_FORMAT_DIR   folder with tex.wasm and core.dump.gz
//   SCIENG_BUNDLE_ROOT  folder with the bundles named in config.json (base, pgfplots)
//   SCIENG_WORKDIR      empty working folder for TeX output
//   SCIENG_OUT          folder for the result JSON and the SVG files
//   SCIENG_T3_CONFIG    config file (optional; default: config.json next to this script)
//   SCIENG_TEX_LOOKUP   set to "bundles" by this script, never read from outside
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Writable } from 'node:stream';
import { dvi2html } from '@drgrice1/dvi2html';
import { loadEngine, renderTex, setCoreDump, requiredEnv } from './tex-engine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.env.SCIENG_T3_CONFIG || path.join(here, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const bundleRoot = requiredEnv('SCIENG_BUNDLE_ROOT');
const outDir = requiredEnv('SCIENG_OUT');
const workdir = requiredEnv('SCIENG_WORKDIR');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(workdir, { recursive: true });
process.chdir(workdir);
process.env.SCIENG_TEX_LOOKUP = 'bundles';

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const bundlesFor = (names) => names.map((n) => path.join(bundleRoot, n)).join(',');

async function toSvg(dvi) {
  let html = '';
  const sink = new Writable({
    write(chunk, _enc, cb) {
      html += chunk.toString();
      cb();
    }
  });
  async function* chunks() {
    yield Buffer.from(dvi);
  }
  await dvi2html(chunks(), sink);
  const match = html.match(/<svg[\s\S]*<\/svg>/);
  return match ? match[0] : null;
}

const count = (svg, pattern) => (svg.match(pattern) || []).length;

function svgCheck(svg) {
  if (svg === null) return { svgFound: false };
  return {
    svgFound: true,
    svgBytes: Buffer.byteLength(svg),
    textElements: count(svg, /<text[\s>]/g),
    fontFamilyAttributes: count(svg, /font-family/g),
    pathElements: count(svg, /<path[\s>]/g),
    fontFaceOrUrl: count(svg, /@font-face|url\(/g)
  };
}

function texErrorLine(logName) {
  const logPath = path.join(workdir, logName);
  if (!fs.existsSync(logPath)) return null;
  const line = fs.readFileSync(logPath, 'utf8').split('\n').find((l) => l.startsWith('!'));
  return line ?? null;
}

const result = {
  runtime: process.versions.bun ? 'bun' : 'node',
  runtimeVersion: process.versions.bun ?? process.version,
  platform: process.platform,
  arch: process.arch,
  osRelease: os.release(),
  samples: {},
  negative: null,
  timings: {}
};

// Load: gunzip the format, compile the WASM.
const coreGz = fs.readFileSync(path.join(requiredEnv('SCIENG_FORMAT_DIR'), 'core.dump.gz'));
let t0 = performance.now();
const coreBytes = zlib.gunzipSync(coreGz);
result.timings.gunzipCoreMs = performance.now() - t0;

const engine = loadEngine(requiredEnv('SCIENG_FORMAT_DIR'));
setCoreDump(engine, coreBytes);
result.timings.wasmCompileMs = engine.wasmCompileMs;

async function runSample(sample) {
  process.env.SCIENG_TEX_BUNDLES = bundlesFor(sample.bundles);
  const source = fs.readFileSync(path.join(here, '..', sample.file), 'utf8');
  const inputName = `${sample.name}.tex`;

  const first = renderTex(engine, workdir, inputName, source);
  if (first.dvi === null) throw new Error(`${sample.name}: no DVI written`);
  const tFirstSvg = performance.now();
  const svgFirst = await toSvg(first.dvi);
  const svgFirstMs = performance.now() - tFirstSvg;

  const warm = [];
  let lastDvi = first.dvi;
  for (let i = 0; i < sample.repeats; i += 1) {
    const r = renderTex(engine, workdir, inputName, source);
    warm.push(r.texMs);
    lastDvi = r.dvi;
  }
  const svgLast = await toSvg(lastDvi);
  fs.writeFileSync(path.join(outDir, `${sample.name}.svg`), svgLast ?? '');

  const bundleFiles = sample.bundles.filter((n) => n !== 'base');
  result.samples[sample.name] = {
    firstTexMs: first.texMs,
    firstDviToSvgMs: svgFirstMs,
    warmTexMedianMs: median(warm),
    warmRepeats: warm.length,
    usedFileCount: Object.keys(first.usedFiles).length,
    extraBundles: bundleFiles,
    svg: svgCheck(svgLast),
    svgFirstRun: svgCheck(svgFirst)
  };
}

for (const sample of config.samples) {
  await runSample(sample);
}

// Negative test: the pgfplots sample without its bundle must stop with a TeX error.
{
  const neg = config.negativeSample;
  process.env.SCIENG_TEX_BUNDLES = bundlesFor(neg.bundles);
  const source = fs.readFileSync(path.join(here, '..', neg.file), 'utf8');
  const name = `${neg.name}.tex`;
  const r = renderTex(engine, workdir, name, source);
  result.negative = {
    dviWritten: r.dvi !== null,
    firstErrorLine: texErrorLine(`${neg.name}.log`)
  };
}

fs.writeFileSync(path.join(outDir, `${result.runtime}-${result.platform}.json`), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
