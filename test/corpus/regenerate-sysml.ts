/**
 * Writes the expected SVG of each SysML corpus source, with the options of its approval entry. It also writes the
 * review page: each source, its options, a table of checkable properties (the node titles and the edge count) and
 * its SVG. Run it with bun after a change to the parser, to a view or to a corpus source. Then review the page and
 * commit the files. The reviewer approves each source in approval.json. This script never changes an approval.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSysmlSvg } from "../../src/sysml/render.ts";
import { svgProperties, type SysmlApproval } from "../support/sysml-corpus.ts";

const CORPUS = fileURLToPath(new URL("./sysml", import.meta.url));
const REVIEW_PAGE = fileURLToPath(new URL("../../docs/analysis/i11-sysml-corpus.html", import.meta.url));

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const approval = JSON.parse(readFileSync(join(CORPUS, "approval.json"), "utf8")) as SysmlApproval;
const sections: string[] = [];
for (const entry of approval.entries) {
  const source = readFileSync(join(CORPUS, entry.source), "utf8");
  const result = await renderSysmlSvg(source, entry.options);
  writeFileSync(join(CORPUS, entry.source.replace(/\.sysml$/, ".expected.svg")), result.svg);
  const props = svgProperties(result.svg);
  console.log(`${entry.source}: ${props.nodes.length} nodes, ${props.edges} edges`);
  for (const warning of result.warnings) console.log(`  warning: ${warning}`);
  sections.push(
    [
      "<section>",
      `<h2>${escapeHtml(entry.source)}</h2>`,
      `<p>Status: ${entry.approved ? "approved" : "not approved"}. Options: <code>${escapeHtml(JSON.stringify(entry.options))}</code>.</p>`,
      `<pre>${escapeHtml(source)}</pre>`,
      `<p>Nodes (${props.nodes.length}): ${props.nodes.map(escapeHtml).join(", ")}. Edges: ${props.edges}.</p>`,
      result.svg,
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
  "<title>SysML views: corpus review</title>",
  "<style>",
  "body { font-family: sans-serif; margin: 24px; }",
  "pre { background: #f4f4f4; padding: 8px; }",
  "section { margin-bottom: 32px; }",
  "</style>",
  "</head>",
  "<body>",
  "<h1>SysML views: corpus review</h1>",
  `<p>Approval status: ${approved} of ${approval.entries.length} sources approved. The reviewer approves each source in test/corpus/sysml/approval.json.</p>`,
  ...sections,
  "</body>",
  "</html>",
  "",
].join("\n");
writeFileSync(REVIEW_PAGE, page);
console.log(`review page: ${REVIEW_PAGE}`);
