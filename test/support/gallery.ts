/**
 * The fixture gallery: every corpus source, rendered through the public render, and one HTML page of the results.
 * A fixture is one source with one output format. The page embeds images as data URIs and links the other
 * outputs. It holds the render times, so it is written outside the repository and never committed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { render, type SciengConfig } from "../../src/index.ts";
import { BINARY_INPUT_TYPES, INPUT_TYPES, type InputType, type OutputFormat, type RenderRequest } from "../../src/types.ts";
import { isRenderError, type RenderErrorCode } from "../../src/errors.ts";
import { findPair, PAIRS } from "../../src/pairs.ts";
import { escapeHtml, reviewPage } from "./review-page.ts";
import { texConfig } from "./tikz-corpus.ts";

/** Images above this size are not embedded in the page. */
export const MAX_EMBED_BYTES = 2 * 1024 * 1024;

/** The text of each skip, by the stage that the output needs. */
export const SKIP_REASONS = {
  browser: "skipped: no browser (SCIENG_BROWSER)",
  tex: "skipped: no TeX bundles (SCIENG_TEX_BUNDLE_DIR)",
} as const;

/** The outputs that the gallery renders for each input type. The page orders them as the pair table does. */
const GALLERY_FORMATS: Partial<Record<InputType, OutputFormat[]>> = {
  dot: ["svg", "pdf"],
  mermaid: ["svg", "pdf"],
  tikz: ["svg"],
  plot: ["svg", "html"],
  sysml: ["svg", "pdf"],
  step: ["png", "glb", "dxf"],
  iges: ["png", "glb", "dxf"],
  brep: ["png", "glb", "dxf"],
  cad: ["png", "pdf", "dxf", "md"],
  html: ["md", "png"],
};

/** The folders of the corpus, and the input type of each file extension in them. */
const SOURCE_DIRS: { dir: string; byExtension: Record<string, InputType> }[] = [
  { dir: "dot", byExtension: { ".dot": "dot" } },
  { dir: "mermaid", byExtension: { ".mmd": "mermaid" } },
  { dir: "tikz", byExtension: { ".tex": "tikz" } },
  { dir: "plot", byExtension: { ".json": "plot" } },
  { dir: "sysml", byExtension: { ".sysml": "sysml" } },
  { dir: "mesh", byExtension: { ".step": "step", ".stp": "step", ".iges": "iges", ".igs": "iges", ".brep": "brep" } },
  { dir: "cad", byExtension: { ".json": "cad" } },
  { dir: "html", byExtension: { ".html": "html" } },
];

/** One fixture: a source file and one output format. */
export interface GalleryEntry {
  type: InputType;
  /** The file name inside its folder. */
  file: string;
  path: string;
  format: OutputFormat;
  /** The render options of the source, from the approval manifest of its folder. */
  options?: Record<string, unknown>;
}

/** The outcome of one fixture. */
export type GalleryResult = GalleryEntry &
  (
    | { status: "rendered"; mime: string; backend: string; bytes: Uint8Array; ms: number; warnings: string[] }
    | { status: "rejected"; code: RenderErrorCode; message: string; ms: number }
    | { status: "skipped"; reason: string }
  );

/** The tools that a render may need. Each is optional: a missing tool skips the fixtures that need it. */
export interface GalleryEnv {
  browser?: string;
  texBundleDir?: string;
  /** The TeX cache folder that all TikZ fixtures of one run share. Without it, each fixture gets a new folder. */
  cacheDir?: string;
}

/** The render that renderFixture calls. Tests give a fake. */
export type RenderFn = typeof render;

/** The facts that the page states in its intro. */
export interface GalleryMeta {
  engine: string;
  browser: boolean;
  tex: boolean;
}

function pairIndex(type: InputType, format: OutputFormat): number {
  return PAIRS.findIndex((p) => p.type === type && p.format === format);
}

/** The order of the page: the input types, then the file names by code unit, then the pair table. */
function compareEntries(a: GalleryEntry, b: GalleryEntry): number {
  const byType = INPUT_TYPES.indexOf(a.type) - INPUT_TYPES.indexOf(b.type);
  if (byType !== 0) return byType;
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return pairIndex(a.type, a.format) - pairIndex(b.type, b.format);
}

function readOptions(dir: string): Record<string, Record<string, unknown>> {
  const manifest = join(dir, "approval.json");
  if (!existsSync(manifest)) return {};
  const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { entries?: unknown };
  if (!Array.isArray(parsed.entries)) throw new Error(`${manifest}: approval.json has no entries array`);
  const entries = parsed.entries as { source: string; options?: Record<string, unknown> }[];
  const out: Record<string, Record<string, unknown>> = {};
  for (const e of entries) if (e.options !== undefined) out[e.source] = e.options;
  return out;
}

