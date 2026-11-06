import { RenderError } from "../errors.ts";
import { drawSvgToPdf } from "../mermaid/browser.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { readCadRequest } from "./backend-glb.ts";
import { drawCadViews } from "./cad-build.ts";
import { drawingByteLength, layoutViews, writeCadDrawingSvg } from "./drawing.ts";

/** The longest title of the drawing, in characters, and the shortest. */
const TITLE_MAX = 80;

/** Reads the one option of a pdf render: title. An unknown key or a title of the wrong kind rejects with E_INPUT. */
function readTitle(options: Record<string, unknown>, fallback: string): string {
  for (const key of Object.keys(options)) {
    if (key !== "title") throw new RenderError("E_INPUT", `cad to pdf takes no option ${key}`);
  }
  const title = options.title;
  if (title === undefined) return fallback;
  if (typeof title !== "string" || title.length < 1 || title.length > TITLE_MAX) {
    throw new RenderError("E_INPUT", `option title must be a string of 1 to ${TITLE_MAX} characters`);
  }
  return title;
}

/**
 * Draws the SVG of the third-angle drawing of a CAD document. The views come from one solid build. A model that does
 * not fit the sheet at 1:100 keeps that scale and gives a warning. A drawing with no contour rejects with E_INPUT. An
 * output over maxMemoryMb rejects with E_LIMIT before the writer starts.
 */
export async function cadDrawingSvg(request: WorkerJob["request"]): Promise<{ svg: string; warnings: string[] }> {
  const document = readCadRequest(request);
  const title = readTitle(request.options, document.model.name ?? "model");
  const views = await drawCadViews(document, request.settings.maxCadFacets);
  if (views.top.length === 0) throw new RenderError("E_INPUT", "the drawing holds no contour");
  const needed = drawingByteLength(views);
  const limitBytes = Math.floor(request.settings.maxMemoryMb * 1048576);
  if (needed > limitBytes) {
    throw new RenderError("E_LIMIT", "the pdf output needs " + needed + " bytes; the limit is " + limitBytes + " bytes");
  }
  const svg = writeCadDrawingSvg(views, { title });
  const warnings: string[] = [];
  if (!layoutViews(views).fits) warnings.push("the model does not fit the sheet at 1:100");
  if (views.colored) warnings.push("pdf holds no colour; the colours of the model are dropped");
  return { svg, warnings };
}

/** Renders a CAD document to a one-page pdf of the third-angle drawing: the SVG of the drawing, printed in the browser stage. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const { svg, warnings } = await cadDrawingSvg(request);
  const draw = await drawSvgToPdf(svg, request.settings);
  return { bytes: draw.bytes, warnings: [...warnings, ...draw.warnings] };
}
