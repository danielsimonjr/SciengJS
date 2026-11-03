import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { readLenient, routesToBrowser, sourceText } from "./common.ts";
import { drawMermaidInBrowser } from "./browser.ts";
import { renderMermaidSvg } from "./render.ts";

/**
 * Renders one Mermaid source to SVG. A native diagram goes through the native layouts. Any other Mermaid type goes
 * through the browser stage. The worker calls this function for the mermaid:svg pair.
 */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const source = sourceText(request.source);
  if (routesToBrowser(source)) {
    readLenient(request.options, []);
    const out = await drawMermaidInBrowser(source, "svg", request.settings);
    return { bytes: out.bytes, warnings: out.warnings, backend: out.backend };
  }
  const result = await renderMermaidSvg(source, request.options);
  return { bytes: new TextEncoder().encode(result.svg), warnings: result.warnings };
}
