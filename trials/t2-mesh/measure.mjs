// Trial T2: measure occt-import-js on Bun or Node. Runs unchanged under both.
// Uses only node: modules and the package itself. Prints one JSON object per line to stdout:
// one "load" line, one "read" line per sample, and one "summary" line.
// Usage: <bun|node> measure.mjs [--config samples.json]
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cfgIdx = args.indexOf("--config");
const configFile = join(here, cfgIdx >= 0 ? args[cfgIdx + 1] : "samples.json");
const config = JSON.parse(readFileSync(configFile, "utf8"));
const pkgDir = join(here, "node_modules", "occt-import-js");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
function sizeOf(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    total += entry.isDirectory() ? sizeOf(p) : statSync(p).size;
  }
  return total;
}

const runtime = process.versions.bun ? "bun" : "node";
const runtimeVersion = process.versions.bun ?? process.version;
// The WASM prints its own messages (for example "Total number of loaded entities").
// They go to this array, so stdout keeps only JSON lines.
const wasmMessages = [];
const peak = { heapUsed: 0, rss: 0, arrayBuffers: 0 };
// sampleMax holds the peak of the sample that is running; the run-wide peak is in peak.
const sampleMax = { heapUsed: 0, rss: 0 };
const sample = () => {
  const m = process.memoryUsage();
  sampleMax.heapUsed = Math.max(sampleMax.heapUsed, m.heapUsed);
  sampleMax.rss = Math.max(sampleMax.rss, m.rss);
  peak.heapUsed = Math.max(peak.heapUsed, m.heapUsed);
  peak.rss = Math.max(peak.rss, m.rss);
  peak.arrayBuffers = Math.max(peak.arrayBuffers, m.arrayBuffers ?? 0);
};
const emit = (obj) => console.log(JSON.stringify({ trial: "T2-mesh", runtime, runtimeVersion, platform: process.platform, arch: process.arch, nodeVersion: runtime === "node" ? process.version : null, ...obj }));

// Memory baselines, taken before the import, after the import and after the factory.
// They show the cost of the runtime, of the JavaScript module and of the WASM instance.
const snapshot = (stage) => {
  const m = process.memoryUsage();
  return { stage, heapUsed: m.heapUsed, rss: m.rss, arrayBuffers: m.arrayBuffers ?? 0, external: m.external ?? 0 };
};
const baselineBefore = snapshot("before import");
emit({ kind: "baseline", ...baselineBefore });

// Load: import the package and await its factory. The WASM is a separate file that the factory loads.
const t0 = performance.now();
const mod = await import("occt-import-js");
const afterImport = snapshot("after import");
emit({ kind: "baseline", ...afterImport });
const occt = await mod.default({
  print: (text) => wasmMessages.push(String(text)),
  printErr: (text) => wasmMessages.push(String(text)),
});
const loadMs = performance.now() - t0;
sample();
const afterFactory = snapshot("after factory");
emit({ kind: "baseline", ...afterFactory });
const wasmFile = join(pkgDir, "dist", "occt-import-js.wasm");
const pkgVersion = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
emit({ kind: "load", loadMs: Number(loadMs.toFixed(3)), occtImportJsVersion: pkgVersion, wasmBytes: statSync(wasmFile).size, packageBytes: sizeOf(pkgDir), heapUsedAfterFactoryMinusBeforeImportBytes: afterFactory.heapUsed - baselineBefore.heapUsed, rssAfterFactoryMinusBeforeImportBytes: afterFactory.rss - baselineBefore.rss });

// Summarise one result: meshes, triangles, colours, a hash of the geometry and the bounding box.
function summarise(result) {
  let triangles = 0;
  let facesTotal = 0;
  let facesWithColour = 0;
  let meshesWithColour = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const hash = createHash("sha256");
  for (const mesh of result.meshes) {
    triangles += mesh.index.array.length / 3;
    if (mesh.color != null) meshesWithColour++;
    for (const face of mesh.brep_faces ?? []) {
      facesTotal++;
      if (face.color != null) facesWithColour++;
    }
    const pos = mesh.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (pos[i + k] < min[k]) min[k] = pos[i + k];
        if (pos[i + k] > max[k]) max[k] = pos[i + k];
      }
    }
    hash.update(JSON.stringify(mesh.attributes.position.array));
    hash.update(JSON.stringify(mesh.index.array));
  }
  return {
    meshes: result.meshes.length,
    triangles,
    facesTotal,
    facesWithColour,
    meshesWithColour,
    bbox: min.map((v, k) => [Number(v.toPrecision(12)), Number(max[k].toPrecision(12))]),
    geometrySha256: hash.digest("hex"),
  };
}

const readers = config.readers;
const warmRuns = config.warmRuns;
const summaries = [];
for (const s of config.samples) {
  const bytes = new Uint8Array(readFileSync(join(here, s.file)));
  const fileHash = sha256(bytes);
  if (fileHash !== s.sha256) {
    throw new Error(`${s.file} SHA-256 is ${fileHash}, the manifest says ${s.sha256}`);
  }
  const fn = occt[readers[s.format]];
  if (typeof fn !== "function") throw new Error(`reader ${readers[s.format]} is missing`);

  sampleMax.heapUsed = 0;
  sampleMax.rss = 0;
  const first = performance.now();
  const firstResult = fn(bytes, s.params);
  const firstMs = performance.now() - first;
  sample();
  if (!firstResult.success) throw new Error(`${s.id}: reader returned success false`);
  const summary = summarise(firstResult);

  const runs = s.warmRuns ?? warmRuns;
  const times = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    const r = fn(bytes, s.params);
    times.push(performance.now() - t);
    if (!r.success) throw new Error(`${s.id}: warm run ${i} returned success false`);
    sample();
  }
  const rec = {
    kind: "read",
    id: s.id,
    format: s.format,
    reader: readers[s.format],
    file: s.file,
    fileBytes: bytes.length,
    sha256: fileHash,
    params: s.params,
    firstReadMs: Number(firstMs.toFixed(3)),
    warmRuns: runs,
    peakHeapUsedBytes: sampleMax.heapUsed,
    peakRssBytes: sampleMax.rss,
    warmMedianMs: Number(median(times).toFixed(3)),
    warmMinMs: Number(Math.min(...times).toFixed(3)),
    warmMaxMs: Number(Math.max(...times).toFixed(3)),
    ...summary,
  };
  summaries.push(rec);
  emit(rec);
}

// Resource usage. process.resourceUsage is absent on some runtimes, so the value may be null.
// maxRSS is reported as the runtime gives it.
const ru = typeof process.resourceUsage === "function" ? process.resourceUsage() : null;
emit({
  kind: "summary",
  samples: summaries.length,
  peakHeapUsedBytes: peak.heapUsed,
  peakRssBytes: peak.rss,
  peakArrayBuffersBytes: peak.arrayBuffers,
  maxRSS: ru ? ru.maxRSS : null,
  wasmMessageCount: wasmMessages.length,
  wasmMessageDistinct: [...new Set(wasmMessages)],
  maxRSSNote: "as returned by process.resourceUsage(); the unit is kilobytes on Linux and macOS in Node",
});
