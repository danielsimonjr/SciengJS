import { sourceText } from "../graph/text.ts";
import { drawSvgToPdf } from "../mermaid/browser.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { renderTikzSvg } from "./stage.ts";

/** Renders one tikz source to pdf: the SVG of the tex stage, then the pdf of that SVG in the browser stage. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const svg = await renderTikzSvg(sourceText(request.source), request.options, request.settings);
  const draw = await drawSvgToPdf(svg.svg, request.settings);
  return { bytes: draw.bytes, warnings: [...svg.warnings, ...draw.warnings] };
}
