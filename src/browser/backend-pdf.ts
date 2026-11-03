import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { blockedWarnings, browserPathOf, htmlSource, parsePdfOptions } from "./input.ts";
import { renderHtmlPage } from "./render.ts";

/** Renders html to pdf through Page.printToPDF in the headless browser. The worker calls this function. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  parsePdfOptions(request.options);
  const browser = browserPathOf(request.settings.browser);
  const out = await renderHtmlPage({
    html: htmlSource(request.source),
    format: "pdf",
    browser,
    timeoutMs: request.settings.timeoutMs,
  });
  return { bytes: out.bytes, warnings: blockedWarnings(out.blocked) };
}
