import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { instance } from "@viz-js/viz";
import { dotToSvg } from "../../src/graph/dot.ts";
import { compareSvg } from "../support/svg-compare.ts";

const CORPUS = fileURLToPath(new URL("../corpus/dot", import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL("../../package.json", import.meta.url));
const sources = readdirSync(CORPUS).filter((f) => f.endsWith(".dot")).sort();

/** The warnings that a source gives on purpose. A source with no entry gives none. */
const EXPECTED_WARNINGS: Record<string, string[]> = {
  "unicode.dot": [
    "graphviz warning: Warning: no value for width of non-ASCII character 206. Falling back to width of space character",
  ],
};

describe("DOT corpus", () => {
  test("every source has an expected SVG, and every expected SVG has a source", () => {
    const expected = readdirSync(CORPUS).filter((f) => f.endsWith(".expected.svg")).sort();
    expect(sources.map((f) => f.replace(/\.dot$/, ".expected.svg"))).toEqual(expected);
  });

  test("the corpus holds at least eight sources", () => {
    expect(sources.length).toBeGreaterThanOrEqual(8);
  });

  test("the expected files come from the pinned @viz-js/viz version", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@viz-js/viz"]).toBe("3.31.0");
  });

  for (const file of sources) {
    test(`${file} matches its expected SVG`, async () => {
      const source = readFileSync(join(CORPUS, file), "utf8");
      const expected = readFileSync(join(CORPUS, file.replace(/\.dot$/, ".expected.svg")), "utf8");
      // Graphviz gives its non-ASCII width warning once for each viz instance, so each source gets a new instance.
      const r = await dotToSvg(source, () => instance());
      const cmp = compareSvg(r.svg, expected);
      if (!cmp.equal) throw new Error(`${file}: ${cmp.diff}`);
      expect(cmp.equal).toBe(true);
      expect(r.warnings).toEqual(EXPECTED_WARNINGS[file] ?? []);
    });
  }
});
