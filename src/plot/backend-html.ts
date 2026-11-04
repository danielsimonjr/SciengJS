import { plotlyPageHtml } from "../browser/page.ts";
import { PLOTLY_CDN_URL, PLOTLY_SRI } from "../browser/pinned.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { readPlotOptions } from "./backend-svg.ts";
import { readPlotFigure } from "./reader.ts";

/** Renders plot to html: one standalone page that loads the pinned Plotly build and draws the figure. The page title is the figure title, or "plot". */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const { lenient } = readPlotOptions(request.options, ["lenient"]);
  const { figure, warnings } = readPlotFigure(String(request.source), { lenient });
  const title = (figure.layout.title as { text?: unknown } | undefined)?.text;
  const html = plotlyPageHtml(figure, PLOTLY_CDN_URL, PLOTLY_SRI, typeof title === "string" && title !== "" ? title : "plot");
  return { bytes: new TextEncoder().encode(html), warnings };
}
