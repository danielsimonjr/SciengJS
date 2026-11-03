import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { blockedWarnings, browserPathOf, htmlSource, parsePngOptions } from "./input.ts";
import { renderHtmlPage } from "./render.ts";

/** Renders html to png: a screenshot of the page in the headless browser. The worker calls this function. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const options = parsePngOptions(request.options);
  const browser = browserPathOf(request.settings.browser);
  const out = await renderHtmlPage({
    html: htmlSource(request.source),
    format: "png",
    width: options.width,
    height: options.height,
    scale: options.scale,
    browser,
    timeoutMs: request.settings.timeoutMs,
  });
  return { bytes: out.bytes, warnings: blockedWarnings(out.blocked) };
}
