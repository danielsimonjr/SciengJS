import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { readCadRequest } from "./backend-glb.ts";
import { measureCad } from "./cad-build.ts";
import type { DfmOptions } from "./dfm.ts";
import { DFM_DEFAULTS, writeDfmReport } from "./dfm.ts";

/** Reads the options of a report: overhang (degrees, between 0 and 90), minWall and minGap (millimetres, larger than 0). */
function readDfmOptions(options: Record<string, unknown>): DfmOptions {
  for (const key of Object.keys(options)) {
    if (key !== "overhang" && key !== "minWall" && key !== "minGap") throw new RenderError("E_INPUT", `cad to md takes no option ${key}`);
  }
  const { overhang = DFM_DEFAULTS.overhang, minWall = DFM_DEFAULTS.minWall, minGap = DFM_DEFAULTS.minGap } = options;
  if (typeof overhang !== "number" || !(overhang > 0 && overhang < 90)) {
    throw new RenderError("E_INPUT", "option overhang must be a number larger than 0 and smaller than 90");
  }
  if (typeof minWall !== "number" || !Number.isFinite(minWall) || minWall <= 0) {
    throw new RenderError("E_INPUT", "option minWall must be a finite number larger than 0");
  }
  if (typeof minGap !== "number" || !Number.isFinite(minGap) || minGap <= 0) {
    throw new RenderError("E_INPUT", "option minGap must be a finite number larger than 0");
  }
  return { overhang, minWall, minGap };
}

/**
 * Renders a CAD document to a Markdown report of the design for manufacture. The worker calls this function.
 * The report gives the measures of the model, the overhang check, the wall check and the gap check. A failed check does not
 * reject the render.
 */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const options = readDfmOptions(request.options);
  const measures = await measureCad(readCadRequest(request), request.settings.maxCadFacets, options.minWall, options.minGap);
  return { bytes: writeDfmReport(measures, options) };
}
