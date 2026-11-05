/**
 * Writes the expected SVG of each TikZ corpus source and the review page: each source, its SVG and its counts
 * (glyph paths and all paths). It needs the packed TeX bundles: set SCIENG_TEX_BUNDLE_DIR to the folder that
 * `node tools/tex/bundles.mjs pack` wrote. Run it with bun after a change to the TeX stage, to a bundle or to a
 * corpus source. Then review the page and commit the files. The reviewer approves each source in approval.json.
 * This script never changes an approval.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLE_DIR_VAR, renderTikzSvg, svgCounts, texConfig, type TikzApproval } from "../support/tikz-corpus.ts";

const CORPUS = fileURLToPath(new URL("./tikz", import.meta.url));
const REVIEW_PAGE = fileURLToPath(new URL("../../docs/analysis/i12-tikz-corpus.html", import.meta.url));
const bundleDir = process.env[BUNDLE_DIR_VAR];
if (!bundleDir) throw new Error(`${BUNDLE_DIR_VAR} is not set. It names the folder that \`node tools/tex/bundles.mjs pack\` wrote.`);

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const cfg = texConfig(bundleDir);
const approval = JSON.parse(readFileSync(join(CORPUS, "approval.json"), "utf8")) as TikzApproval;
const sections: string[] = [];
for (const entry of approval.entries) {
  const source = readFileSync(join(CORPUS, entry.source), "utf8");
  const svg = await renderTikzSvg(source, cfg);
  writeFileSync(join(CORPUS, entry.source.replace(/\.tex$/, ".expected.svg")), svg);
  const c = svgCounts(svg);
  console.log(`${entry.source}: ${c.glyphs} glyph paths, ${c.paths} paths, ${c.text} text, ${c.fontFamily} font-family`);
  sections.push(
    [
      "<section>",
      `<h2>${escapeHtml(entry.source)}</h2>`,
      `<p>Status: ${entry.approved ? "approved" : "not approved"}.</p>`,
      `<pre>${escapeHtml(source)}</pre>`,
      `<p>Glyph paths: ${c.glyphs}. All paths: ${c.paths}. Text elements: ${c.text}. Font-family attributes: ${c.fontFamily}.</p>`,
      svg,
      "</section>",
    ].join("\n"),
  );
}

const approved = approval.entries.filter((e) => e.approved).length;
const page = [
  "<!DOCTYPE html>",
  '<html lang="en">',
  "<head>",
  '<meta charset="utf-8">',
  "<title>TikZ stage: corpus review</title>",
  "<style>",
  "body { font-family: sans-serif; margin: 24px; }",
  "pre { background: #f4f4f4; padding: 8px; }",
  "section { margin-bottom: 32px; }",
  "svg { max-width: 100%; height: auto; border: 1px solid #ccc; }",
  "</style>",
  "</head>",
  "<body>",
  "<h1>TikZ stage: corpus review</h1>",
  `<p>Approval status: ${approved} of ${approval.entries.length} sources approved. The reviewer approves each source in test/corpus/tikz/approval.json.</p>`,
  ...sections,
  "</body>",
  "</html>",
  "",
].join("\n");
writeFileSync(REVIEW_PAGE, page);
console.log(`review page: ${REVIEW_PAGE}`);
