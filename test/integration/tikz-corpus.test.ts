import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { BUNDLE_DIR_VAR, renderTikzSvg, svgCounts, texConfig, type TikzApproval } from "../support/tikz-corpus.ts";

const CORPUS = fileURLToPath(new URL("../corpus/tikz", import.meta.url));
const sources = readdirSync(CORPUS).filter((f) => f.endsWith(".tex")).sort();
const approval = JSON.parse(readFileSync(join(CORPUS, "approval.json"), "utf8")) as TikzApproval;
const bundleDir = process.env[BUNDLE_DIR_VAR];
if (!bundleDir) {
  console.log(`SKIP test/integration/tikz-corpus.test.ts: ${BUNDLE_DIR_VAR} is not set. It names the folder that \`node tools/tex/bundles.mjs pack\` wrote.`);
}
const run = bundleDir ? test : test.skip;

/** The structure of each sample, written by hand from the source: the glyph paths (one for each character that the source typesets) and all paths. */
const STRUCTURE: Record<string, { glyphs: number; paths: number }> = {
  // O and H: 2 glyphs. Ring: 6 bonds and 3 double-bond lines; 1 bond to OH; 10 drawing paths + 2 glyphs.
  "chemfig-phenol.tex": { glyphs: 2, paths: 12 },
  // V_s, R_1, R_2, V_out: 2+2+2+4 = 10 glyphs. 6 drawing paths: 3 symbols and 3 wire paths.
  "circuit-divider.tex": { glyphs: 10, paths: 16 },
  // 2 H 2 + O 2 -> 2 H 2 O: 10 characters and an arrow of 3 glyphs; no drawing path.
  "mhchem-reaction.tex": { glyphs: 13, paths: 13 },
  // a, b, c: 3 glyphs. 2 drawing paths: the triangle and the right-angle mark.
  "tikz-triangle.tex": { glyphs: 3, paths: 5 },
  // A B C D f g h k: 8 glyphs. Four arrows of 2 paths each: 8 drawing paths.
  "tikzcd-square.tex": { glyphs: 8, paths: 16 },
};

describe("TikZ corpus", () => {
  test("every source has an expected SVG, and every expected SVG has a source", () => {
    const expected = readdirSync(CORPUS).filter((f) => f.endsWith(".expected.svg")).sort();
    expect(sources.map((f) => f.replace(/\.tex$/, ".expected.svg"))).toEqual(expected);
  });

  test("the corpus covers circuitikz, tikz-cd, chemfig, mhchem and plain tikz", () => {
    expect(sources.length).toBeGreaterThanOrEqual(5);
    const text = sources.map((f) => readFileSync(join(CORPUS, f), "utf8")).join("\n");
    for (const marker of ["circuitikz", "tikzcd", "\\chemfig", "\\ce{", "tikzpicture"]) expect(text).toContain(marker);
  });

  test("the approval manifest lists each source once, with a boolean approval", () => {
    expect(approval.entries.map((e) => e.source).sort()).toEqual(sources);
    expect(Object.keys(STRUCTURE).sort()).toEqual(sources);
    for (const entry of approval.entries) expect(typeof entry.approved).toBe("boolean");
  });

  for (const entry of approval.entries) {
    test(`${entry.source} is approved by the reviewer; set approved to true in test/corpus/tikz/approval.json`, () => {
      expect(entry.approved).toBe(true);
    });

    run(`${entry.source} has the hand-written structure, only glyph paths, and matches its expected SVG`, async () => {
      const source = readFileSync(join(CORPUS, entry.source), "utf8");
      const svg = await renderTikzSvg(source, texConfig(bundleDir!));
      const counts = svgCounts(svg);
      const want = STRUCTURE[entry.source]!;
      expect(counts.text).toBe(0);
      expect(counts.fontFamily).toBe(0);
      expect({ glyphs: counts.glyphs, paths: counts.paths }).toEqual(want);
      const expected = readFileSync(join(CORPUS, entry.source.replace(/\.tex$/, ".expected.svg")), "utf8");
      expect(svg === expected).toBe(true);
    });
  }
});
