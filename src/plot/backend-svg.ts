import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { plotToSvg } from "./plotter.ts";

/** Reads the plot options. The only key is lenient, a boolean. Any other key rejects with E_INPUT. */
export function readPlotOptions(options: Record<string, unknown>, allowed: readonly string[]): { lenient: boolean } {
  for (const key of Object.keys(options)) {
    if (!allowed.includes(key)) throw new RenderError("E_INPUT", "plot takes no option " + key);
  }
  const lenient = options.lenient;
  if (lenient !== undefined && typeof lenient !== "boolean") {
    throw new RenderError("E_INPUT", "option lenient must be true or false");
  }
  return { lenient: lenient === true };
}

/** Renders plot to svg. The options are lenient only. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const { lenient } = readPlotOptions(request.options, ["lenient"]);
  const result = plotToSvg(String(request.source), { lenient });
  return { bytes: new TextEncoder().encode(result.svg), warnings: result.warnings };
}
