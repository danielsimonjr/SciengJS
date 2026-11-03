import { MAX_SCALE } from "../browser/input.ts";
import { RenderError } from "../errors.ts";
import { readScale, svgDocumentToPng } from "../graph/backend-png.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { readLenient, routesToBrowser, sourceText } from "./common.ts";
import { drawMermaidInBrowser } from "./browser.ts";
import { renderMermaidSvg } from "./render.ts";

/**
 * Renders one Mermaid source to PNG. A native diagram is drawn to SVG and then to PNG by the raster stage.
 * Any other Mermaid type is drawn by a browser screenshot. Both routes take the options lenient and scale. The scale
 * multiplies the pixel size of the diagram. The worker calls this function for the mermaid:png pair.
 */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const source = sourceText(request.source);
  const { scale: _scale, ...rest } = request.options;
  const scale = readScale(request.options);
  if (scale > MAX_SCALE) throw new RenderError("E_INPUT", `option scale must not be more than ${MAX_SCALE}`);
  if (routesToBrowser(source)) {
    readLenient(rest, []);
    const out = await drawMermaidInBrowser(source, "png", request.settings, scale);
    return { bytes: out.bytes, warnings: out.warnings, backend: out.backend };
  }
  const svg = await renderMermaidSvg(source, rest);
  const png = await svgDocumentToPng(svg.svg, request, scale);
  return { bytes: png.bytes, warnings: [...svg.warnings, ...(png.warnings ?? [])] };
}
