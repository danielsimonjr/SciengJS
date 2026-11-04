import { RenderError } from "../errors.ts";
import type { CadFace, CadMesh } from "./read.ts";

const MAGIC = 0x46546c67; // "glTF"
const VERSION = 2;
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN" and a zero byte
const COMPONENT_UINT32 = 5125;
const COMPONENT_FLOAT32 = 5126;
const MODE_TRIANGLES = 4;
const DEFAULT_COLOUR: [number, number, number] = [0.8, 0.8, 0.8];

/** One material of the output. */
interface Material {
  name: string;
  colour: [number, number, number];
}

/** One buffer view and its accessor, as they go into the JSON chunk. */
interface Accessor {
  bytes: Uint8Array;
  componentType: number;
  type: "VEC3" | "SCALAR";
  count: number;
  min?: number[];
  max?: number[];
}

/** Maps each triangle of a mesh to the key of its material: a colour, or "default". */
function triangleGroups(mesh: CadMesh): Map<string, number[]> {
  const triangles = mesh.indices.length / 3;
  const keyOf = new Array<string>(triangles).fill("default");
  for (const face of mesh.faces as CadFace[]) {
    if (face.color === null) continue;
    const key = face.color.join(",");
    for (let t = face.first; t <= face.last && t < triangles; t++) keyOf[t] = key;
  }
  const groups = new Map<string, number[]>();
  for (let t = 0; t < triangles; t++) {
    const key = keyOf[t]!;
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [t]);
    else list.push(t);
  }
  return groups;
}

/** Packs a typed array as the bytes of one buffer view. */
function bytesOf(array: ArrayBufferView): Uint8Array {
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}

/** Pads a byte array with the given byte to a multiple of four bytes. */
function pad4(bytes: Uint8Array, fill: number): Uint8Array {
  const padded = (bytes.byteLength + 3) & ~3;
  if (padded === bytes.byteLength) return bytes;
  const out = new Uint8Array(padded).fill(fill);
  out.set(bytes);
  return out;
}

/**
 * Writes meshes as one glTF 2.0 binary file. Each mesh is one glTF mesh. Its triangles are grouped
 * by face colour, and each colour is one primitive with one material. Faces without a colour use a
 * default grey material. The positions and the normals are shared by the primitives of one mesh.
 * A mesh without triangles is left out. Input with no triangle at all rejects with E_INPUT, because a
 * glTF buffer cannot have zero bytes.
 */
export function writeGlb(meshes: CadMesh[]): Uint8Array {
  const materials: Material[] = [];
  const materialIndex = new Map<string, number>();
  const materialOf = (key: string): number => {
    let index = materialIndex.get(key);
    if (index === undefined) {
      index = materials.length;
      const colour = key === "default" ? DEFAULT_COLOUR : (key.split(",").map(Number) as [number, number, number]);
      materials.push({ name: key === "default" ? "default" : `face ${key}`, colour });
      materialIndex.set(key, index);
    }
    return index;
  };

  const accessors: Accessor[] = [];
  const addAccessor = (accessor: Accessor): number => {
    accessors.push(accessor);
    return accessors.length - 1;
  };
  const gltfMeshes: unknown[] = [];
  const nodes: unknown[] = [];

  for (const mesh of meshes) {
    // A mesh with no triangle gets no accessor, so that the file holds no unused accessor.
    const groups = triangleGroups(mesh);
    if (groups.size === 0) continue;
    const positions = Float32Array.from(mesh.positions);
    const vertexCount = positions.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i++) {
      const k = i % 3;
      min[k] = Math.min(min[k]!, positions[i]!);
      max[k] = Math.max(max[k]!, positions[i]!);
    }
    const attributes: Record<string, number> = {
      POSITION: addAccessor({ bytes: bytesOf(positions), componentType: COMPONENT_FLOAT32, type: "VEC3", count: vertexCount, min, max }),
    };
    if (mesh.normals !== undefined) {
      const normals = Float32Array.from(mesh.normals);
      attributes.NORMAL = addAccessor({ bytes: bytesOf(normals), componentType: COMPONENT_FLOAT32, type: "VEC3", count: normals.length / 3 });
    }

    const primitives: unknown[] = [];
    for (const [key, triangles] of groups) {
      const indices = new Uint32Array(triangles.length * 3);
      triangles.forEach((t, n) => {
        indices[n * 3] = mesh.indices[t * 3]!;
        indices[n * 3 + 1] = mesh.indices[t * 3 + 1]!;
        indices[n * 3 + 2] = mesh.indices[t * 3 + 2]!;
      });
      const indexAccessor = addAccessor({ bytes: bytesOf(indices), componentType: COMPONENT_UINT32, type: "SCALAR", count: indices.length });
      primitives.push({ attributes, indices: indexAccessor, material: materialOf(key), mode: MODE_TRIANGLES });
    }
    nodes.push({ mesh: gltfMeshes.length, name: mesh.name });
    gltfMeshes.push({ name: mesh.name, primitives });
  }

  if (gltfMeshes.length === 0) {
    throw new RenderError("E_INPUT", "the meshes hold no triangles");
  }

  // Lay out the buffer: one buffer view per accessor, each on a four-byte boundary.
  const views: { byteOffset: number; byteLength: number }[] = [];
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (const accessor of accessors) {
    chunks.push(accessor.bytes);
    views.push({ byteOffset: total, byteLength: accessor.bytes.byteLength });
    total += accessor.bytes.byteLength;
  }
  const bin = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    bin.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  const json = {
    asset: { version: "2.0", generator: "sciengjs" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: gltfMeshes,
    materials: materials.map((m) => ({
      name: m.name,
      pbrMetallicRoughness: { baseColorFactor: [...m.colour, 1], metallicFactor: 0, roughnessFactor: 1 },
    })),
    accessors: accessors.map((a, i) => ({
      bufferView: i,
      byteOffset: 0,
      componentType: a.componentType,
      count: a.count,
      type: a.type,
      ...(a.min !== undefined ? { min: a.min, max: a.max } : {}),
    })),
    bufferViews: views.map((v) => ({ buffer: 0, byteOffset: v.byteOffset, byteLength: v.byteLength })),
    buffers: [{ byteLength: total }],
  };

  const jsonBytes = pad4(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const binBytes = pad4(bin, 0);
  const length = 12 + 8 + jsonBytes.byteLength + 8 + binBytes.byteLength;
  const out = new Uint8Array(length);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setUint32(8, length, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  const binHeader = 20 + jsonBytes.byteLength;
  view.setUint32(binHeader, binBytes.byteLength, true);
  view.setUint32(binHeader + 4, CHUNK_BIN, true);
  out.set(binBytes, binHeader + 8);
  return out;
}
