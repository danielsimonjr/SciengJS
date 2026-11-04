import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { htmlToMarkdown } from "../../src/html/convert.ts";

const CORPUS = fileURLToPath(new URL("../corpus/html/", import.meta.url));
const NAMES = readdirSync(CORPUS)
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.slice(0, -".html".length))
  .sort();

describe("html corpus", () => {
  test("the corpus holds at least 10 pairs", () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(10);
  });
  for (const name of NAMES) {
    test(`${name}: output is byte-exact with its markdown`, () => {
      const html = readFileSync(`${CORPUS}${name}.html`, "utf8");
      const md = readFileSync(`${CORPUS}${name}.md`, "utf8");
      expect(htmlToMarkdown(html)).toBe(md);
    });
  }
});

describe("htmlToMarkdown focused rules", () => {
  test("empty input gives empty output", () => {
    expect(htmlToMarkdown("")).toBe("");
  });
  test("text special characters are escaped", () => {
    expect(htmlToMarkdown("<p>a_b * c ~d | e</p>")).toBe("a\\_b \\* c \\~d \\| e\n");
  });
  test("whitespace runs collapse to one space", () => {
    expect(htmlToMarkdown("<p>one\n   two\t three</p>")).toBe("one two three\n");
  });
  test("a link inside emphasis keeps both markers", () => {
    expect(htmlToMarkdown('<p><em><a href="u">x</a></em></p>')).toBe("*[x](u)*\n");
  });
  test("an ordered list honours its start attribute", () => {
    expect(htmlToMarkdown('<ol start="4"><li>a</li><li>b</li></ol>')).toBe("4. a\n5. b\n");
  });
  test("a fence grows when the code holds three backticks", () => {
    expect(htmlToMarkdown("<pre><code>x ```y```\n</code></pre>")).toBe("````\nx ```y```\n````\n");
  });
  test("a table cell with align=center uses a centred delimiter", () => {
    expect(htmlToMarkdown('<table><tr><th align="center">c</th></tr></table>')).toBe("| c |\n| :---: |\n");
  });
});
