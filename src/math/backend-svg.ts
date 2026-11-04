import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { mathToSvg } from "./tex.ts";

/** Renders math to svg. The backend takes no options, so any option is an input error. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const names = Object.keys(request.options);
  if (names.length > 0) {
    throw new RenderError("E_INPUT", "math to svg takes no options; got " + names.join(", "));
  }
  const svg = await mathToSvg(String(request.source), { display: true });
  return { bytes: new TextEncoder().encode(svg), warnings: [] };
}
