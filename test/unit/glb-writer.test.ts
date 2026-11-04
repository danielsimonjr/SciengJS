// Tests of the glTF binary writer on hand-built meshes, and of the independent reader on broken files.
// No test here loads the WASM reader, so the mutation audit of src/mesh/glb.ts runs fast.
import { describe, expect, test } from "bun:test";
import { writeGlb } from "../../src/mesh/glb.ts";
import type { CadFace, CadMesh } from "../../src/mesh/read.ts";
import { readGlb } from "../support/glb-reader.ts";
import { rejection, returned } from "../support/rejections.ts";

const RED: [number, number, number] = [1, 0, 0];
const BLUE: [number, number, number] = [0, 0, 0.5];

/** A mesh of four triangles over eight vertices. Each vertex has a unique position, x = vertex number times xScale. */
function quadMesh(name: string, faces: CadFace[], withNormals = true, xScale = 1): CadMesh {
  const positions = new Float32Array(8 * 3);
  for (let v = 0; v < 8; v++) positions.set([v * xScale, -v * 2, v * 0.5 + 1], v * 3);
  const normals = new Float32Array(8 * 3);
  for (let v = 0; v < 8; v++) normals.set([0, 0, 1], v * 3);
  return {
    name,
    positions,
    normals: withNormals ? normals : undefined,
    indices: Uint32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 4, 6]),
    faces,
  };
}

const THREE_FACES: CadFace[] = [
  { first: 0, last: 0, color: RED },
  { first: 1, last: 2, color: BLUE },
  { first: 3, last: 3, color: null },
];

/** The triangles of a primitive, as lists of the x coordinates (the vertex numbers) of its corners. */
function cornersOf(p: { positions: Float32Array; indices: Uint32Array }): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < p.indices.length; i += 3) {
    out.push([0, 1, 2].map((k) => p.positions[p.indices[i + k]! * 3]!));
  }
  return out;
}

// The writer and the reader run inside returned(), so that a throw of either fails as an assertion.
const read = (meshes: CadMesh[]) => returned(() => readGlb(writeGlb(meshes)));

/** The header and chunk fields of a GLB file, read without the reader under test. */
function layout(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const binAt = 20 + jsonLength;
  return {
    magic: view.getUint32(0, true),
    version: view.getUint32(4, true),
    length: view.getUint32(8, true),
    jsonLength,
    jsonType: view.getUint32(16, true),
    binLength: view.getUint32(binAt, true),
    binType: view.getUint32(binAt + 4, true),
    binAt,
    jsonText: new TextDecoder().decode(bytes.subarray(20, binAt)),
  };
}

