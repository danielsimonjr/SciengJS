/** The mesh stage: STEP, IGES and BREP through occt-import-js, CAD documents through manifold-3d, and the glTF and STL writers. */
export { readCad } from "./read.ts";
export type { CadFormat, CadFace, CadMesh, LinearUnit } from "./read.ts";
export { writeGlb } from "./glb.ts";
export { readMeshOptions } from "./backend-glb.ts";
export { writeStl } from "./stl.ts";
export { checkCadDocument, parseCadDocument, DEFAULT_SEGMENTS, MAX_SEGMENTS, MIN_SEGMENTS } from "./cad-document.ts";
export type * from "./cad-document.ts";
export { buildCad } from "./cad-build.ts";
export type { CadBuildResult } from "./cad-build.ts";
export * as cad from "./cad-builder.ts";
