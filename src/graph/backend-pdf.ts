import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { drawSvgToPdf } from "../mermaid/browser.ts";
import { dotSourceText, dotToSvg } from "./dot.ts";

/** Renders dot to pdf: the SVG of the graph, then the pdf of that SVG in the browser stage. The backend takes no options. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const names = Object.keys(request.options ?? {});
  if (names.length > 0) {
    throw new RenderError("E_INPUT", `dot to pdf takes no options; got ${names.join(", ")}`);
  }
  const dot = await dotToSvg(dotSourceText(request.source));
  const draw = await drawSvgToPdf(dot.svg, request.settings);
  return { bytes: draw.bytes, warnings: [...dot.warnings, ...draw.warnings], backend: "graph/viz+browser/chromium" };
}
