/**
 * Renders every corpus fixture through the public render and writes one HTML page of the results.
 *
 *   bun test/corpus/gallery.ts --out <folder> [--type <type>]...
 *
 * The page is gallery.html in the folder. Set SCIENG_BROWSER to run the browser pairs, and SCIENG_TEX_BUNDLE_DIR
 * to run the TikZ pairs. A fixture that needs a missing tool is a skip with its reason. A render error is a
 * rejection with its code. Exit 0 when the page is written, even with rejections; exit 2 on a usage error; exit 1
 * when the page cannot be written.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { INPUT_TYPES, type InputType } from "../../src/types.ts";
import { ENGINE_VERSION } from "../../src/version.ts";
import { galleryPage, listFixtures, renderFixture, type GalleryEnv, type GalleryResult } from "../support/gallery.ts";
import { BUNDLE_DIR_VAR } from "../support/tikz-corpus.ts";

const BROWSER_VAR = "SCIENG_BROWSER";
const PAGE_NAME = "gallery.html";
const CACHE_PREFIX = "scieng-gallery-cache-";
const USAGE = "usage: bun test/corpus/gallery.ts --out <folder> [--type <type>]...";
const CORPUS = fileURLToPath(new URL("./", import.meta.url));

function usageError(message: string): never {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
}

let out: string | undefined;
const types: InputType[] = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--out") {
    out = argv[++i];
    if (out === undefined || out.startsWith("--")) usageError("--out needs a folder");
  } else if (arg === "--type") {
    const name = argv[++i];
    if (name === undefined || !(INPUT_TYPES as readonly string[]).includes(name)) usageError(`unknown type: ${name ?? "(none)"}`);
    types.push(name as InputType);
  } else {
    usageError(`unknown option: ${arg}`);
  }
}
if (out === undefined) usageError("--out is required");

const browserPath = process.env[BROWSER_VAR] ?? "";
const bundleDir = process.env[BUNDLE_DIR_VAR] ?? "";
const env: GalleryEnv = {
  browser: browserPath !== "" && existsSync(browserPath) ? browserPath : undefined,
  texBundleDir: bundleDir !== "" && existsSync(bundleDir) ? bundleDir : undefined,
};
// One TeX cache for the run, so the bundles unpack once. The finally block removes it.
if (env.texBundleDir !== undefined) env.cacheDir = mkdtempSync(join(tmpdir(), CACHE_PREFIX));

function detail(r: GalleryResult): string {
  if (r.status === "rendered") return `${r.bytes.byteLength} bytes, ${r.ms} ms`;
  if (r.status === "rejected") return `${r.code}: ${r.message}`;
  return r.reason;
}

const started = performance.now();
const wanted = listFixtures(CORPUS).filter((e) => types.length === 0 || types.includes(e.type));
const results: GalleryResult[] = [];
try {
  for (const entry of wanted) {
    const result = await renderFixture(entry, env);
    results.push(result);
    console.log(`${result.status.padEnd(8)} ${result.type}/${result.file} ${result.format} ${detail(result)}`);
  }
} finally {
  if (env.cacheDir !== undefined) rmSync(env.cacheDir, { recursive: true, force: true });
}
const rendered = results.filter((r) => r.status === "rendered").length;
const rejected = results.filter((r) => r.status === "rejected").length;
const skipped = results.filter((r) => r.status === "skipped").length;
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`total: ${results.length} fixtures, ${rendered} rendered, ${rejected} rejected, ${skipped} skipped in ${seconds} s`);

const page = galleryPage(results, { engine: ENGINE_VERSION, browser: env.browser !== undefined, tex: env.texBundleDir !== undefined });
const target = join(resolve(out), PAGE_NAME);
try {
  mkdirSync(resolve(out), { recursive: true });
  writeFileSync(target, page);
} catch (err) {
  console.error(`cannot write the page to ${target}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
console.log(`page: ${target}`);
