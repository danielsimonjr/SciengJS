// Writes the generated DOT sources of trial T1. The measurement script and the
// Graphviz CLI both read these committed files, so both see the same bytes.
// Usage: node make-sources.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function generate(name, n) {
  const lines = [`digraph ${name} {`, "  node [shape=circle, fontsize=9];"];
  for (let i = 0; i < n - 1; i++) lines.push(`  n${i} -> n${i + 1};`);
  for (let i = 0; i < n; i++) lines.push(`  n${i} -> n${(i * 7 + 3) % n};`);
  lines.push("}", "");
  return lines.join("\n");
}

writeFileSync(join(here, "large100.dot"), generate("Large100", 100));
writeFileSync(join(here, "large200.dot"), generate("Large200", 200));
