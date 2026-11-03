import { svgDocumentToPng } from "../graph/backend-png.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { readLenient, routesToBrowser, sourceText } from "./common.ts";
import { drawMermaidInBrowser } from "./browser.ts";
import { renderMermaidSvg } from "./render.ts";

/**
 * Renders one Mermaid source to PNG. A native diagram is drawn to SVG and then to PNG by the raster stage.
 * Any other Mermaid type is drawn by a browser screenshot. The worker calls this function for the mermaid:png pair.
 */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const source = sourceText(request.source);
  if (routesToBrowser(source)) {
    readLenient(request.options, []);
    const out = await drawMermaidInBrowser(source, "png", request.settings);
    return { bytes: out.bytes, warnings: out.warnings, backend: out.backend };
  }
  const svg = await renderMermaidSvg(source, request.options);
  const png = await svgDocumentToPng(svg.svg, request);
  return { bytes: png.bytes, warnings: [...svg.warnings, ...(png.warnings ?? [])] };
}
