import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { sourceText } from "./common.ts";
import { renderMermaidSvg } from "./render.ts";

/** Renders one Mermaid source to SVG. The worker calls this function for the mermaid:svg pair. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const result = await renderMermaidSvg(sourceText(request.source), request.options);
  return { bytes: new TextEncoder().encode(result.svg), warnings: result.warnings };
}
