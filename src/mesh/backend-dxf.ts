import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { type GlbDeps, readCadRequest, readMeshes } from "./backend-glb.ts";
import { drawCad, drawMeshes } from "./cad-build.ts";
import { dxfByteLength, writeDxf } from "./dxf.ts";

/** Reads the options of a dxf render. The one option is z, a finite number. An unknown key rejects with E_INPUT. */
function readZ(type: string, options: Record<string, unknown>): number | undefined {
  for (const key of Object.keys(options)) {
    if (key !== "z") throw new RenderError("E_INPUT", `${type} to dxf takes no option ${key}`);
  }
  const z = options.z;
  if (z !== undefined && (typeof z !== "number" || !Number.isFinite(z))) {
    throw new RenderError("E_INPUT", "option z must be a finite number");
  }
  return z;
}

/**
 * Renders a CAD document, or a STEP, IGES or BREP file, to a DXF drawing in the X-Y plane. The worker calls this
 * function. With no option, the drawing is the outline of the solid. The option z gives the section at that height.
 * DXF holds no colour, so the render warns when the model has a colour. An output over maxMemoryMb rejects with
 * E_LIMIT before the writer starts. The deps give the readers of a STEP, IGES or BREP file; a test gives fake readers.
 */
export async function render(request: WorkerJob["request"], deps: Partial<GlbDeps> = {}): Promise<BackendOutput> {
  const z = readZ(request.type, request.options);
  const { maxCadFacets } = request.settings;
  const { contours, colored } =
    request.type === "cad"
      ? await drawCad(readCadRequest(request), maxCadFacets, z)
      : await drawMeshes(await readMeshes({ ...request, options: {} }, deps), maxCadFacets, z);
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
