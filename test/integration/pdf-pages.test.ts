/**
 * Every pdf that the browser stage prints from one SVG has one page. The test counts the page objects of the pdf
 * and reads the media box of the page. A cad drawing gives one A4 landscape page.
 */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { render } from "../../src/index.ts";
import type { RenderRequest } from "../../src/index.ts";

const browserPath = process.env.SCIENG_BROWSER ?? "";
const haveBrowser = browserPath !== "" && existsSync(browserPath);

// CI must name a browser and must never skip these tests. Locally a missing browser skips them with a reason.
if (process.env.CI && !haveBrowser) {
  throw new Error(`SCIENG_BROWSER must name an existing browser in CI, got "${browserPath}"`);
}
if (!haveBrowser) {
  console.log(`pdf page tests skipped: SCIENG_BROWSER is ${browserPath === "" ? "not set" : `not an existing file (${browserPath})`}`);
}

/** The number of page objects of a pdf, and the media box of each page in points. */
function pagesOf(bytes: Uint8Array): { count: number; boxes: number[][] } {
  const text = Buffer.from(bytes).toString("latin1");
  const count = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
  const boxes = [...text.matchAll(/\/MediaBox\s*\[([^\]]*)\]/g)].map((m) => m[1]!.trim().split(/\s+/).map(Number));
  return { count, boxes };
}

const cube = (size: number[]): string => JSON.stringify({ version: 1, model: { type: "cube", size } });

const CASES: { name: string; request: RenderRequest }[] = [
  { name: "cad", request: { type: "cad", format: "pdf", source: cube([20, 10, 5]) } },
  { name: "dot", request: { type: "dot", format: "pdf", source: "digraph G { a -> b }" } },
  { name: "mermaid", request: { type: "mermaid", format: "pdf", source: "graph TD; A-->B" } },
  { name: "sysml", request: { type: "sysml", format: "pdf", source: "part def A { part b : B; } part def B;" } },
  { name: "math", request: { type: "math", format: "pdf", source: String.raw`\frac{a+b}{c-d}` } },
];

describe.skipIf(!haveBrowser)("pdf of one SVG", () => {
  for (const c of CASES) {
    test(`${c.name} to pdf gives one page`, async () => {
      const out = await render(c.request, { browser: browserPath });
      const pages = pagesOf(out.bytes);
      expect(pages.count).toBe(1);
      expect(pages.boxes.length).toBe(1);
    }, 120000);
  }

  test("a cad drawing is one A4 landscape page, 297 x 210 mm within 0.5 mm", async () => {
    const out = await render(CASES[0]!.request, { browser: browserPath });
    const [box] = pagesOf(out.bytes).boxes;
    const mm = (pt: number): number => (pt * 25.4) / 72;
    expect(Math.abs(mm(box![2]! - box![0]!) - 297)).toBeLessThan(0.5);
    expect(Math.abs(mm(box![3]! - box![1]!) - 210)).toBeLessThan(0.5);
  }, 120000);
});
