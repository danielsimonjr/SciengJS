import type { CadMesh } from "./read.ts";

/** The bytes of the STL header. */
const HEADER_BYTES = 80;
/** The bytes of one facet: a normal, three vertices (12 floats) and an attribute word. */
const FACET_BYTES = 50;

/** The text of the STL header. A binary STL header must not start with "solid". */
const HEADER_TEXT = "binary STL from sciengjs";

/** The number of facets of the meshes. */
export function stlFacetCount(meshes: CadMesh[]): number {
  return meshes.reduce((n, m) => n + m.indices.length / 3, 0);
}

/** The size of the binary STL file of the meshes, in bytes. */
export function stlByteLength(meshes: CadMesh[]): number {
  return HEADER_BYTES + 4 + FACET_BYTES * stlFacetCount(meshes);
}

/**
 * Writes the meshes as one binary STL file, little-endian. Each facet normal comes from the vertices of the facet
 * (right-hand rule). STL holds no colour and no name, so the writer drops them.
 */
export function writeStl(meshes: CadMesh[]): Uint8Array {
  const bytes = new Uint8Array(stlByteLength(meshes));
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode(HEADER_TEXT));
  view.setUint32(HEADER_BYTES, stlFacetCount(meshes), true);
  let at = HEADER_BYTES + 4;
  for (const mesh of meshes) {
    const p = mesh.positions;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [mesh.indices[t]! * 3, mesh.indices[t + 1]! * 3, mesh.indices[t + 2]! * 3];
      const u = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!];
      const v = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
      const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const length = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
      for (const value of [n[0]! / length, n[1]! / length, n[2]! / length]) {
        view.setFloat32(at, value, true);
        at += 4;
      }
      for (const vertex of [a, b, c]) {
        for (let k = 0; k < 3; k++) {
          view.setFloat32(at, p[vertex + k]!, true);
          at += 4;
        }
      }
      view.setUint16(at, 0, true);
      at += 2;
    }
  }
  return bytes;
}
