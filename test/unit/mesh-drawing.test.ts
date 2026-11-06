/**
 * `cad` to `pdf`: the one-page third-angle drawing (design section "CAD"). The views come from one solid build.
 * The test reads the SVG with its own path and text reader, and measures the contours itself (point in contour by
 * the even-odd rule, bounding boxes and the shoelace formula), so it does not trust the writer.
 */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cadDrawingSvg, render as renderPdf } from "../../src/mesh/backend-pdf.ts";
import { drawCadViews } from "../../src/mesh/cad-build.ts";
import type { CadViews } from "../../src/mesh/cad-build.ts";
import { parseCadDocument } from "../../src/mesh/cad-document.ts";
import { SHEET, chooseScale, drawingByteLength, writeCadDrawingSvg } from "../../src/mesh/drawing.ts";
import { findPair } from "../../src/pairs.ts";
import { DEFAULT_REGISTRY } from "../../src/registry.ts";
import type { WorkerJob } from "../../src/worker/protocol.ts";
import { rejectionOf } from "../support/rejections.ts";
import { testSettings } from "../support/settings.ts";

const MAX_FACETS = 2000000;
const BROWSER = process.env.SCIENG_BROWSER ?? "";

/** Parses a CSG document object with the reader that the render uses. */
function documentOf(doc: unknown) {
  return parseCadDocument(JSON.stringify(doc), { maxNodes: 1000, maxFacets: MAX_FACETS }).document;
}

const request = (doc: unknown, options: Record<string, unknown> = {}, settings = testSettings()): WorkerJob["request"] =>
  ({ type: "cad", format: "pdf", source: JSON.stringify(doc), options, settings }) as WorkerJob["request"];

/** A 20 x 10 x 2 plate with a through hole of radius 2 at (10, 5), and a 4 x 4 boss of height 3 on top. */
const PLATE = {
  version: 1,
  segments: 64,
  model: {
    type: "union",
    children: [
      {
        type: "difference",
        children: [
          { type: "cube", size: [20, 10, 2] },
          { type: "translate", offset: [10, 5, -1], child: { type: "cylinder", radius: 2, height: 4 } },
        ],
      },
      { type: "translate", offset: [1, 1, 2], child: { type: "cube", size: [4, 4, 3] } },
    ],
  },
};

/** The even-odd test: a point is inside when a ray to the right crosses an odd number of contour edges. */
function inside(contours: number[][][], x: number, y: number): boolean {
  let crossings = 0;
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i++) {
      const [x1, y1] = contour[i]!;
      const [x2, y2] = contour[(i + 1) % contour.length]!;
      if (y1! > y !== y2! > y && x < ((x2! - x1!) * (y - y1!)) / (y2! - y1!) + x1!) crossings++;
    }
  }
  return crossings % 2 === 1;
}

/** The signed area of a closed contour by the shoelace formula. */
const area = (points: number[][]): number => {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    sum += x1! * y2! - x2! * y1!;
  }
  return sum / 2;
};

/** The bounding box of a list of points. */
function boxOf(points: number[][]): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: Math.min(...points.map((p) => p[0]!)),
    maxX: Math.max(...points.map((p) => p[0]!)),
    minY: Math.min(...points.map((p) => p[1]!)),
    maxY: Math.max(...points.map((p) => p[1]!)),
  };
}

