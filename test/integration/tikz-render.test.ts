import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, test } from "bun:test";
import { render, type SciengConfig } from "../../src/index.ts";

const BUNDLE_DIR = process.env.SCIENG_TEX_BUNDLE_DIR;
if (BUNDLE_DIR === undefined || BUNDLE_DIR === "") {
  console.log("SKIP test/integration/tikz-render.test.ts: SCIENG_TEX_BUNDLE_DIR is not set. It names the folder that `node tools/tex/bundles.mjs pack` wrote.");
}
const run = BUNDLE_DIR ? test : test.skip;
const cache = mkdtempSync(path.join(tmpdir(), "scieng-tikz-cache-"));
afterAll(() => rmSync(cache, { recursive: true, force: true }));

const cfg = (): Partial<SciengConfig> => ({ cacheDir: cache, texBundleUrl: pathToFileURL(BUNDLE_DIR!).href + "/", allowNetwork: "tex-bundles", timeoutMs: 120000 });
const CIRCUIT = "\\begin{circuitikz}\n\\draw (0,0) to[V, l=$V_s$] (0,3) to[R, l=$R_1$] (3,3) to[R, l=$R_2$] (3,0) -- (0,0);\n\\draw (3,3) -- (4,3) node[right] {$V_{out}$};\n\\end{circuitikz}";

describe("render of the tikz type through the bundles", () => {
  run("renders the circuit to svg with glyph paths and no text", async () => {
    const first = await render({ type: "tikz", format: "svg", source: CIRCUIT }, cfg());
    const svg = new TextDecoder().decode(first.bytes);
    console.log(`tikz render: ${svg.length} bytes of SVG, backend ${first.backend}`);
    expect(first.backend).toBe("tex/etex");
    expect((svg.match(/<path\b/g) ?? []).length).toBeGreaterThanOrEqual(10);
    expect(svg).not.toContain("<text");
    const second = await render({ type: "tikz", format: "svg", source: CIRCUIT }, cfg());
    expect(new TextDecoder().decode(second.bytes)).toBe(svg);
  });

  run("a diagrams bundle source (tikz-cd) renders from the diagrams bundle", async () => {
    const out = await render({ type: "tikz", format: "svg", source: "\\begin{tikzcd} A \\arrow[r, \"f\"] & B \\end{tikzcd}" }, cfg());
    expect(new TextDecoder().decode(out.bytes)).toContain("<path");
  });
});
