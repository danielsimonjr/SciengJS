// An independent glTF 2.0 binary reader for the tests. It shares no code with src/mesh/glb.ts.
// It checks the container, the JSON chunk, the BIN chunk, the accessor bounds and the index ranges,
// and it returns the decoded geometry and materials.

const MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"
const COMPONENT_UINT32 = 5125;
const COMPONENT_FLOAT32 = 5126;
const TYPE_SIZES: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

export interface GlbPrimitive {
  positions: Float32Array;
  normals: Float32Array | undefined;
  indices: Uint32Array;
  material: number | undefined;
}

export interface GlbDocument {
  json: any;
  primitives: GlbPrimitive[];
  materials: { baseColorFactor: number[]; name: string | undefined }[];
}

/** Reads a float or integer accessor, checking that its bytes lie inside its buffer view. */
function readAccessor(json: any, bin: Uint8Array, index: number, expectedComponent: number, expectedType: string): any {
  const accessor = json.accessors?.[index];
  if (!accessor) throw new Error(`accessor ${index} is missing`);
  if (accessor.componentType !== expectedComponent) throw new Error(`accessor ${index} has component type ${accessor.componentType}`);
  if (accessor.type !== expectedType) throw new Error(`accessor ${index} has type ${accessor.type}`);
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`accessor ${index} names no buffer view`);
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const size = TYPE_SIZES[accessor.type]! * 4;
  const length = accessor.count * size;
  if (offset + length > (view.byteOffset ?? 0) + view.byteLength) throw new Error(`accessor ${index} runs past its buffer view`);
  if (offset + length > bin.byteLength) throw new Error(`accessor ${index} runs past the BIN chunk`);
  if (offset % 4 !== 0) throw new Error(`accessor ${index} is not 4-byte aligned`);
  const view32 = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const count = accessor.count * TYPE_SIZES[accessor.type]!;
  const out = expectedComponent === COMPONENT_FLOAT32 ? new Float32Array(count) : new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = expectedComponent === COMPONENT_FLOAT32 ? view32.getFloat32(offset + i * 4, true) : view32.getUint32(offset + i * 4, true);
  }
  return { accessor, values: out };
}

/** Parses and checks one GLB file. It throws on the first defect. */
export function readGlb(bytes: Uint8Array): GlbDocument {
  if (bytes.byteLength < 20) throw new Error("the file is shorter than the header and the first chunk");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error("the magic is not glTF");
  if (view.getUint32(4, true) !== 2) throw new Error("the version is not 2");
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error("the header length does not match the file length");

  let offset = 12;
  let json: any;
  let bin: Uint8Array | undefined;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error("a chunk header runs past the end of the file");
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (length % 4 !== 0) throw new Error("a chunk length is not a multiple of 4");
    const start = offset + 8;
    if (start + length > bytes.byteLength) throw new Error("a chunk runs past the end of the file");
    const body = bytes.subarray(start, start + length);
    if (type === CHUNK_JSON) {
      if (json !== undefined) throw new Error("two JSON chunks");
      json = JSON.parse(new TextDecoder().decode(body));
    } else if (type === CHUNK_BIN) {
      if (bin !== undefined) throw new Error("two BIN chunks");
      bin = body;
    } else {
      throw new Error(`an unknown chunk type ${type.toString(16)}`);
    }
    offset = start + length;
  }
  if (json === undefined) throw new Error("the JSON chunk is missing");
  if (json.asset?.version !== "2.0") throw new Error("asset.version is not 2.0");
  if (bin === undefined) throw new Error("the BIN chunk is missing");
  const buffer = json.buffers?.[0];
  if (!buffer || buffer.byteLength > bin.byteLength) throw new Error("buffer 0 is missing or larger than the BIN chunk");

  const materials = (json.materials ?? []).map((m: any) => ({
    baseColorFactor: m.pbrMetallicRoughness?.baseColorFactor as number[],
    name: m.name as string | undefined,
  }));
  const primitives: GlbPrimitive[] = [];
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.mode !== 4) throw new Error("a primitive is not TRIANGLES");
      const position = readAccessor(json, bin, prim.attributes.POSITION, COMPONENT_FLOAT32, "VEC3");
      const vertexCount = position.accessor.count as number;
      // Accessor min and max must match the data.
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < vertexCount; i++) {
        for (let k = 0; k < 3; k++) {
          const v = position.values[i * 3 + k];
          min[k] = Math.min(min[k]!, v);
          max[k] = Math.max(max[k]!, v);
        }
      }
      for (let k = 0; k < 3; k++) {
        if (position.accessor.min?.[k] !== min[k] || position.accessor.max?.[k] !== max[k]) {
          throw new Error("the POSITION min or max does not match the data");
        }
      }
      let normals: Float32Array | undefined;
      if (prim.attributes.NORMAL !== undefined) {
        const n = readAccessor(json, bin, prim.attributes.NORMAL, COMPONENT_FLOAT32, "VEC3");
        if (n.accessor.count !== vertexCount) throw new Error("NORMAL count differs from POSITION count");
        normals = n.values;
      }
      const index = readAccessor(json, bin, prim.indices, COMPONENT_UINT32, "SCALAR");
      if (index.values.length % 3 !== 0) throw new Error("the index count is not a multiple of 3");
      for (const i of index.values) {
        if (i >= vertexCount) throw new Error(`index ${i} is outside ${vertexCount} vertices`);
      }
      if (prim.material !== undefined && (prim.material < 0 || prim.material >= materials.length)) {
        throw new Error("a primitive names a material that does not exist");
      }
      primitives.push({ positions: position.values, normals, indices: index.values, material: prim.material });
    }
  }
  return { json, primitives, materials };
}
