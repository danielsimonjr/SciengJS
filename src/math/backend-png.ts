import { RenderError } from "../errors.ts";
import { readScale, svgDocumentToPng } from "../graph/backend-png.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { mathToSvg } from "./tex.ts";

/** Renders math to png: the SVG of the formula, then the PNG of that SVG at the option scale. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  for (const key of Object.keys(request.options)) {
    if (key !== "scale") {
      throw new RenderError("E_INPUT", "math to png takes no option " + key);
    }
  }
  const scale = readScale(request.options);
  const svg = await mathToSvg(String(request.source), { display: true });
  return svgDocumentToPng(svg, request, scale);
}
