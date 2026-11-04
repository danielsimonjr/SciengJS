import { RenderError } from "../errors.ts";
import { drawSvgToPdf } from "../mermaid/browser.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { mathToSvg } from "./tex.ts";

/** Renders math to pdf: the SVG of the formula, then the pdf of that SVG in the browser stage. The backend takes no options. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const names = Object.keys(request.options);
  if (names.length > 0) {
    throw new RenderError("E_INPUT", "math to pdf takes no options; got " + names.join(", "));
  }
  const svg = await mathToSvg(String(request.source), { display: true });
  const draw = await drawSvgToPdf(svg, request.settings);
  return { bytes: draw.bytes, warnings: draw.warnings, backend: "math/mathjax+browser/chromium" };
}
