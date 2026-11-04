import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { writeGlb } from "./glb.ts";
import { readCad, type CadFormat, type CadMesh, type LinearUnit } from "./read.ts";

/** The linear units that the STEP and IGES readers accept. Each value has one definition, here. */
const LINEAR_UNITS: readonly LinearUnit[] = ["millimeter", "meter"];

/** The default linear unit of the STEP and IGES readers. */
const DEFAULT_LINEAR_UNIT: LinearUnit = "millimeter";

/**
 * The number of copies of the geometry that a glb render holds at its peak: the typed arrays of the
 * reader result, the arrays of the writer, the BIN chunk, and the output file.
 */
export const GLB_COPIES = 4;

/** The largest glb file: the header holds the file length as a 32-bit unsigned integer. */
const MAX_GLB_BYTES = 0xffffffff;

/** The bytes of one copy of the geometry: positions, normals and indices, four bytes per value. */
function geometryBytes(meshes: CadMesh[]): number {
  return meshes.reduce((n, m) => n + 4 * (m.positions.length + (m.normals?.length ?? 0) + m.indices.length), 0);
}

/** Estimates the peak memory of the glb output of the meshes, in bytes, with all copies. */
export function estimateGlbBytes(meshes: CadMesh[]): number {
  return geometryBytes(meshes) * GLB_COPIES;
}

/** Rejects with E_LIMIT when the glb output of the meshes needs more than maxMemoryMb, or more than a glb file can hold. */
function checkGlbLimit(meshes: CadMesh[], maxMemoryMb: number): void {
  const limitBytes = maxMemoryMb * 1048576;
  const needed = estimateGlbBytes(meshes);
  if (needed > limitBytes) {
    throw new RenderError("E_LIMIT", "the glb output needs " + needed + " bytes; the limit is " + limitBytes + " bytes");
  }
  const single = geometryBytes(meshes);
  if (single > MAX_GLB_BYTES) {
    throw new RenderError("E_LIMIT", "the glb geometry has " + single + " bytes; a glb file holds at most " + MAX_GLB_BYTES + " bytes");
  }
}

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

/** The reader of a glb render. A test gives a fake reader. */
export interface GlbDeps {
  readCad: typeof readCad;
}

/**
 * Renders a STEP, IGES or BREP file to glTF binary. The worker calls this function.
 * An output over maxMemoryMb rejects with E_LIMIT before the writer starts.
 */
export async function render(request: WorkerJob["request"], deps: GlbDeps = { readCad }): Promise<BackendOutput> {
  const format = request.type as CadFormat;
  if (!FORMATS.includes(format)) {
    throw new RenderError("E_INPUT", `${request.type} is not a mesh input`);
  }
  if (!(request.source instanceof Uint8Array)) {
    throw new RenderError("E_INPUT", `${format} takes bytes, not text`);
  }
  const { linearUnit } = readMeshOptions(format, request.options);
  const meshes = await deps.readCad(format, request.source, linearUnit);
  const triangles = meshes.reduce((n, m) => n + m.indices.length / 3, 0);
  if (triangles === 0) {
    throw new RenderError("E_INPUT", `the ${format} file holds no triangles`);
  }
  checkGlbLimit(meshes, request.settings.maxMemoryMb);
  return { bytes: writeGlb(meshes) };
}
