import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { plotToSvg } from "../../src/plot/plotter.ts";
import { xmlErrors } from "../support/xml-wellformed.ts";

const CORPUS = fileURLToPath(new URL("../corpus/plot/", import.meta.url));
const NAMES = ["line", "markers", "bode", "two-subplots", "shapes-text", "legend"];

describe("plot corpus", () => {
  for (const name of NAMES) {
    test(`${name}: output is byte-exact with its expected svg and is well formed`, () => {
      const source = readFileSync(`${CORPUS}${name}.json`, "utf8");
      const expected = readFileSync(`${CORPUS}${name}.expected.svg`, "utf8");
      const svg = plotToSvg(source).svg;
      expect(svg).toBe(expected);
      expect(xmlErrors(svg)).toEqual([]);
    });
  }
});

describe("the line endings of the corpus", () => {
  test("git keeps the corpus files byte for byte, so a CRLF checkout keeps the byte-exact compare", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const file = "test/corpus/plot/line.expected.svg";
    const run = spawnSync("git", ["check-attr", "text", "--", file], { cwd: root, encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`${file}: text: unset
`);
  });
});
