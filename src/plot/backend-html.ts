import { plotlyPageHtml } from "../browser/page.ts";
import { PLOTLY_CDN_URL, PLOTLY_SRI } from "../browser/pinned.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { readPlotOptions } from "./backend-svg.ts";
import { readPlotFigure } from "./reader.ts";

/** Renders plot to html: one standalone page that loads the pinned Plotly build and draws the figure. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const { lenient } = readPlotOptions(request.options, ["lenient"]);
  const { figure, warnings } = readPlotFigure(String(request.source), { lenient });
  const html = plotlyPageHtml(figure, PLOTLY_CDN_URL, PLOTLY_SRI);
  return { bytes: new TextEncoder().encode(html), warnings };
}
