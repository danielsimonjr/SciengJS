import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { writeGlb } from "./glb.ts";
import { buildCad } from "./cad-build.ts";
import { parseCadDocument } from "./cad-document.ts";
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

/** The readers of a mesh render. A test gives a fake reader. */
export interface GlbDeps {
  readCad: typeof readCad;
  buildCad: typeof buildCad;
}

const DEFAULT_DEPS: GlbDeps = { readCad, buildCad };

/**
 * Reads the meshes of a mesh render. A CAD document is JSON text, checked against the node and facet limits and
 * built through manifold-3d. A CAD render takes no option. STEP, IGES and BREP are bytes, read through occt-import-js.
 * A source with no triangles rejects with E_INPUT.
 */
export async function readMeshes(request: WorkerJob["request"], deps: Partial<GlbDeps> = {}): Promise<CadMesh[]> {
  const d = { ...DEFAULT_DEPS, ...deps };
  let meshes: CadMesh[];
  if (request.type === "cad") {
    if (typeof request.source !== "string") throw new RenderError("E_INPUT", "cad takes JSON text, not bytes");
    for (const key of Object.keys(request.options)) throw new RenderError("E_INPUT", `cad takes no option ${key}`);
    const { maxCadNodes, maxCadFacets } = request.settings;
    const checked = parseCadDocument(request.source, { maxNodes: maxCadNodes, maxFacets: maxCadFacets });
    meshes = [(await d.buildCad(checked.document, maxCadFacets)).mesh];
  } else {
    const format = request.type as CadFormat;
    if (!FORMATS.includes(format)) {
      throw new RenderError("E_INPUT", `${request.type} is not a mesh input`);
    }
    if (!(request.source instanceof Uint8Array)) {
      throw new RenderError("E_INPUT", `${format} takes bytes, not text`);
    }
    const { linearUnit } = readMeshOptions(format, request.options);
    meshes = await d.readCad(format, request.source, linearUnit);
  }
  const triangles = meshes.reduce((n, m) => n + m.indices.length / 3, 0);
  if (triangles === 0) {
    throw new RenderError("E_INPUT", `the ${request.type} source holds no triangles`);
  }
  return meshes;
}

/**
 * Renders a CAD document, or a STEP, IGES or BREP file, to glTF binary. The worker calls this function.
 * An output over maxMemoryMb rejects with E_LIMIT before the writer starts.
 */
export async function render(request: WorkerJob["request"], deps: Partial<GlbDeps> = {}): Promise<BackendOutput> {
  const meshes = await readMeshes(request, deps);
  checkGlbLimit(meshes, request.settings.maxMemoryMb);
  return { bytes: writeGlb(meshes) };
}