describe("writeGlb on hand-built meshes", () => {
  test("each primitive holds the triangles of one colour, with its exact vertices and material", () => {
    const doc = read([quadMesh("part", THREE_FACES)]);
    expect(doc.primitives.length).toBe(3);
    expect(doc.materials.map((m) => m.baseColorFactor)).toEqual([[1, 0, 0, 1], [0, 0, 0.5, 1], [0.8, 0.8, 0.8, 1]]);
    expect(doc.materials.map((m) => m.name)).toEqual(["face 1,0,0", "face 0,0,0.5", "default"]);
    expect(doc.primitives.map((p) => p.material)).toEqual([0, 1, 2]);
    expect(cornersOf(doc.primitives[0]!)).toEqual([[0, 1, 2]]);
    expect(cornersOf(doc.primitives[1]!)).toEqual([[3, 4, 5], [6, 7, 0]]);
    expect(cornersOf(doc.primitives[2]!)).toEqual([[2, 4, 6]]);
    expect(Array.from(doc.primitives[1]!.indices)).toEqual([3, 4, 5, 6, 7, 0]);
    for (const p of doc.primitives) expect(p.normals?.length).toBe(24);
    const mat = doc.json.materials[2].pbrMetallicRoughness;
    expect(mat.metallicFactor).toBe(0);
    expect(mat.roughnessFactor).toBe(1);
  });

  test("the POSITION accessor holds the exact min and max of the vertices", () => {
    const doc = read([quadMesh("part", THREE_FACES)]);
    const accessor = doc.json.accessors[doc.json.meshes[0].primitives[0].attributes.POSITION];
    expect(accessor.min).toEqual([0, -14, 1]);
    expect(accessor.max).toEqual([7, 0, 4.5]);
    expect(accessor.count).toBe(8);
    expect(accessor.componentType).toBe(5126);
  });

  test("the POSITION min and max are exact when every coordinate is below zero", () => {
    const mesh = quadMesh("part", []);
    mesh.positions = mesh.positions.map((v) => -v - 10);
    const doc = read([mesh]);
    const accessor = doc.json.accessors[doc.json.meshes[0].primitives[0].attributes.POSITION];
    expect(accessor.min).toEqual([-17, -10, -14.5]);
    expect(accessor.max).toEqual([-10, 4, -11]);
  });

  test("a face range past the last triangle stops at the last triangle", () => {
    const doc = read([quadMesh("part", [{ first: 2, last: 99, color: RED }])]);
    expect(doc.primitives.map((p) => cornersOf(p))).toEqual([[[0, 1, 2], [3, 4, 5]], [[6, 7, 0], [2, 4, 6]]]);
  });

  test("a mesh without normals has no NORMAL attribute", () => {
    const doc = read([quadMesh("part", [], false)]);
    expect(doc.json.meshes[0].primitives[0].attributes.NORMAL).toBeUndefined();
    expect(doc.primitives[0]!.normals).toBeUndefined();
  });

  test("two meshes give two nodes in the scene, and the second mesh has its own accessors", () => {
    const doc = read([quadMesh("a", []), quadMesh("b", [{ first: 0, last: 3, color: RED }])]);
    expect(doc.json.scenes[0].nodes).toEqual([0, 1]);
    expect(doc.json.nodes).toEqual([{ mesh: 0, name: "a" }, { mesh: 1, name: "b" }]);
    expect(doc.json.accessors.length).toBe(6);
    expect(cornersOf(doc.primitives[1]!)).toEqual([[0, 1, 2], [3, 4, 5], [6, 7, 0], [2, 4, 6]]);
    expect(doc.primitives[1]!.material).toBe(1);
  });

  test("the header, the chunk types and the JSON padding are correct for each JSON length", () => {
    const residues = new Set<number>();
    // The x maximum occurs once in the JSON text. Each power of ten adds one character, so the four runs give each length modulo 4.
    for (const xScale of [1, 10, 100, 1000]) {
      const bytes = returned(() => writeGlb([quadMesh("p", THREE_FACES, true, xScale)]));
      const l = layout(bytes);
      expect(l.magic).toBe(0x46546c67);
      expect(l.version).toBe(2);
      expect(l.length).toBe(bytes.byteLength);
      expect(l.jsonType).toBe(0x4e4f534a);
      expect(l.binType).toBe(0x004e4942);
      expect(l.jsonLength % 4).toBe(0);
      expect(l.binAt + 8 + l.binLength).toBe(bytes.byteLength);
      const text = l.jsonText.trimEnd();
      const pad = l.jsonText.length - text.length;
      expect(pad).toBeLessThan(4);
      expect(l.jsonText.slice(text.length)).toBe(" ".repeat(pad));
      residues.add(text.length % 4);
      expect(JSON.parse(text).buffers[0].byteLength).toBe(l.binLength);
    }
    expect(residues.size).toBe(4);
  });

  test("a mesh with no triangles is left out, with no accessor of its own", () => {
    const empty: CadMesh = { name: "empty", positions: Float32Array.from([1, 2, 3]), normals: undefined, indices: new Uint32Array(0), faces: [] };
    const doc = read([empty, quadMesh("part", [])]);
    expect(doc.json.meshes.length).toBe(1);
    expect(doc.json.accessors.length).toBe(3);
    expect(doc.json.nodes).toEqual([{ mesh: 0, name: "part" }]);
  });

  test("no mesh, or no triangle at all, rejects with E_INPUT", () => {
    expect(rejection(() => writeGlb([])).code).toBe("E_INPUT");
    const empty: CadMesh = { name: "empty", positions: new Float32Array(0), normals: undefined, indices: new Uint32Array(0), faces: [] };
    expect(rejection(() => writeGlb([empty])).code).toBe("E_INPUT");
  });
});

