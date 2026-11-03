/**
 * Writes the expected SVG of each corpus source from the pinned viz library, without the engine wrapper.
 * Run it with bun after a change to the pinned library version or to a corpus source, then commit the files.
 * The library messages of each source are printed. The corpus test pins the messages that a source gives on purpose.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { instance } from "@viz-js/viz";

const CORPUS = fileURLToPath(new URL("./dot", import.meta.url));
const viz = await instance();

for (const file of readdirSync(CORPUS).filter((f) => f.endsWith(".dot")).sort()) {
  const result = viz.render(readFileSync(join(CORPUS, file), "utf8"), { format: "svg" });
  if (result.status !== "success") {
    throw new Error(`${file}: the library failed`);
  }
  writeFileSync(join(CORPUS, file.replace(/\.dot$/, ".expected.svg")), result.output);
  console.log(`${file}: ${result.output.length} characters`);
  for (const entry of result.errors) {
    console.log(`  ${entry.level ?? "message"}: ${entry.message}`);
  }
}
