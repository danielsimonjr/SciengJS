/**
 * The third-angle drawing of a CAD model on one A4 landscape sheet, written as SVG in sheet millimetres. The
 * browser stage prints the SVG to pdf. The writer holds no state: the same views give the same SVG.
 */
import type { CadViews } from "./cad-build.ts";
import { escapeXml } from "./threemf.ts";

/** The sheet in millimetres, and the parts of the sheet. The drawing area is the sheet inside the margins, above the title block. */
export const SHEET = { width: 297, height: 210, margin: 10, gap: 15, title: { width: 90, height: 24 } } as const;

/** The scales of the drawing, the largest first. A scale of 10 draws each millimetre as 10 millimetres on the sheet. */
export const SCALES = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01] as const;

/** The options of the drawing: the title that the title block shows. */
export interface DrawingOptions {
  title: string;
}

/** The area of the views on the sheet: the sheet inside the margins, above the title block. */
const DRAWING_AREA = {
  width: SHEET.width - 2 * SHEET.margin,
  height: SHEET.height - 2 * SHEET.margin - SHEET.title.height,
};

/** The offset of a dimension line from the view it measures, in millimetres. */
const DIMENSION_OFFSET = 6;

/** The line width of the drawing, in millimetres, and the height of the dimension numbers. */
const STROKE = 0.35;
const TEXT_SIZE = 3.5;

/**
 * The largest scale at which the three views fit the drawing area. The width of the views is the front and the right
 * view with the gap between them. The height is the top and the front view with the gap between them. When no scale
 * fits, the result is the smallest scale with fits false.
 */
export function chooseScale(width: number, depth: number, height: number): { scale: number; fits: boolean } {
  for (const scale of SCALES) {
    const fitsWidth = (width + depth) * scale + SHEET.gap <= DRAWING_AREA.width;
    const fitsHeight = (height + depth) * scale + SHEET.gap <= DRAWING_AREA.height;
    if (fitsWidth && fitsHeight) return { scale, fits: true };
  }
  return { scale: SCALES[SCALES.length - 1], fits: false };
}

/** The placement of the views on the sheet. A point of a view maps to a sheet point by these origins and the scale. */
export interface DrawingLayout {
  scale: number;
  fits: boolean;
  /** The sheet x of the left edge of the front view, the top view and the bottom edge of the front view. */
  frontLeft: number;
  frontBottom: number;
  /** The sheet x of the left edge of the right view, and the sheet y of the bottom edge of the top view. */
  rightLeft: number;
  topBottom: number;
  min: number[];
  size: number[];
}

/** Places the three views of the drawing: the front at the bottom left, the top above it and the right to its right. */
export function layoutViews(views: CadViews): DrawingLayout {
  const size = [views.max[0]! - views.min[0]!, views.max[1]! - views.min[1]!, views.max[2]! - views.min[2]!];
  const [width, depth, height] = size as [number, number, number];
  const { scale, fits } = chooseScale(width, depth, height);
  const frontLeft = SHEET.margin + (DRAWING_AREA.width - ((width + depth) * scale + SHEET.gap)) / 2;
  const frontBottom = SHEET.margin + DRAWING_AREA.height;
  const frontTop = frontBottom - height * scale;
  const frontRight = frontLeft + width * scale;
  return {
    scale,
    fits,
    frontLeft,
    frontBottom,
    rightLeft: frontRight + SHEET.gap,
    topBottom: frontTop - SHEET.gap,
    min: [views.min[0]!, views.min[1]!, views.min[2]!],
    size,
  };
}

/** The number of bytes that one point of a view can take at most: two signed coordinates of up to 11 characters, and the markup. */
const BYTES_PER_POINT = 32;

/** The number of bytes that one contour can take at most: the path tag and the indentation. */
const BYTES_PER_CONTOUR = 64;

/** The bytes of the fixed parts of the drawing: the root, the dimensions and the title block, with a title of 80 characters. */
const FIXED_BYTES = 4096;

/**
 * An upper bound of the bytes of the SVG drawing of the views, computed before the writer starts. The bound counts
 * each point and each contour at its largest, plus the fixed parts.
 */
export function drawingByteLength(views: CadViews): number {
  let points = 0;
  let contours = 0;
  for (const group of [views.top, views.front, views.right]) {
    for (const contour of group) {
      contours++;
      points += contour.length;
    }
  }
  return points * BYTES_PER_POINT + contours * BYTES_PER_CONTOUR + FIXED_BYTES;
}

/** A number of the drawing in millimetres, with three decimals at most and no exponent. */
const coordinate = (value: number): string => value.toFixed(3);

/** The number of a dimension: the value in millimetres, with two decimals at most, as a plain number. */
const dimensionText = (value: number): string => String(Number(value.toFixed(2)));

/** The path of one closed contour: its points mapped to sheet millimetres by the map function. */
function contourPath(contour: number[][], map: (point: number[]) => [number, number]): string {
  const parts = contour.map((point, i) => {
    const [x, y] = map(point);
    return `${i === 0 ? "M" : "L"} ${coordinate(x)} ${coordinate(y)}`;
  });
  return `<path d="${parts.join(" ")} Z"/>`;
}

