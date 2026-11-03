import { expect, test } from "bun:test";
import { mermaidPageHtml, scriptJson, svgPageHtml } from "../../src/browser/page.ts";

test("scriptJson escapes a closing script tag so that the source cannot end the page script", () => {
  const text = scriptJson("A --> B</script><script>alert(1)");
  expect(text).not.toContain("</script>");
  expect(text).not.toContain("<");
  expect(JSON.parse(text)).toBe("A --> B</script><script>alert(1)");
});

test("scriptJson escapes the line and paragraph separators, which a JSON string may hold raw", () => {
  const text = scriptJson("a\u2028b\u2029c");
  expect(text).not.toContain("\u2028");
  expect(text).not.toContain("\u2029");
  expect(JSON.parse(text)).toBe("a\u2028b\u2029c");
});

test("svgPageHtml puts the diagram in the named host element with no margin", () => {
  const html = svgPageHtml("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  expect(html).toContain("<div id=\"sciengjs-diagram\"><svg");
  expect(html).toContain("margin:0");
});

test("mermaidPageHtml loads the pinned URL, renders the source with strict security and reports the result", () => {
  const url = "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js";
  const html = mermaidPageHtml("flowchart LR\nA --> B</script>", url);
  expect(html).toContain(`<script src="${url}"></script>`);
  expect(html).toContain("securityLevel: \"strict\"");
  expect(html).toContain("window.__sciengDone");
  expect(html).not.toContain("B</script>");
});

test("mermaidPageHtml reports an internal fault when the pinned build did not load", () => {
  const html = mermaidPageHtml("flowchart LR\nA --> B", "https://example.invalid/m.js");
  expect(html).toContain('typeof mermaid === "undefined"');
  expect(html).toContain("internal: true");
});

test("mermaidPageHtml escapes an HTML comment opener in the source", () => {
  const html = mermaidPageHtml("flowchart LR\nA[\"<!-- x\"] --> B", "https://example.invalid/m.js");
  expect(html).not.toContain("<!--");
});

test("scriptJson writes each escaped character as a four-digit unicode escape inside a JSON string", () => {
  expect(scriptJson('<a>&"\u2028')).toBe(String.raw`"\u003ca\u003e\u0026\"\u2028"`);
});