/** Lists every fixture under the corpus root, in the order that the page uses. A missing folder adds nothing. */
export function listFixtures(corpusRoot: string): GalleryEntry[] {
  const out: GalleryEntry[] = [];
  for (const source of SOURCE_DIRS) {
    const dir = join(corpusRoot, source.dir);
    if (!existsSync(dir)) continue;
    const options = readOptions(dir);
    for (const file of readdirSync(dir).sort()) {
      const path = join(dir, file);
      if (!statSync(path).isFile()) continue;
      const type = source.byExtension[extname(file).toLowerCase()];
      if (type === undefined) continue;
      for (const format of GALLERY_FORMATS[type] ?? []) {
        const entry: GalleryEntry = { type, file, path, format };
        const opts = options[file];
        if (opts !== undefined) entry.options = opts;
        out.push(entry);
      }
    }
  }
  return out.sort(compareEntries);
}

/** Renders one fixture through the public render. A missing tool gives a skip; a render error gives a rejection. */
export async function renderFixture(entry: GalleryEntry, env: GalleryEnv, renderFn: RenderFn = render): Promise<GalleryResult> {
  const stage = findPair(entry.type, entry.format)?.stage;
  if (stage === "browser" && env.browser === undefined) return { ...entry, status: "skipped", reason: SKIP_REASONS.browser };
  if (stage === "tex" && env.texBundleDir === undefined) return { ...entry, status: "skipped", reason: SKIP_REASONS.tex };

  const config: Partial<SciengConfig> = {};
  if (stage === "browser") config.browser = env.browser;
  if (stage === "tex") Object.assign(config, texConfig(env.texBundleDir as string, env.cacheDir));
  const source = BINARY_INPUT_TYPES.includes(entry.type) ? new Uint8Array(readFileSync(entry.path)) : readFileSync(entry.path, "utf8");
  const request: RenderRequest = { type: entry.type, format: entry.format, source };
  if (entry.options !== undefined) request.options = entry.options;

  const started = performance.now();
  try {
    const out = await renderFn(request, config);
    return { ...entry, status: "rendered", mime: out.mime, backend: out.backend, bytes: out.bytes, ms: elapsed(started), warnings: out.warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isRenderError(err)) return { ...entry, status: "rejected", code: err.code, message, ms: elapsed(started) };
    return { ...entry, status: "rejected", code: "E_INTERNAL", message, ms: elapsed(started) };
  }
}

function elapsed(started: number): number {
  return Math.round(performance.now() - started);
}

function output(r: GalleryResult & { status: "rendered" }): string {
  if (r.format === "md") return `<pre>${escapeHtml(new TextDecoder().decode(r.bytes))}</pre>`;
  const size = r.bytes.byteLength;
  if (size > MAX_EMBED_BYTES) return `<p>not embedded: ${size} bytes</p>`;
  const href = `data:${r.mime};base64,${Buffer.from(r.bytes).toString("base64")}`;
  if (r.mime.startsWith("image/")) return `<img alt="" src="${href}">`;
  return `<p><a download href="${href}">open (${size} bytes)</a></p>`;
}

function figure(r: GalleryResult): string {
  const head = `<h3>${escapeHtml(r.file)}</h3>`;
  if (r.status === "skipped") return [head, `<p class="skipped">${escapeHtml(r.reason)}</p>`].join("\n");
  if (r.status === "rejected") return [head, `<p class="error">${escapeHtml(r.code)}: ${escapeHtml(r.message)}</p>`].join("\n");
  const facts = `<p>Format: ${r.format}. Backend: ${escapeHtml(r.backend)}. Bytes: ${r.bytes.byteLength}. Time: ${r.ms} ms.</p>`;
  const warnings =
    r.warnings.length === 0 ? "<p>No warnings.</p>" : `<ul>\n${r.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("\n")}\n</ul>`;
  return [head, facts, output(r), warnings].join("\n");
}

/** Writes the gallery page of the results. The order of the results does not change the page. */
export function galleryPage(results: GalleryResult[], meta: GalleryMeta): string {
  const ordered = [...results].sort(compareEntries);
  const count = (status: GalleryResult["status"]) => ordered.filter((r) => r.status === status).length;
  const sections = INPUT_TYPES.flatMap((type) => {
    const items = ordered.filter((r) => r.type === type);
    if (items.length === 0) return [];
    return [`<section>\n<h2>${type}</h2>\n${items.map(figure).join("\n")}\n</section>`];
  });
  const intro =
    `${ordered.length} fixtures, ${count("rendered")} rendered, ${count("rejected")} rejected, ${count("skipped")} skipped. ` +
    `Engine ${meta.engine}. Browser: ${meta.browser ? "yes" : "no"}. TeX bundles: ${meta.tex ? "yes" : "no"}.`;
  return reviewPage({
    title: "Fixture gallery",
    intro,
    style: ["img { max-width: 100%; border: 1px solid #ccc; }", ".error { color: #a00; }", ".skipped { color: #666; }"],
    sections,
  });
}
