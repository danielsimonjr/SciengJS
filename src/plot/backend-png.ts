import { readScale, svgDocumentToPng } from "../graph/backend-png.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { plotToSvg } from "./plotter.ts";
import { readPlotOptions } from "./backend-svg.ts";

/** Renders plot to png: the SVG of the figure, then the PNG of that SVG at the option scale. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const { lenient } = readPlotOptions(request.options, ["lenient", "scale"]);
  const scale = readScale(request.options);
  const result = plotToSvg(String(request.source), { lenient });
  const png = await svgDocumentToPng(result.svg, request, scale);
  return { bytes: png.bytes, warnings: [...result.warnings, ...(png.warnings ?? [])] };
}
