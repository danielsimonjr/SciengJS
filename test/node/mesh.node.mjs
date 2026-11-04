// Runs under Node 22 against the BUILT package (dist/). It proves that the mesh stage loads its WASM reader in plain Node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "..", "dist");
const bytes = new Uint8Array(readFileSync(join(here, "..", "corpus", "mesh", "cylinder1.brep")));

test("node renders a BREP file to glb through render()", async () => {
  const { render } = await import(pathToFileURL(join(dist, "index.js")).href);
  const result = await render({ type: "brep", source: bytes, format: "glb" });
  assert.equal(result.mime, "model/gltf-binary");
  const view = new DataView(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  assert.equal(view.getUint32(4, true), 2);
  assert.equal(view.getUint32(8, true), result.bytes.byteLength);
  assert.equal(view.getUint32(16, true), 0x4e4f534a);
});

test("node imports dist/mesh and reads a BREP file to triangles", async () => {
  const { readCad } = await import(pathToFileURL(join(dist, "mesh", "index.js")).href);
  const meshes = await readCad("brep", bytes);
  assert.ok(meshes.some((mesh) => mesh.indices.length > 0));
});
