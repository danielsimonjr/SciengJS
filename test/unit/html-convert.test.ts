import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convertHtml, htmlToMarkdown } from "../../src/html/convert.ts";

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

function attrEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sciengBlock(source: string, inner: string, type?: string): string {
  const typeAttr = type === undefined ? "" : ` data-scieng-type="${type}"`;
  return `<div class="scieng-block"${typeAttr} data-scieng-source="${attrEscape(source)}">${inner}</div>`;
}

function fenceOf(language: string, source: string): string {
  const longest = Math.max(0, ...(source.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${source}\n${fence}\n`;
}

const SCIENG_CASES = [
  { language: "mermaid", inner: '<pre class="mermaid">graph LR</pre>', source: 'graph LR\n  A["x < y & z"] --> B' },
  { language: "dot", inner: '<div id="dot-1"><svg></svg></div>', source: 'digraph G { a -> "b\\"q" }' },
  { language: "latex", inner: '<div class="latex-block"><span>x</span></div>', source: "x_{\\alpha} = a & `tick`" },
  { language: "plotly", inner: '<div id="plotly-2"></div>', source: '{"data":[{"y":[1,2]}],"layout":{"title":"a & b"}}' },
  { language: "wavedrom", inner: '<div class="wavedrom-block"></div>', source: '{ signal: [{ name: "clk", wave: "p." }] }' },
  { language: "html", inner: "<p>INNER-ONLY</p>", source: '<p class="x">a &amp; ```b```\n<i>c</i></p>' },
];

describe("data-scieng-source round trip", () => {
  for (const c of SCIENG_CASES) {
    test(`${c.language} block keeps its exact source`, () => {
      expect(htmlToMarkdown(sciengBlock(c.source, c.inner))).toBe(fenceOf(c.language, c.source));
    });
  }
  test("the inner markup is not descended", () => {
    expect(htmlToMarkdown(sciengBlock("graph LR", '<pre class="mermaid">INNERTEXT</pre>'))).not.toContain("INNERTEXT");
  });
  test("data-scieng-type overrides the inferred type", () => {
    expect(htmlToMarkdown(sciengBlock("a -> b", '<pre class="mermaid">x</pre>', "dot"))).toBe(fenceOf("dot", "a -> b"));
  });
  test("a section keeps its h2 as a heading before the fence", () => {
    const html = `<section>\n<h2>Results</h2>\n${sciengBlock("graph LR", '<pre class="mermaid">x</pre>')}\n</section>`;
    expect(htmlToMarkdown(html)).toBe(`## Results\n\n${fenceOf("mermaid", "graph LR")}`);
  });
  test("the corpus page holds the round trip", () => {
    const html = `<section><h2>Flow</h2>${sciengBlock("graph LR\n  A-->B", '<pre class="mermaid">x</pre>')}</section>`;
    expect(htmlToMarkdown(html)).toContain("```mermaid\ngraph LR\n  A-->B\n```");
  });
});

describe("MathML", () => {
  test("inline math with a TeX annotation becomes $TEX$", () => {
    const html = '<p>Energy <math><semantics><mi>E</mi><annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math> here</p>';
    expect(htmlToMarkdown(html)).toBe("Energy $E=mc^2$ here\n");
  });
  test("display math with a TeX annotation becomes its own $$TEX$$ block", () => {
    const html = '<p>Before</p><math display="block"><semantics><mi>x</mi><annotation encoding="application/x-tex">\\int_0^1 x\\,dx</annotation></semantics></math>';
    expect(htmlToMarkdown(html)).toBe("Before\n\n$$\\int_0^1 x\\,dx$$\n");
  });
  test("math without an annotation keeps its text", () => {
    expect(htmlToMarkdown("<p><math><mi>x</mi><mo>+</mo><mn>1</mn></math></p>")).toBe("x+1\n");
  });
  test("display math without an annotation keeps its text as a block", () => {
    expect(htmlToMarkdown('<math display="block"><mi>y</mi></math>')).toBe("y\n");
  });
});

describe("inline SVG assets", () => {
  test("an inline svg becomes image-1.svg and an image link", () => {
    const result = convertHtml('<p>Before <svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg></p>');
    expect(result.markdown).toBe("Before ![](image-1.svg)\n");
    expect(result.assets.map((a) => a.name)).toEqual(["image-1.svg"]);
    expect(result.assets[0]?.mediaType).toBe("image/svg+xml");
  });
  test("the asset holds the serialized svg with xmlns added", () => {
    const [asset] = convertHtml('<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>').assets;
    expect(asset?.data).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(asset?.data)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"></rect></svg>',
    );
  });
  test("an existing xmlns is kept once", () => {
    const [asset] = convertHtml('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>').assets;
    expect(new TextDecoder().decode(asset?.data).match(/xmlns=/g)).toHaveLength(1);
  });
  test("two svgs are numbered in document order", () => {
    const result = convertHtml("<svg></svg><p><svg></svg></p>");
    expect(result.markdown).toBe("![](image-1.svg)\n\n![](image-2.svg)\n");
    expect(result.assets.map((a) => a.name)).toEqual(["image-1.svg", "image-2.svg"]);
  });
  test("assetPrefix prefixes the link path", () => {
    expect(convertHtml("<svg></svg>", { assetPrefix: "assets/" }).markdown).toBe("![](assets/image-1.svg)\n");
  });
  test("an svg inside a scieng block is not an asset", () => {
    const result = convertHtml(sciengBlock("a -> b", '<div id="dot-1"><svg></svg></div>'));
    expect(result.assets).toHaveLength(0);
  });
});
