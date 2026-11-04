import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { htmlToMarkdown } from "../../src/html/convert.ts";
import { convertPage } from "../../src/html/md.ts";
import type { FetchImage } from "../../src/html/images.ts";

const CORPUS = fileURLToPath(new URL("../corpus/html/", import.meta.url));
const PNG_B64 = Buffer.from(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])).toString("base64");

describe("text escapes at the start of a block", () => {
  test("an ordered marker is escaped", () => {
    expect(htmlToMarkdown("<p>1. one</p>")).toBe("1\\. one\n");
    expect(htmlToMarkdown("<p>2) two</p>")).toBe("2\\) two\n");
  });
  test("a dash, a plus, a hash and a quote marker are escaped", () => {
    expect(htmlToMarkdown("<p>- a</p>")).toBe("\\- a\n");
    expect(htmlToMarkdown("<p>+ a</p>")).toBe("\\+ a\n");
    expect(htmlToMarkdown("<p># a</p>")).toBe("\\# a\n");
    expect(htmlToMarkdown("<p>&gt; a</p>")).toBe("\\> a\n");
  });
  test("a marker after a hard break is escaped", () => {
    expect(htmlToMarkdown("<p>x<br>1. y</p>")).toBe("x\\\n1\\. y\n");
    expect(htmlToMarkdown("<p>x<br>\n- y</p>")).toBe("x\\\n\\- y\n");
    expect(htmlToMarkdown("<p>x<br>===</p>")).toBe("x\\\n\\===\n");
  });
  test("a marker inside a line is not escaped", () => {
    expect(htmlToMarkdown("<p>a 1. b - c + d # e</p>")).toBe("a 1. b - c + d # e\n");
  });
  test("a list item that starts with a marker is escaped", () => {
    expect(htmlToMarkdown("<ul><li>1. x</li></ul>")).toBe("- 1\\. x\n");
  });
  test("a dollar sign is escaped", () => {
    expect(htmlToMarkdown("<p>a $x$ b</p>")).toBe("a \\$x\\$ b\n");
  });
  test("an ampersand before an entity form is escaped", () => {
    expect(htmlToMarkdown("<p>&amp;lt; &amp;#38; &amp;#x26; a &amp; b</p>")).toBe("\\&lt; \\&#38; \\&#x26; a & b\n");
  });
  test("a code span and a fence are never escaped", () => {
    expect(htmlToMarkdown("<p><code>1. $x &amp;lt; |</code></p>")).toBe("`1. $x &lt; |`\n");
    expect(htmlToMarkdown("<pre><code>- a\n$x &amp;lt;</code></pre>")).toBe("```\n- a\n$x &lt;\n```\n");
  });
  test("a code span with a newline puts a space in its place", () => {
    expect(htmlToMarkdown("<p><code>a\n1. b</code></p>")).toBe("`a 1. b`\n");
  });
});

describe("block content in a list item", () => {
  test("paragraphs make a loose list", () => {
    expect(htmlToMarkdown("<ul><li><p>one</p><p>two</p></li><li><p>three</p></li></ul>")).toBe(
      "- one\n\n  two\n\n- three\n",
    );
  });
  test("a code block is indented under its item", () => {
    expect(htmlToMarkdown("<ol><li>run<pre><code>x\ny</code></pre></li></ol>")).toBe(
      "1. run\n\n   ```\n   x\n   y\n   ```\n",
    );
  });
  test("a blockquote and a nested list are indented under the item", () => {
    expect(htmlToMarkdown("<ul><li><p>a</p><blockquote><p>q</p></blockquote><ul><li>b</li></ul></li></ul>")).toBe(
      "- a\n\n  > q\n\n  - b\n",
    );
  });
  test("a tight list with a nested list stays tight", () => {
    expect(htmlToMarkdown("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>")).toBe("- a\n  - b\n- c\n");
  });
});

describe("table cells", () => {
  test("a pipe is escaped in text and in a code span", () => {
    expect(htmlToMarkdown("<table><tr><th>h</th></tr><tr><td><code>x|y</code> p|q</td></tr></table>")).toBe(
      "| h |\n| --- |\n| `x\\|y` p\\|q |\n",
    );
  });
  test("a br in a cell becomes a literal br with no backslash", () => {
    expect(htmlToMarkdown("<table><tr><th>h</th></tr><tr><td>a<br>b</td></tr></table>")).toBe(
      "| h |\n| --- |\n| a<br>b |\n",
    );
  });
});

