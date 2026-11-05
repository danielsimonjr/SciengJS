import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { dotToSvg } from "./dot.ts";
import { sourceText } from "./text.ts";

/** Renders dot to svg. The backend takes no options, so any option is an input error. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const names = Object.keys(request.options);
  if (names.length > 0) {
    throw new RenderError("E_INPUT", `dot to svg takes no options; got ${names.join(", ")}`);
  }
  const result = await dotToSvg(sourceText(request.source));
  return { bytes: new TextEncoder().encode(result.svg), warnings: result.warnings };
}