/** The SVG group of one view: each contour is one closed path. A hole is a path of its own. */
function viewGroup(id: string, contours: number[][][], map: (point: number[]) => [number, number]): string {
  const paths = contours.map((contour) => `  ${contourPath(contour, map)}`);
  return `<g id="${id}">\n${paths.join("\n")}\n</g>`;
}

/** A dimension line with its number. The line runs from the start point to the end point, with a tick at each end. */
function dimensionGroup(id: string, from: [number, number], to: [number, number], text: string, label: [number, number]): string {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const line = `<path d="M ${coordinate(x1)} ${coordinate(y1)} L ${coordinate(x2)} ${coordinate(y2)}"/>`;
  const number = `<text x="${coordinate(label[0])}" y="${coordinate(label[1])}" font-size="${TEXT_SIZE}" font-family="sans-serif" text-anchor="middle" fill="#000">${text}</text>`;
  return `<g id="${id}">\n  ${line}\n  ${number}\n</g>`;
}

/** The text of the scale: 5:1 for an enlargement, 1:2 for a reduction. */
function scaleText(scale: number): string {
  return scale >= 1 ? `scale ${scale}:1` : `scale 1:${Math.round(1 / scale)}`;
}

/** The title block at the bottom right: the title, the scale, the unit and the projection. */
function titleBlock(title: string, scale: number): string {
  const left = SHEET.width - SHEET.margin - SHEET.title.width;
  const top = SHEET.height - SHEET.margin - SHEET.title.height;
  const lines = [title, scaleText(scale), "units mm", "third angle"];
  const texts = lines.map((line, i) => {
    const size = i === 0 ? 4.5 : TEXT_SIZE;
    return `  <text x="${coordinate(left + 3)}" y="${coordinate(top + 7 + i * 5.5)}" font-size="${size}" font-family="sans-serif" fill="#000">${escapeXml(line)}</text>`;
  });
  const frame = `<rect x="${coordinate(left)}" y="${coordinate(top)}" width="${SHEET.title.width}" height="${SHEET.title.height}"/>`;
  return `<g id="title-block">\n  ${frame}\n${texts.join("\n")}\n</g>`;
}

/**
 * Writes the drawing of the three views as one SVG document in sheet millimetres. The front view is drawn with Z up
 * and X to the right. The top view is above the front view, and the right view is to the right of the front view.
 * The Y axis of the model goes up in the top view and to the right in the right view, so no coordinate is swapped.
 */
export function writeCadDrawingSvg(views: CadViews, options: DrawingOptions): string {
  const layout = layoutViews(views);
  const { scale, frontLeft, frontBottom, rightLeft, topBottom, min, size } = layout;
  const [width, depth, height] = size as [number, number, number];
  const frontRight = frontLeft + width * scale;
  const frontTop = frontBottom - height * scale;
  const rightRight = rightLeft + depth * scale;

  // Front view: (x, z) with Z up. The sheet y falls as the model z rises.
  const front = (p: number[]): [number, number] => [frontLeft + (p[0]! - min[0]!) * scale, frontBottom - (p[1]! - min[2]!) * scale];
  // Top view: (x, y) with Y up. The sheet y falls as the model y rises.
  const top = (p: number[]): [number, number] => [frontLeft + (p[0]! - min[0]!) * scale, topBottom - (p[1]! - min[1]!) * scale];
  // Right view: (y, z) with Y to the right and Z up.
  const right = (p: number[]): [number, number] => [rightLeft + (p[0]! - min[1]!) * scale, frontBottom - (p[1]! - min[2]!) * scale];

  const dimWidth = dimensionGroup(
    "dim-width",
    [frontLeft, frontBottom + DIMENSION_OFFSET],
    [frontRight, frontBottom + DIMENSION_OFFSET],
    dimensionText(width),
    [(frontLeft + frontRight) / 2, frontBottom + DIMENSION_OFFSET + 4],
  );
  const topTop = topBottom - depth * scale;
  const dimDepth = dimensionGroup(
    "dim-depth",
    [frontRight + DIMENSION_OFFSET, topBottom],
    [frontRight + DIMENSION_OFFSET, topTop],
    dimensionText(depth),
    [frontRight + DIMENSION_OFFSET + 3, (topBottom + topTop) / 2],
  );
  const dimHeight = dimensionGroup(
    "dim-height",
    [rightRight + DIMENSION_OFFSET, frontBottom],
    [rightRight + DIMENSION_OFFSET, frontTop],
    dimensionText(height),
    [rightRight + DIMENSION_OFFSET + 3, (frontBottom + frontTop) / 2],
  );

  const body = [
    viewGroup("view-top", views.top, top),
    viewGroup("view-front", views.front, front),
    viewGroup("view-right", views.right, right),
    dimWidth,
    dimDepth,
    dimHeight,
    titleBlock(options.title, scale),
  ].join("\n");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET.width}mm" height="${SHEET.height}mm" viewBox="0 0 ${SHEET.width} ${SHEET.height}">`,
    `<g fill="none" stroke="#000" stroke-width="${STROKE}">`,
    body,
    "</g>",
    "</svg>",
    "",
  ].join("\n");
}
