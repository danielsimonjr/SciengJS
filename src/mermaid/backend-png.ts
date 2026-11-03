import { svgDocumentToPng } from "../graph/backend-png.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { sourceText } from "./common.ts";
import { renderMermaidSvg } from "./render.ts";

/**
 * Renders one Mermaid source to PNG: the SVG of the diagram, then the PNG of that SVG.
 * The worker calls this function for the mermaid:png pair.
 */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const svg = await renderMermaidSvg(sourceText(request.source), request.options);
  const png = await svgDocumentToPng(svg.svg, request);
  return { bytes: png.bytes, warnings: [...svg.warnings, ...(png.warnings ?? [])] };
}