describe("the test reader rejects broken files", () => {
  const good = () => returned(() => writeGlb([quadMesh("pp", THREE_FACES)]));
  const setU32 = (b: Uint8Array, at: number, v: number) => new DataView(b.buffer, b.byteOffset).setUint32(at, v, true);

  /** Replaces one ASCII string of the JSON chunk with another string of the same length. */
  function patchJson(bytes: Uint8Array, from: string, to: string): Uint8Array {
    expect(to.length).toBe(from.length);
    const l = layout(bytes);
    const at = l.jsonText.indexOf(from);
    expect(at).toBeGreaterThanOrEqual(0);
    const out = bytes.slice();
    out.set(new TextEncoder().encode(to), 20 + at);
    return out;
  }

  test("the good file reads", () => {
    expect(returned(() => readGlb(good())).primitives.length).toBe(3);
  });

  test("a JSON padding byte that is not a space", () => {
    const b = good();
    const l = layout(b);
    expect(l.jsonText.endsWith(" ")).toBe(true);
    b[l.binAt - 1] = 0;
    expect(() => readGlb(b)).toThrow(/JSON chunk/);
  });

  test("a BIN padding byte that is not zero", () => {
    // The writer gives no BIN padding, because every element has four bytes. Shrink buffer 0 to make padding.
    const b = good();
    const l = layout(b);
    const declared = `"buffers":[{"byteLength":${l.binLength}}]`;
    const shrunk = `"buffers":[{"byteLength":${l.binLength - 1}}]`;
    const patched = patchJson(b, declared, shrunk);
    expect(() => readGlb(patched.slice())).toThrow(/buffer view runs past/);
    patched[patched.byteLength - 1] = 7;
    expect(() => readGlb(patched)).toThrow(/padding byte is not zero/);
  });

  test("a header length off by 4", () => {
    const b = good();
    setU32(b, 8, b.byteLength + 4);
    expect(() => readGlb(b)).toThrow(/header length/);
  });

  test("a chunk length off by 4", () => {
    const b = good();
    setU32(b, layout(b).binAt, layout(b).binLength + 4);
    expect(() => readGlb(b)).toThrow(/past the end/);
  });

  test("an index out of range", () => {
    const b = good();
    const doc = readGlb(b);
    const accessor = doc.json.accessors[doc.json.meshes[0].primitives[0].indices];
    const view = doc.json.bufferViews[accessor.bufferView];
    setU32(b, layout(b).binAt + 8 + view.byteOffset, 8);
    expect(() => readGlb(b)).toThrow(/outside 8 vertices/);
  });

  test("a POSITION min that does not match the data", () => {
    expect(() => readGlb(patchJson(good(), `"min":[0,-14,1]`, `"min":[0,-14,2]`))).toThrow(/min or max/);
  });

  test("a normal that is not unit length", () => {
    const b = good();
    const doc = readGlb(b);
    const accessor = doc.json.accessors[doc.json.meshes[0].primitives[0].attributes.NORMAL];
    const view = doc.json.bufferViews[accessor.bufferView];
    new DataView(b.buffer, b.byteOffset).setFloat32(layout(b).binAt + 8 + view.byteOffset + 8, 2, true);
    expect(() => readGlb(b)).toThrow(/unit length/);
  });

  test("two materials with the same colour", () => {
    expect(() => readGlb(patchJson(good(), `[0,0,0.5,1]`, `[1,0,0.0,1]`))).toThrow(/same colour/);
  });

  test("a default scene that does not exist", () => {
    expect(() => readGlb(patchJson(good(), `"scene":0`, `"scene":5`))).toThrow(/default scene/);
  });

  test("a node that names a mesh that does not exist", () => {
    expect(() => readGlb(patchJson(good(), `{"mesh":0,`, `{"mesh":4,`))).toThrow(/names a mesh/);
  });

  test("the first chunk is not JSON", () => {
    const b = good();
    setU32(b, 16, 0x004e4942);
    expect(() => readGlb(b)).toThrow(/first chunk/);
  });
});
