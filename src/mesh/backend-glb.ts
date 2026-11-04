import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { writeGlb } from "./glb.ts";
import { readCad, type CadFormat, type LinearUnit } from "./read.ts";

/** The linear units that the STEP and IGES readers accept. Each value has one definition, here. */
const LINEAR_UNITS: readonly LinearUnit[] = ["millimeter", "meter"];

/** The default linear unit of the STEP and IGES readers. */
const DEFAULT_LINEAR_UNIT: LinearUnit = "millimeter";

/** The input formats of this backend. */
const FORMATS: readonly CadFormat[] = ["step", "iges", "brep"];

/**
 * Checks the options of a glb render. STEP and IGES take linearUnit. BREP takes no option.
 * An unknown key or an unknown unit rejects with E_INPUT.
 */
export function readMeshOptions(format: CadFormat, options: Record<string, unknown>): { linearUnit: LinearUnit } {
  for (const key of Object.keys(options)) {
    if (format === "brep" || key !== "linearUnit") {
      throw new RenderError("E_INPUT", `${format} to glb takes no option ${key}`);
    }
  }
  const unit = options.linearUnit ?? DEFAULT_LINEAR_UNIT;
  if (!(LINEAR_UNITS as readonly unknown[]).includes(unit)) {
    throw new RenderError("E_INPUT", "option linearUnit must be millimeter or meter");
  }
  return { linearUnit: unit as LinearUnit };
}

/** Renders a STEP, IGES or BREP file to glTF binary. The worker calls this function. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const format = request.type as CadFormat;
  if (!FORMATS.includes(format)) {
    throw new RenderError("E_INPUT", `${request.type} is not a mesh input`);
  }
  if (!(request.source instanceof Uint8Array)) {
    throw new RenderError("E_INPUT", `${format} takes bytes, not text`);
  }
  const { linearUnit } = readMeshOptions(format, request.options);
  const meshes = await readCad(format, request.source, linearUnit);
  const triangles = meshes.reduce((n, m) => n + m.indices.length / 3, 0);
  if (triangles === 0) {
    throw new RenderError("E_INPUT", `the ${format} file holds no triangles`);
  }
  return { bytes: writeGlb(meshes) };
}
