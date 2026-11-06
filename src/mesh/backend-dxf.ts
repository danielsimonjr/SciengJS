import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { readCadRequest } from "./backend-glb.ts";
import { drawCad } from "./cad-build.ts";
import { dxfByteLength, writeDxf } from "./dxf.ts";

/** Reads the options of a dxf render. The one option is z, a finite number. An unknown key rejects with E_INPUT. */
function readZ(options: Record<string, unknown>): number | undefined {
  for (const key of Object.keys(options)) {
    if (key !== "z") throw new RenderError("E_INPUT", `cad to dxf takes no option ${key}`);
  }
  const z = options.z;
  if (z !== undefined && (typeof z !== "number" || !Number.isFinite(z))) {
    throw new RenderError("E_INPUT", "option z must be a finite number");
  }
  return z;
}

/**
 * Renders a CAD document to a DXF drawing in the X-Y plane. The worker calls this function. With no option, the
 * drawing is the outline of the model. The option z gives the section at that height. DXF holds no colour, so
 * the render warns when the model has a colour. An output over maxMemoryMb rejects with E_LIMIT before the
 * writer starts.
 */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const z = readZ(request.options);
  const { contours, colored } = await drawCad(readCadRequest(request), request.settings.maxCadFacets, z);
  if (contours.length === 0) {
    throw new RenderError("E_INPUT", z === undefined ? "the outline holds no contour" : `the drawing at z = ${z} holds no contour`);
  }
  const needed = dxfByteLength(contours);
  const limitBytes = Math.floor(request.settings.maxMemoryMb * 1048576);
  if (needed > limitBytes) {
    throw new RenderError("E_LIMIT", "the dxf output needs " + needed + " bytes; the limit is " + limitBytes + " bytes");
  }
  return {
    bytes: writeDxf(contours),
    warnings: colored ? ["dxf holds no colour and no name; the colours of the model are dropped"] : undefined,
  };
}
