import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { render, type SciengConfig } from "../../src/index.ts";

/** The approval manifest of the TikZ corpus: each source, its render options and its approval. */
export interface TikzApproval {
  entries: { source: string; options: Record<string, unknown>; approved: boolean }[];
}

/** The name of the variable that holds the folder of the packed TeX bundles. */
export const BUNDLE_DIR_VAR = "SCIENG_TEX_BUNDLE_DIR";

/**
 * The checkable counts of a TikZ SVG. A glyph path is a `<path>` that carries a `transform` with `scale`. A
 * drawing path has no `transform`. `text` and `fontFamily` count the elements and the attributes that a font
 * needs. Both must be 0.
 */
export function svgCounts(svg: string): { glyphs: number; paths: number; text: number; fontFamily: number } {
  const glyphs = (svg.match(/<path\b[^>]*\btransform="[^"]*\bscale\(/g) ?? []).length;
  return {
    glyphs,
    paths: (svg.match(/<path\b/g) ?? []).length,
    text: (svg.match(/<text\b/g) ?? []).length,
    fontFamily: (svg.match(/font-family/g) ?? []).length,
  };
}

/** Makes the render configuration for the bundles in `bundleDir`, with a cache folder of its own. */
export function texConfig(bundleDir: string, cacheDir = mkdtempSync(path.join(tmpdir(), "scieng-tikz-cache-"))): Partial<SciengConfig> {
  return { cacheDir, texBundleUrl: pathToFileURL(bundleDir).href + "/", allowNetwork: "tex-bundles", timeoutMs: 120000 };
}

/** Renders one TikZ source to SVG text. */
export async function renderTikzSvg(source: string, cfg: Partial<SciengConfig>): Promise<string> {
  const out = await render({ type: "tikz", format: "svg", source }, cfg);
  return new TextDecoder().decode(out.bytes);
}
