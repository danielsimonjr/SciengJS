import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { sourceText } from "../mermaid/common.ts";
import { renderSysmlSvg } from "./render.ts";

/** Renders one SysML source to SVG through the graph stage. The worker calls this function for the sysml:svg pair. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const result = await renderSysmlSvg(sourceText(request.source), request.options);
  return { bytes: new TextEncoder().encode(result.svg), warnings: result.warnings };
}
