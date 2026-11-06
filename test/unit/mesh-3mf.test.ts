/**
 * `cad` to `3mf`: a 3MF Core package (design section "CAD"). A second ZIP reader (fflate, which three ships)
 * opens the package, so the test does not trust the writer's own reader.
 */
import { describe, expect, test } from "bun:test";
// @ts-expect-error: three ships fflate as plain JavaScript with no types.
import { gzipSync, unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { render as render3mf } from "../../src/mesh/backend-3mf.ts";
import { threemfByteLength, write3mf } from "../../src/mesh/threemf.ts";
import { render as renderStl } from "../../src/mesh/backend-stl.ts";
import { findPair } from "../../src/pairs.ts";
import { OUTPUT_FORMATS } from "../../src/types.ts";
import type { WorkerJob } from "../../src/worker/protocol.ts";
import { rejectionOf } from "../support/rejections.ts";
import { testSettings } from "../support/settings.ts";

const request = (doc: unknown, settings = testSettings()): WorkerJob["request"] =>
  ({ type: "cad", format: "3mf", source: JSON.stringify(doc), options: {}, settings }) as WorkerJob["request"];

const COLOURED = {
  version: 1,
  model: {
    type: "union",
    name: "bracket",
    children: [
      { type: "cube", size: [4, 2, 1], color: [0.6, 0.6, 0.6] },
      { type: "translate", offset: [5, 0, 0], child: { type: "cube", size: 1 } },
    ],
  },
};

const parts = (bytes: Uint8Array): Record<string, string> => {
  const files = unzipSync(bytes) as Record<string, Uint8Array>;
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, new TextDecoder().decode(data)]));
};

describe("cad to 3mf", () => {
  test("the design lists the pair and the format", () => {
    expect(OUTPUT_FORMATS).toContain("3mf");
    expect(findPair("cad", "3mf")).toEqual({ type: "cad", format: "3mf", stage: "mesh" });
  });

  test("the package holds the three parts of a 3MF Core package", async () => {
    const files = parts((await render3mf(request(COLOURED))).bytes);
    expect(Object.keys(files).sort()).toEqual(["3D/3dmodel.model", "[Content_Types].xml", "_rels/.rels"]);
    expect(files["[Content_Types].xml"]).toContain('ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"');
    expect(files["_rels/.rels"]).toContain('Target="/3D/3dmodel.model"');
    expect(files["_rels/.rels"]).toContain('Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"');
  });

  test("the model has the unit, the name, and the triangles of the stl output", async () => {
    const model = parts((await render3mf(request(COLOURED))).bytes)["3D/3dmodel.model"]!;
    expect(model).toContain('unit="millimeter"');
    expect(model).toContain('name="bracket"');
    const stl = (await renderStl({ ...request(COLOURED), format: "stl" } as WorkerJob["request"])).bytes;
    const facets = new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(80, true);
    expect(model.match(/<triangle /g)?.length).toBe(facets);
    const vertices = model.match(/<vertex /g)?.length ?? 0;
    for (const m of model.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)) {
      for (const v of [m[1], m[2], m[3]]) expect(Number(v)).toBeLessThan(vertices);
    }
  });

  test("the colours are basematerials; a triangle without a colour takes the default grey", async () => {
    const out = await render3mf(request(COLOURED));
    const model = parts(out.bytes)["3D/3dmodel.model"]!;
    expect(model).toMatch(/<basematerials id="1">/);
    expect(model).toContain('displaycolor="#999999FF"');
    expect(model).toContain('<base name="default" displaycolor="#CCCCCCFF"/>');
    expect(model.match(/<base /g)?.length).toBe(2);
    expect(out.warnings).toBeUndefined();
  });

  test("a name with XML characters is escaped", async () => {
    const out = await render3mf(request({ version: 1, model: { type: "cube", size: 1, name: 'a&b<"c' } }));
    expect(parts(out.bytes)["3D/3dmodel.model"]).toContain('name="a&amp;b&lt;&quot;c"');
  });

  test("the same model gives the same bytes, and the parts are stored", async () => {
    const a = (await render3mf(request(COLOURED))).bytes;
    const b = (await render3mf(request(COLOURED))).bytes;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const view = new DataView(a.buffer, a.byteOffset, a.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0);
  });

  test("each entry has the CRC-32 of its data and the fixed date, in the local and the central header", async () => {
    const bytes = (await render3mf(request(COLOURED))).bytes;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const files = unzipSync(bytes) as Record<string, Uint8Array>;
    const eocd = bytes.byteLength - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    let central = view.getUint32(eocd + 16, true);
    expect(view.getUint32(eocd + 12, true)).toBe(eocd - central);
    for (let n = 0; n < 3; n++) {
      const nameLength = view.getUint16(central + 28, true);
      const name = new TextDecoder().decode(bytes.subarray(central + 46, central + 46 + nameLength));
      const local = view.getUint32(central + 42, true);
      // An independent CRC-32: the trailer of a gzip member holds the CRC-32 of the data.
      const gz = gzipSync(files[name]!) as Uint8Array;
      const expected = new DataView(gz.buffer, gz.byteOffset, gz.byteLength).getUint32(gz.byteLength - 8, true);
      expect(view.getUint32(central + 16, true)).toBe(expected);
      expect(view.getUint32(local + 14, true)).toBe(expected);
      expect([view.getUint16(central + 12, true), view.getUint16(central + 14, true)]).toEqual([0, 0x21]);
      expect([view.getUint16(local + 10, true), view.getUint16(local + 12, true)]).toEqual([0, 0x21]);
      central += 46 + nameLength;
    }
  });

  test("a name with a control character or a line end gives well-formed XML that keeps the line end", async () => {
    const out = await render3mf(request({ version: 1, model: { type: "cube", size: 1, name: "a\u0001b\nc\td" } }));
    const model = parts(out.bytes)["3D/3dmodel.model"]!;
    expect(model).toContain('name="a\uFFFDb&#10;c&#9;d"');
  });

  test("the size bound counts the name, so a long name still gives E_LIMIT", async () => {
    const doc = { version: 1, model: { type: "cube", size: 1, name: '"'.repeat(20000) } };
    const err = await rejectionOf(render3mf(request(doc, { ...testSettings(), maxMemoryMb: 0.02 })));
    expect(err).toMatchObject({ code: "E_LIMIT" });
  });

  test("the size bound is an upper bound of the written size", async () => {
    const doc = { version: 1, model: { type: "cube", size: 1, name: '<"&>'.repeat(500) } };
    const meshes = await import("../../src/mesh/backend-glb.ts").then((m) => m.readMeshes(request(doc)));
    expect(write3mf(meshes).byteLength).toBeLessThanOrEqual(threemfByteLength(meshes));
  });

  test("meshes with no triangle reject with E_INPUT", () => {
    expect(() => write3mf([])).toThrow(expect.objectContaining({ code: "E_INPUT" }));
  });

  test("an output over maxMemoryMb rejects with E_LIMIT", async () => {
    const err = await rejectionOf(render3mf(request(COLOURED, { ...testSettings(), maxMemoryMb: 0.0001 })));
    expect(err).toMatchObject({ code: "E_LIMIT" });
    expect((err as Error).message).toMatch(/^the 3mf output needs \d+ bytes; the limit is \d+ bytes$/);
  });
});
