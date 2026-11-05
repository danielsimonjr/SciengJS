import { RenderError } from "../errors.ts";
import type { BackendSettings } from "../worker/protocol.ts";
import { findBundle, loadBundleBytes, loadBundles, unpackBundle, type BundleSettings } from "./bundles.ts";
import { detectBundles, type BundleName } from "./detect.ts";
import { renderTex, type RenderTexResult, type TexEngine } from "./render.ts";
import { TexTree } from "./vfs.ts";

/** The packages that the format holds. A wrapped source does not load them again. */
const FORMAT_PACKAGES: ReadonlySet<string> = new Set(["tikz", "pgf", "xcolor", "circuitikz", "standalone"]);

/** The loaded engine of the core bundle: the module, the format and the tree of the core files. */
export interface LoadedCore {
  engine: TexEngine;
  format: { name: string; bytes: Uint8Array };
  tree: TexTree;
}

let loadedCore: { sha256: string; value: LoadedCore } | undefined;

/** The names in the core bundle that are the engine, not tree files. */
const ENGINE_FILES = new Set(["engine.wasm", "engine.symbols.json", "tex.pool", "scieng.fmt"]);

async function wasmModule(bytes: Uint8Array): Promise<object> {
  const api = (globalThis as unknown as { WebAssembly: { compile(b: Uint8Array): Promise<object> } }).WebAssembly;
  return api.compile(bytes);
}

/**
 * Loads the core bundle once per process. The loaded value is reused while the pinned hash is the same. When the
 * parent process gives the files in `settings.texCore`, the worker uses them, reads no bundle file and keeps no copy.
 */
export async function loadCore(settings: BundleSettings & { texCore?: ReadonlyMap<string, Uint8Array> }): Promise<LoadedCore> {
  if (settings.texCore !== undefined) return coreOf(settings.texCore);
  const entry = findBundle("core");
  if (loadedCore?.sha256 === entry.sha256) return loadedCore.value;
  const value = await coreOf(unpackBundle(await loadBundleBytes(entry, settings)));
  loadedCore = { sha256: entry.sha256, value };
  return value;
}

/** Builds the loaded core from the files of the core bundle. */
async function coreOf(files: ReadonlyMap<string, Uint8Array>): Promise<LoadedCore> {
  const need = (name: string): Uint8Array => {
    const f = files.get(name);
    if (f === undefined) throw new RenderError("E_INTEGRITY", `the core TeX bundle has no file ${name}`);
    return f;
  };
  const tree = new TexTree();
  for (const [name, bytes] of files) if (!ENGINE_FILES.has(name)) tree.add(name, bytes);
  const value: LoadedCore = {
    engine: {
      module: await wasmModule(need("engine.wasm")),
      symbols: JSON.parse(new TextDecoder().decode(need("engine.symbols.json"))),
      pool: need("tex.pool"),
    },
    format: { name: "scieng.fmt", bytes: need("scieng.fmt") },
    tree,
  };
  return value;
}

/**
 * Makes a standalone document from a TikZ source. A source with a `\documentclass` is a document: the function only adds
 * the class option `dvisvgm`, which selects the DVI driver of the format. Any other source is the body: the function
 * adds the `standalone` class, one `\usepackage` line for each detected package that the format does not hold, and the
 * `document` environment.
 */
export function wrapSource(source: string, packages: readonly string[]): string {
  if (/\\documentclass\b/.test(source)) {
    return source.replace(/\\documentclass(?:\[([^\]]*)\])?/, (_m, opts?: string) => {
      const list = (opts ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
      return `\\documentclass[${[...new Set([...list, "dvisvgm"])].join(",")}]`;
    });
  }
  const uses = packages.filter((p) => !FORMAT_PACKAGES.has(p)).map((p) => `\\usepackage{${p}}\n`);
  return `\\documentclass[dvisvgm]{standalone}\n${uses.join("")}\\begin{document}\n${source}\n\\end{document}\n`;
}

/** What a tikz render gives: the SVG text and the warnings. */
export interface TikzSvg {
  svg: string;
  warnings: string[];
}

/** Renders one tikz source to SVG: detects the bundles, loads them, wraps the source and runs the engine. */
export async function renderTikzSvg(
  source: string,
  options: Record<string, unknown>,
  settings: Pick<BackendSettings, "cacheDir" | "texBundleUrl" | "allowNetwork" | "timeoutMs" | "texCore">,
): Promise<TikzSvg> {
  const detected = detectBundles(source);
  const bundleSettings: BundleSettings = {
    cacheDir: settings.cacheDir,
    texBundleUrl: settings.texBundleUrl,
    allowNetwork: settings.allowNetwork,
    timeoutMs: settings.timeoutMs,
  };
  const base = await loadCore({ ...bundleSettings, ...(settings.texCore === undefined ? {} : { texCore: settings.texCore }) });
  const extra = detected.bundles.filter((b): b is Exclude<BundleName, "core"> => b !== "core");
  const tree = base.tree.fork();
  for (const files of (await loadBundles(extra, bundleSettings)).values()) {
    for (const [name, bytes] of files) tree.add(name, bytes);
  }
  const margin = options.margin;
  if (margin !== undefined && (typeof margin !== "number" || !Number.isFinite(margin) || margin < 0)) {
    throw new RenderError("E_INPUT", "option margin must be a number that is zero or more");
  }
  const result: RenderTexResult = await renderTex({
    engine: base.engine,
    format: base.format,
    tree,
    source: wrapSource(source, detected.packages),
    jobName: "job",
    timeoutMs: settings.timeoutMs,
    ...(margin === undefined ? {} : { margin }),
  });
  const warnings: string[] = [];
  if (result.missing.length > 0) warnings.push(`${result.missing.length} glyph(s) have no outline in the bundled fonts`);
  return { svg: result.svg, warnings };
}
