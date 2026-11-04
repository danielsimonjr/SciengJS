// Runs under Node 22 against the BUILT package (dist/). It proves that the math stage works in plain
// Node: a direct import of dist/math, and the svg and png formats through the public render().
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "..", "dist");
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SOURCES = ["\\frac{a}{b}", "\\ce{A -> B}"];

test("node imports dist/math and renders each source to an svg with paths only", async () => {
  const { mathToSvg } = await import(pathToFileURL(join(dist, "math", "index.js")).href);
  for (const source of SOURCES) {
    const svg = await mathToSvg(source, { display: true });
    assert.ok(svg.startsWith("<svg"), source);
    assert.match(svg, /<path/, source);
    assert.doesNotMatch(svg, /<text|font-family/, source);
  }
});

for (const source of SOURCES) {
  test(`node renders ${source} to svg and png through render()`, async () => {
    const { render } = await import(pathToFileURL(join(dist, "index.js")).href);
    const svg = await render({ type: "math", source, format: "svg" });
    assert.ok(new TextDecoder().decode(svg.bytes).startsWith("<svg"));
    const png = await render({ type: "math", source, format: "png", options: { scale: 2 } });
    assert.equal(png.mime, "image/png");
    assert.deepEqual([...png.bytes.slice(0, 8)], PNG_SIGNATURE);
  });
}