describe("links, images and emphasis", () => {
  test("a destination with a space or a paren is wrapped in angle brackets", () => {
    expect(htmlToMarkdown('<p><a href="a b(c).html">t</a></p>')).toBe("[t](<a b(c).html>)\n");
    expect(htmlToMarkdown('<p><img alt="i" src="p q.png"></p>')).toBe("![i](<p q.png>)\n");
  });
  test("a plain destination is not wrapped", () => {
    expect(htmlToMarkdown('<p><a href="https://x.test/a">t</a></p>')).toBe("[t](https://x.test/a)\n");
  });
  test("brackets in link text and alt text are escaped", () => {
    expect(htmlToMarkdown('<p><a href="u">[x]</a></p>')).toBe("[\\[x\\]](u)\n");
    expect(htmlToMarkdown('<p><img alt="a]b[c" src="u"></p>')).toBe("![a\\]b\\[c](u)\n");
  });
  test("the spaces at the edges of emphasis move outside the markers", () => {
    expect(htmlToMarkdown("<p>x<strong> a </strong>b</p>")).toBe("x **a** b\n");
    expect(htmlToMarkdown("<p><em>a </em>b</p>")).toBe("*a* b\n");
  });
  test("an empty code span gives nothing, a space-only code span keeps its spaces", () => {
    expect(htmlToMarkdown("<p>a<code></code>b</p>")).toBe("ab\n");
    expect(htmlToMarkdown("<p>a<code> </code>b</p>")).toBe("a` `b\n");
  });
  test("a code span with spaces at both edges gets padding", () => {
    expect(htmlToMarkdown("<p><code> a </code></p>")).toBe("`  a  `\n");
    expect(htmlToMarkdown("<p><code>`a</code></p>")).toBe("`` `a ``\n");
  });
  test("a data-scieng-type that is not a plain word falls back to the inferred type", () => {
    const html = '<div data-scieng-type="x\n```y" data-scieng-source="s"><pre class="mermaid"></pre></div>';
    expect(htmlToMarkdown(html)).toBe("```mermaid\ns\n```\n");
  });
  test("a data-scieng-type of letters, digits, _, + and - is kept", () => {
    expect(htmlToMarkdown('<div data-scieng-type="c_x+1-y" data-scieng-source="s"></div>')).toBe("```c_x+1-y\ns\n```\n");
  });
});

describe("page assets and images", () => {
  test("an image asset and an svg asset have different names", async () => {
    const html = `<p><img src="data:image/png;base64,${PNG_B64}"></p><p><svg><circle r="1"/></svg></p>`;
    const page = await convertPage(html, { downloadImages: true, allowNetwork: "none" });
    const names = page.assets.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(["image-1.png", "image-2.svg"]);
    expect(page.markdown).toBe("![](image-1.png)\n\n![](image-2.svg)\n");
  });
  test("an image that the Markdown does not emit is not fetched", async () => {
    const calls: string[] = [];
    const fetchImage: FetchImage = async (url) => {
      calls.push(url);
      return { bytes: new Uint8Array([1]), mime: "image/png" };
    };
    const html =
      '<head><noscript><img src="https://x.test/h.png"></noscript></head><body>' +
      '<noscript><img src="https://x.test/n.png"></noscript>' +
      '<template><img src="https://x.test/t.png"></template>' +
      '<script>document.write(\'<img src="https://x.test/s.png">\')</script>' +
      '<div data-scieng-source="s"><img src="https://x.test/b.png"></div>' +
      '<p><img src="https://x.test/ok.png"></p></body>';
    const page = await convertPage(html, { downloadImages: true, allowNetwork: "tex-bundles,images", fetchImage });
    expect(calls).toEqual(["https://x.test/ok.png"]);
    expect(page.assets.map((a) => a.name)).toEqual(["image-1.png"]);
  });
  test("a URL that is not http or https is never fetched and gives a warning", async () => {
    const calls: string[] = [];
    const fetchImage: FetchImage = async (url) => {
      calls.push(url);
      return { bytes: new Uint8Array([1]), mime: "image/png" };
    };
    const urls = ["//host.test/a.png", "file:///etc/passwd", "ftp://host.test/a.png"];
    const html = urls.map((u) => `<p><img alt="a" src="${u}"></p>`).join("");
    const page = await convertPage(html, { downloadImages: true, allowNetwork: "tex-bundles,images", fetchImage });
    expect(calls).toEqual([]);
    expect(page.warnings).toHaveLength(3);
    urls.forEach((u, i) => expect(page.warnings[i]).toContain(u));
    for (const u of urls) expect(page.markdown).toContain(u);
  });
  test("an upper-case HTTP scheme is fetched", async () => {
    const calls: string[] = [];
    const fetchImage: FetchImage = async (url) => {
      calls.push(url);
      return { bytes: new Uint8Array([1]), mime: "image/png" };
    };
    const page = await convertPage('<p><img src="HTTP://x.test/a.png"></p>', {
      downloadImages: true,
      allowNetwork: "tex-bundles,images",
      fetchImage,
    });
    expect(calls).toEqual(["HTTP://x.test/a.png"]);
    expect(page.markdown).toBe("![](image-1.png)\n");
  });
});

describe("a page from the real render_html writer", () => {
  test("each fenced source is exact, in order, under its heading", () => {
    const md = htmlToMarkdown(readFileSync(`${CORPUS}render-html-six.html`, "utf8"));
    const headings = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual(["Flow", "Graph", "Eq", "Plot", "Wave", "Raw"]);
    const fences = [...md.matchAll(/^```(\S*)\n([\s\S]*?)\n```$/gm)].map((m) => [m[1], m[2]]);
    expect(fences).toEqual([
      ["mermaid", 'graph TD\n  A["a < b & c"] --> B'],
      ["dot", 'digraph G { a -> b [label="x<y"]; }'],
      ["latex", "E = mc^2 \\quad a<b"],
      ["plotly", '{"data":[{"x":[0,1],"y":[1,0]}],"layout":{}}'],
      ["wavedrom", '{ "signal": [{ "name": "clk", "wave": "p..." }] }'],
      ["html", '<p>raw `tick` & "q"</p>'],
    ]);
    const blocks = md.trimEnd().split("\n\n");
    expect(blocks.filter((b) => b.startsWith("## ")).length).toBe(6);
    for (let i = 0; i < 6; i += 1) expect(blocks[2 * i + 1]?.startsWith("```")).toBe(true);
  });
});
