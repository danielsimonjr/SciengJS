/**
 * Writes the expected SVG of each Mermaid corpus source from the native layouts. It also writes the review page
 * that shows each source beside its SVG. Run it with bun after a change to a layout or to a corpus source, then
 * review the page and commit the files. A maintainer approves each source in approval.json. This script never
 * changes an approval.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMermaidSvg } from "../../src/mermaid/render.ts";

const CORPUS = fileURLToPath(new URL("./mermaid", import.meta.url));
const REVIEW_PAGE = fileURLToPath(new URL("../../docs/analysis/i3-mermaid-corpus.html", import.meta.url));

interface Approval {
  entries: { source: string; approved: boolean }[];
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const sources = readdirSync(CORPUS).filter((f) => f.endsWith(".mmd")).sort();
const approval = JSON.parse(readFileSync(join(CORPUS, "approval.json"), "utf8")) as Approval;
const approved = new Set(approval.entries.filter((e) => e.approved).map((e) => e.source));

const sections: string[] = [];
for (const file of sources) {
  const source = readFileSync(join(CORPUS, file), "utf8");
  const result = await renderMermaidSvg(source, {});
  writeFileSync(join(CORPUS, file.replace(/\.mmd$/, ".expected.svg")), result.svg);
  console.log(`${file}: ${result.svg.length} characters`);
  for (const warning of result.warnings) {
    console.log(`  warning: ${warning}`);
  }
  const status = approved.has(file) ? "approved" : "not approved";
  sections.push(
    `<section>\n<h2>${escapeHtml(file)}</h2>\n<p>Status: ${status}.</p>\n<pre>${escapeHtml(source)}</pre>\n${result.svg}\n</section>`,
  );
}

const page = [
  "<!DOCTYPE html>",
  '<html lang="en">',
  "<head>",
  '<meta charset="utf-8">',
  "<title>Mermaid native layouts: corpus review</title>",
  "<style>",
  "body { font-family: sans-serif; margin: 24px; }",
  "pre { background: #f4f4f4; padding: 8px; }",
  "section { margin-bottom: 32px; }",
  "</style>",
  "</head>",
  "<body>",
  "<h1>Mermaid native layouts: corpus review</h1>",
  `<p>Approval status: ${approved.size} of ${sources.length} sources approved. A maintainer approves each source in test/corpus/mermaid/approval.json.</p>`,
  ...sections,
  "</body>",
  "</html>",
  "",
].join("\n");
writeFileSync(REVIEW_PAGE, page);
console.log(`review page: ${REVIEW_PAGE}`);