/** The body of one group of the SVG drawing, from its opening tag to its closing tag. */
function groupBody(svg: string, id: string): string {
  const start = svg.indexOf(`<g id="${id}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  return svg.slice(start, svg.indexOf("</g>", start));
}

/** The closed paths of one group of the drawing, each a list of [x, y] sheet points. */
function groupPaths(svg: string, id: string): number[][][] {
  return [...groupBody(svg, id).matchAll(/<path d="([^"]*)"/g)].map((m) => {
    const values = (m[1]!.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const points: number[][] = [];
    for (let i = 0; i + 1 < values.length; i += 2) points.push([values[i]!, values[i + 1]!]);
    return points;
  });
}

/** The text of the elements of one group of the drawing. */
function groupTexts(svg: string, id: string): string[] {
  return [...groupBody(svg, id).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!);
}

/** Draws the three views of a document, and the SVG of the drawing with a fixed title. */
async function viewsOf(doc: unknown): Promise<CadViews> {
  return drawCadViews(documentOf(doc), MAX_FACETS);
}

describe("cad to pdf views", () => {
  test("T1 orientation: the front shows X and Z, the right shows Y and Z, the top shows X and Y", async () => {
    const views = await viewsOf(PLATE);
    expect(views.min.map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0, 0]);
    expect(views.max.map((v) => Math.round(v * 1000) / 1000)).toEqual([20, 10, 5]);

    const top = views.top.map((c) => ({ area: Math.abs(area(c)), contour: c })).sort((a, b) => b.area - a.area);
    expect(top).toHaveLength(2);
    expect(top[0]!.area).toBeCloseTo(200, 3);
    expect(top[1]!.area).toBeCloseTo(Math.PI * 4, 1);

    const frontBox = boxOf(views.front.flat());
    expect(frontBox.minX).toBeCloseTo(0, 3);
    expect(frontBox.maxX).toBeCloseTo(20, 3);
    expect(frontBox.minY).toBeCloseTo(0, 3);
    expect(frontBox.maxY).toBeCloseTo(5, 3);
    expect(inside(views.front, 3, 4)).toBe(true);
    expect(inside(views.front, 15, 4)).toBe(false);

    const rightBox = boxOf(views.right.flat());
    expect(rightBox.minX).toBeCloseTo(0, 3);
    expect(rightBox.maxX).toBeCloseTo(10, 3);
    expect(rightBox.minY).toBeCloseTo(0, 3);
    expect(rightBox.maxY).toBeCloseTo(5, 3);
    expect(inside(views.right, 3, 4)).toBe(true);
    expect(inside(views.right, 8, 4)).toBe(false);
  });
});

describe("cad to pdf drawing", () => {
  test("T2 the top view holds the outline and the hole; the front and right views hold one contour each", async () => {
    const svg = writeCadDrawingSvg(await viewsOf(PLATE), { title: "plate" });
    expect(groupPaths(svg, "view-top")).toHaveLength(2);
    expect(groupPaths(svg, "view-front")).toHaveLength(1);
    expect(groupPaths(svg, "view-right")).toHaveLength(1);
  });

  test("T3 the top view is above the front view, the right view is right of it, and the gaps are 15 mm", async () => {
    const svg = writeCadDrawingSvg(await viewsOf(PLATE), { title: "plate" });
    const top = boxOf(groupPaths(svg, "view-top").flat());
    const front = boxOf(groupPaths(svg, "view-front").flat());
    const right = boxOf(groupPaths(svg, "view-right").flat());
    expect(top.minX).toBeCloseTo(front.minX, 2);
    expect(right.minX - front.maxX).toBeGreaterThanOrEqual(15 - 0.01);
    expect(right.maxY).toBeCloseTo(front.maxY, 2);
    expect(front.minY - top.maxY).toBeGreaterThanOrEqual(15 - 0.01);
  });

  test("T4 chooseScale takes the largest scale that fits, and warns at 1:100 when no scale fits", () => {
    expect(chooseScale(20, 10, 5)).toEqual({ scale: 5, fits: true });
    expect(chooseScale(300, 200, 100).scale).toBe(0.5);
    expect(chooseScale(1000, 1000, 1000).scale).toBe(0.05);
    expect(chooseScale(200, 62, 89)).toEqual({ scale: 1, fits: true });
    expect(chooseScale(1e6, 1e6, 1e6)).toEqual({ scale: 0.01, fits: false });
  });

  test("T5 the dimensions are the size of the solid in millimetres, in the three views", async () => {
    const plate = writeCadDrawingSvg(await viewsOf(PLATE), { title: "plate" });
    expect(groupTexts(plate, "dim-width")).toEqual(["20"]);
    expect(groupTexts(plate, "dim-depth")).toEqual(["10"]);
    expect(groupTexts(plate, "dim-height")).toEqual(["5"]);
    const block = { version: 1, segments: 64, model: { type: "cube", size: [12.5, 3.25, 1] } };
    const svg = writeCadDrawingSvg(await viewsOf(block), { title: "block" });
    expect(groupTexts(svg, "dim-width")).toEqual(["12.5"]);
    expect(groupTexts(svg, "dim-depth")).toEqual(["3.25"]);
    expect(groupTexts(svg, "dim-height")).toEqual(["1"]);
  });

  test("T6 the title is escaped, the default title is the model name, and the title block gives the scale, units and projection", async () => {
    const views = await viewsOf(PLATE);
    const escaped = writeCadDrawingSvg(views, { title: "A<B" });
    expect(escaped).toContain("A&lt;B");
    expect(escaped).not.toContain("A<B");
    const svg = writeCadDrawingSvg(views, { title: "plate" });
    expect(svg).toContain("scale 5:1");
    expect(svg).toContain("units mm");
    expect(svg).toContain("third angle");
    const unnamed = await cadDrawingSvg(request({ version: 1, segments: 64, model: { type: "cube", size: [1, 1, 1] } }));
    expect(unnamed.svg).toContain(">model<");
    const named = await cadDrawingSvg(request({ version: 1, segments: 64, model: { type: "cube", size: [1, 1, 1], name: "bracket" } }));
    expect(named.svg).toContain(">bracket<");
    expect(SHEET.width).toBe(297);
    expect(SHEET.height).toBe(210);
  });

  test("T7 an unknown option, a non-string title and a title of the wrong length reject with E_INPUT", async () => {
    const unknown = await rejectionOf(cadDrawingSvg(request(PLATE, { foo: 1 })));
    expect(unknown.code).toBe("E_INPUT");
    expect(unknown.message).toBe("cad to pdf takes no option foo");
    for (const title of [5, "", "x".repeat(81)]) {
      const err = await rejectionOf(cadDrawingSvg(request(PLATE, { title })));
      expect(err.code).toBe("E_INPUT");
      expect(err.message).toBe("option title must be a string of 1 to 80 characters");
    }
  });

  test("T7b a model with no solid has no contour and rejects with E_INPUT", async () => {
    const empty = {
      version: 1,
      segments: 64,
      model: {
        type: "intersection",
        children: [
          { type: "cube", size: [1, 1, 1] },
          { type: "translate", offset: [5, 0, 0], child: { type: "cube", size: [1, 1, 1] } },
        ],
      },
    };
    const err = await rejectionOf(cadDrawingSvg(request(empty)));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toBe("the drawing holds no contour");
  });

  test("T8 findPair maps cad to pdf to the browser stage, and the registry module exists", () => {
    expect(findPair("cad", "pdf")?.stage).toBe("browser");
    const entry = DEFAULT_REGISTRY["cad:pdf"];
    expect(entry).toBeDefined();
    expect(existsSync(fileURLToPath(entry!.moduleUrl))).toBe(true);
    expect(entry!.backend).toBe("mesh/manifold+drawing+browser/chromium");
  });

  test("T9 the byte bound is at least the size of the SVG, and a limit below the bound rejects with E_LIMIT", async () => {
    const views = await viewsOf(PLATE);
    const svg = writeCadDrawingSvg(views, { title: "plate" });
    expect(drawingByteLength(views)).toBeGreaterThanOrEqual(Buffer.byteLength(svg));
    const fine = await viewsOf({ ...PLATE, segments: 512 });
    expect(drawingByteLength(fine)).toBeGreaterThanOrEqual(Buffer.byteLength(writeCadDrawingSvg(fine, { title: "plate" })));
    const err = await rejectionOf(cadDrawingSvg(request(PLATE, {}, testSettings({ maxMemoryMb: 0.0001 }))));
    expect(err.code).toBe("E_LIMIT");
  });

  test("T10 the same model gives the same SVG", async () => {
    const first = await cadDrawingSvg(request(PLATE));
    const second = await cadDrawingSvg(request(PLATE));
    expect(second.svg).toBe(first.svg);
  });

  test("T10b a coloured model gives the colour warning", async () => {
    const coloured = { version: 1, segments: 64, model: { type: "cube", size: [1, 2, 3], color: [1, 0, 0] } };
    const out = await cadDrawingSvg(request(coloured));
    expect(out.warnings).toContain("pdf holds no colour; the colours of the model are dropped");
  });

  test.skipIf(!BROWSER)("T11 integration: the render prints a pdf of the drawing", async () => {
    const out = await renderPdf(request(PLATE, {}, testSettings({ browser: BROWSER })));
    expect(Buffer.from(out.bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(out.bytes.length).toBeGreaterThan(1000);
  });
});
