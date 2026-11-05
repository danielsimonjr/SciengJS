import { MAX_SCALE } from "../browser/input.ts";
import { RenderError } from "../errors.ts";
import { readScale, svgDocumentToPng } from "../graph/backend-png.ts";
import { sourceText } from "../graph/text.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { renderTikzSvg } from "./stage.ts";

/**
 * Renders one tikz source to PNG: the SVG of the tex stage, then the raster stage. The option scale multiplies the pixel
 * size. The worker calls this function for the tikz:png pair.
 */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const { scale: _scale, ...rest } = request.options;
  const scale = readScale(request.options);
  if (scale > MAX_SCALE) throw new RenderError("E_INPUT", `option scale must not be more than ${MAX_SCALE}`);
  const svg = await renderTikzSvg(sourceText(request.source), rest, request.settings);
  const png = await svgDocumentToPng(svg.svg, request, scale);
  return { bytes: png.bytes, warnings: [...svg.warnings, ...(png.warnings ?? [])] };
}
