import { RenderError } from "../errors.ts";

/** The CAD input formats that occt-import-js reads. */
export type CadFormat = "step" | "iges" | "brep";

/** The linear units that the STEP and IGES readers accept. The default is millimeter. */
export type LinearUnit = "millimeter" | "meter";

/** One face of a mesh. The triangles first to last (inclusive) belong to the face. */
export interface CadFace {
  first: number;
  last: number;
  /** The RGB colour in the range 0 to 1, or null when the face has no colour. */
  color: [number, number, number] | null;
}

/** One mesh of a CAD file, as flat arrays. */
export interface CadMesh {
  name: string;
  /** Vertex positions, three values per vertex. */
  positions: Float32Array;
  /** Vertex normals, three values per vertex, or undefined when the reader gives none. */
  normals: Float32Array | undefined;
  /** Triangle vertex indices, three per triangle. */
  indices: Uint32Array;
  faces: CadFace[];
}

/** The shape of one mesh as occt-import-js returns it. */
interface OcctMesh {
  name: string;
  attributes: { position: { array: number[] }; normal?: { array: number[] } };
  index: { array: number[] };
  brep_faces: { first: number; last: number; color: number[] | null }[];
}

/** The shape of one reader result as occt-import-js returns it. */
interface OcctResult {
  success: boolean;
  meshes: OcctMesh[];
}

/** The reader functions of the loaded WASM module. */
interface Occt {
  ReadStepFile(bytes: Uint8Array, params: { linearUnit: LinearUnit } | null): OcctResult;
  ReadIgesFile(bytes: Uint8Array, params: { linearUnit: LinearUnit } | null): OcctResult;
  ReadBrepFile(bytes: Uint8Array, params: null): OcctResult;
}

/** The name of each reader function, by input format. */
const READER: Record<CadFormat, keyof Occt> = {
  step: "ReadStepFile",
  iges: "ReadIgesFile",
  brep: "ReadBrepFile",
};

/** The one WASM module of this process. It loads once and is shared by every read. */
let occtPromise: Promise<Occt> | undefined;

/** Loads the WASM module once. A failed load clears the cache so that a later read tries again. */
function loadOcct(): Promise<Occt> {
  if (occtPromise === undefined) {
    const started = import("occt-import-js").then(
      (mod) => mod.default({ print: () => {}, printErr: () => {} }) as Promise<Occt>,
    );
    occtPromise = started;
    started.catch(() => {
      if (occtPromise === started) occtPromise = undefined;
    });
  }
  return occtPromise;
}

/** Converts one mesh of the reader to flat typed arrays. */
function toCadMesh(mesh: OcctMesh): CadMesh {
  return {
    name: mesh.name,
    positions: Float32Array.from(mesh.attributes.position.array),
    normals: mesh.attributes.normal === undefined ? undefined : Float32Array.from(mesh.attributes.normal.array),
    indices: Uint32Array.from(mesh.index.array),
    faces: mesh.brep_faces.map((f) => ({
      first: f.first,
      last: f.last,
      color: f.color === null ? null : [f.color[0]!, f.color[1]!, f.color[2]!],
    })),
  };
}

/**
 * Reads a STEP, IGES or BREP file to meshes. The linear unit applies to STEP and IGES only.
 * A file that the reader does not accept rejects with E_INPUT.
 */
export async function readCad(format: CadFormat, bytes: Uint8Array, linearUnit: LinearUnit = "millimeter"): Promise<CadMesh[]> {
  const occt = await loadOcct();
  const read = occt[READER[format]] as (bytes: Uint8Array, params: unknown) => OcctResult;
  const params = format === "brep" ? null : { linearUnit };
  let result: OcctResult;
  try {
    result = read(bytes, params);
  } catch (error) {
    throw new RenderError("E_INPUT", `the ${format} reader failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!result.success) {
    throw new RenderError("E_INPUT", `the ${format} reader did not accept the file`);
  }
  return result.meshes.map(toCadMesh);
}
