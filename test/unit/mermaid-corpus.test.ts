import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMermaidSvg } from "../../src/mermaid/render.ts";
import { compareSvg } from "../support/svg-compare.ts";

const CORPUS = fileURLToPath(new URL("../corpus/mermaid", import.meta.url));
const sources = readdirSync(CORPUS).filter((f) => f.endsWith(".mmd")).sort();
const approval = JSON.parse(readFileSync(join(CORPUS, "approval.json"), "utf8")) as {
  entries: { source: string; approved: boolean }[];
};

describe("Mermaid corpus", () => {
  test("every source has an expected SVG, and every expected SVG has a source", () => {
    const expected = readdirSync(CORPUS).filter((f) => f.endsWith(".expected.svg")).sort();
    expect(sources.map((f) => f.replace(/\.mmd$/, ".expected.svg"))).toEqual(expected);
  });

  test("the corpus holds at least eight sources", () => {
    expect(sources.length).toBeGreaterThanOrEqual(8);
  });

  test("the approval manifest lists each source once, with a boolean approval", () => {
    expect(approval.entries.map((e) => e.source).sort()).toEqual(sources);
    for (const entry of approval.entries) {
      expect(typeof entry.approved).toBe("boolean");
    }
  });

  for (const entry of approval.entries) {
    test(`${entry.source} is approved by a maintainer; set approved to true in test/corpus/mermaid/approval.json`, () => {
      expect(entry.approved).toBe(true);
    });
  }

  for (const file of sources) {
    test(`${file} matches its expected SVG and gives no warning`, async () => {
      const source = readFileSync(join(CORPUS, file), "utf8");
      const expected = readFileSync(join(CORPUS, file.replace(/\.mmd$/, ".expected.svg")), "utf8");
      const r = await renderMermaidSvg(source, {});
      const cmp = compareSvg(r.svg, expected);
      if (!cmp.equal) throw new Error(`${file}: ${cmp.diff}`);
      expect(cmp.equal).toBe(true);
      expect(r.warnings).toEqual([]);
    });
  }
});
