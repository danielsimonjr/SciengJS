import { sourceText } from "../graph/text.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { renderTikzSvg } from "./stage.ts";

/** Renders one tikz source to SVG through the tex stage. The worker calls this function for the tikz:svg pair. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const result = await renderTikzSvg(sourceText(request.source), request.options, request.settings);
  return { bytes: new TextEncoder().encode(result.svg), warnings: result.warnings };
}
