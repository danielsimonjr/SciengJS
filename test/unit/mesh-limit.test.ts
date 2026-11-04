// Tests of the output size limit of the glb backend. A fake reader result stands in for occt-import-js.
import { describe, expect, test } from "bun:test";
import { estimateGlbBytes, GLB_COPIES, render } from "../../src/mesh/backend-glb.ts";
import type { CadMesh } from "../../src/mesh/read.ts";
import type { WorkerJob } from "../../src/worker/protocol.ts";
import { rejectionOf, resolved } from "../support/rejections.ts";

/** A mesh with the given number of vertices and triangles. All indices are 0. */
function mesh(vertices: number, triangles: number, withNormals = true): CadMesh {
  return {
    name: "fake",
    positions: new Float32Array(vertices * 3),
    normals: withNormals ? new Float32Array(vertices * 3).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)) : undefined,
    indices: new Uint32Array(triangles * 3),
    faces: [],
  };
}

const request = (maxMemoryMb: number): WorkerJob["request"] =>
  ({ type: "step", format: "glb", source: new Uint8Array([1]), options: {}, settings: { maxMemoryMb } }) as unknown as WorkerJob["request"];

describe("the glb output limit", () => {
  test("the estimate counts positions, normals and indices, four bytes each, times the copies", () => {
    expect(GLB_COPIES).toBe(4);
    expect(estimateGlbBytes([mesh(10, 5)])).toBe((30 + 30 + 15) * 4 * GLB_COPIES);
    expect(estimateGlbBytes([mesh(10, 5, false), mesh(2, 1)])).toBe((30 + 15 + 6 + 6 + 3) * 4 * GLB_COPIES);
  });

  test("an output over maxMemoryMb rejects with E_LIMIT after the read", async () => {
    // 22000 vertices and 22000 triangles: (66000 * 3) * 16 bytes = 3168000 bytes, over 3 MB.
    const big = [mesh(22000, 22000)];
    const err = await rejectionOf(render(request(3), { readCad: async () => big }));
    expect(err.code).toBe("E_LIMIT");
    expect(err.message).toContain("3145728");
  });

  test("an output at the limit renders", async () => {
    // 3145728 bytes / 16 = 196608 values: 32768 vertices and 32768 triangles, no normals.
    const exact = [mesh(32768, 32768, false)];
    expect(estimateGlbBytes(exact)).toBe(3 * 1048576);
    const out = await resolved(render(request(3), { readCad: async () => exact }));
    expect(out.bytes.byteLength).toBeGreaterThan(0);
  });

  test("a single copy over the 32-bit length field of glb rejects with E_LIMIT", async () => {
    const huge = { name: "huge", positions: { length: 3e9 }, normals: undefined, indices: { length: 3 }, faces: [] } as unknown as CadMesh;
    const err = await rejectionOf(render(request(1e9), { readCad: async () => [huge] }));
    expect(err.code).toBe("E_LIMIT");
  });
});
