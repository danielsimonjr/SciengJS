import { drawSvgToPdf } from "../mermaid/browser.ts";
import { sourceText } from "../graph/text.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { renderSysmlSvg } from "./render.ts";

/** Renders one SysML source to pdf: the SVG of the view, then the pdf of that SVG in the browser stage. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const svg = await renderSysmlSvg(sourceText(request.source), request.options);
  const draw = await drawSvgToPdf(svg.svg, request.settings);
  return { bytes: draw.bytes, warnings: [...svg.warnings, ...draw.warnings] };
}

