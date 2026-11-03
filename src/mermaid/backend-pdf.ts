import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { readLenient, routesToBrowser, sourceText } from "./common.ts";
import { drawMermaidInBrowser, drawSvgToPdf, MERMAID_NATIVE_PDF_BACKEND } from "./browser.ts";
import { renderMermaidSvg } from "./render.ts";

/**
 * Renders one Mermaid source to pdf in the browser stage. A native diagram is laid out first, then its SVG is
 * drawn. Any other Mermaid type is drawn by the pinned Mermaid build in the page. The worker calls this function.
 */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const source = sourceText(request.source);
  if (routesToBrowser(source)) {
    readLenient(request.options, []);
    const out = await drawMermaidInBrowser(source, "pdf", request.settings);
    return { bytes: out.bytes, warnings: out.warnings, backend: out.backend };
  }
  const svg = await renderMermaidSvg(source, request.options);
  const draw = await drawSvgToPdf(svg.svg, request.settings);
  return { bytes: draw.bytes, warnings: [...svg.warnings, ...draw.warnings], backend: MERMAID_NATIVE_PDF_BACKEND };
}
