/**
 * `cad` to `dxf`: a 2D drawing of the model (design section "CAD"). The test reads the file with its own group-code
 * reader and measures the contours by the shoelace formula, so it does not trust the writer.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render as renderDxf } from "../../src/mesh/backend-dxf.ts";
import { drawMeshes } from "../../src/mesh/cad-build.ts";
import { dxfByteLength, writeDxf } from "../../src/mesh/dxf.ts";
import { findPair } from "../../src/pairs.ts";
import { DEFAULT_REGISTRY, registryKey } from "../../src/registry.ts";
import type { CadMesh } from "../../src/mesh/read.ts";
import { OUTPUT_FORMATS } from "../../src/types.ts";
import type { WorkerJob } from "../../src/worker/protocol.ts";
import { rejectionOf } from "../support/rejections.ts";
import { testSettings } from "../support/settings.ts";

const request = (doc: unknown, options: Record<string, unknown> = {}, settings = testSettings()): WorkerJob["request"] =>
  ({ type: "cad", format: "dxf", source: JSON.stringify(doc), options, settings }) as WorkerJob["request"];

/** A 20 x 10 x 2 plate with a through hole of radius 2 at (10, 5), and a 4 x 4 boss of height 3 on top. */
const PLATE = {
  version: 1,
  segments: 64,
  model: {
    type: "union",
    children: [
      {
        type: "difference",
        children: [
          { type: "cube", size: [20, 10, 2] },
          { type: "translate", offset: [10, 5, -1], child: { type: "cylinder", radius: 2, height: 4 } },
        ],
      },
      { type: "translate", offset: [1, 1, 2], child: { type: "cube", size: [4, 4, 3] } },
    ],
  },
};

/** The group-code pairs of an ASCII DXF file. */
function pairs(text: string): [number, string][] {
  const lines = text.split("\r\n");
  expect(lines.at(-1)).toBe("");
  const out: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([Number(lines[i]!.trim()), lines[i + 1]!]);
  return out;
}

/** The closed polylines of the ENTITIES section, each a list of [x, y] points. */
function polylines(text: string): { closed: boolean; layer: string; points: number[][] }[] {
  const all = pairs(text);
  const result: { closed: boolean; layer: string; points: number[][] }[] = [];
  let current: { closed: boolean; layer: string; points: number[][] } | undefined;
  let point: number[] | undefined;
  let entity = "";
  for (const [code, value] of all) {
    if (code === 0) {
      entity = value;
      if (value === "POLYLINE") result.push((current = { closed: false, layer: "", points: [] }));
      if (value === "VERTEX") current!.points.push((point = [NaN, NaN]));
      continue;
    }
    if (entity === "POLYLINE" && code === 70) current!.closed = (Number(value) & 1) === 1;
    if (entity === "POLYLINE" && code === 8) current!.layer = value;
    if (entity === "VERTEX" && code === 10) point![0] = Number(value);
    if (entity === "VERTEX" && code === 20) point![1] = Number(value);
  }
  return result;
}

const area = (points: number[][]): number =>
  points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length]!;
    return sum + x! * ny! - nx! * y!;
  }, 0) / 2;

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe("cad to dxf", () => {
  test("the design lists the pair and the format", () => {
    expect(OUTPUT_FORMATS).toContain("dxf");
    expect(findPair("cad", "dxf")).toEqual({ type: "cad", format: "dxf", stage: "mesh" });
  });

  test("the file is R12 ASCII DXF with a header, an entities section and an end of file", async () => {
    const out = text((await renderDxf(request(PLATE))).bytes);
    const codes = pairs(out);
    expect(codes.slice(0, 4)).toEqual([[0, "SECTION"], [2, "HEADER"], [9, "$ACADVER"], [1, "AC1009"]]);
    expect(codes).toContainEqual([2, "ENTITIES"]);
    expect(codes.at(-1)).toEqual([0, "EOF"]);
    for (const p of polylines(out)) expect(p.layer).toBe("0");
  });

  test("with no option the drawing is the outline: the plate rectangle and the through hole", async () => {
    const lines = polylines(text((await renderDxf(request(PLATE))).bytes));
    expect(lines.length).toBe(2);
    for (const p of lines) expect(p.closed).toBe(true);
    const areas = lines.map((p) => Math.abs(area(p.points))).sort((a, b) => b - a);
    expect(areas[0]).toBeCloseTo(200, 3);
    expect(areas[1]).toBeCloseTo(Math.PI * 4, 1);
    const xs = lines.flatMap((p) => p.points.map((q) => q[0]!));
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 20]);
  });

  test("option z gives the section at that height", async () => {
    const boss = polylines(text((await renderDxf(request(PLATE, { z: 4 }))).bytes));
    expect(boss.length).toBe(1);
    expect(Math.abs(area(boss[0]!.points))).toBeCloseTo(16, 3);
    const plate = polylines(text((await renderDxf(request(PLATE, { z: 1 }))).bytes));
    expect(plate.length).toBe(2);
  });

  test("a section above the model rejects with E_INPUT", async () => {
    const err = await rejectionOf(renderDxf(request(PLATE, { z: 50 })));
    expect(err).toMatchObject({ code: "E_INPUT" });
    expect((err as Error).message).toBe("the drawing at z = 50 holds no contour");
  });

  test("an unknown option or a z that is not a finite number rejects with E_INPUT", async () => {
    expect(await rejectionOf(renderDxf(request(PLATE, { scale: 2 })))).toMatchObject({ code: "E_INPUT", message: "cad to dxf takes no option scale" });
    expect(await rejectionOf(renderDxf(request(PLATE, { z: "1" })))).toMatchObject({ code: "E_INPUT", message: "option z must be a finite number" });
  });

  test("a model with a colour warns; a model without one does not", async () => {
    const coloured = { ...PLATE, model: { ...PLATE.model, color: [1, 0, 0] } };
    expect((await renderDxf(request(coloured))).warnings).toEqual(["dxf holds no colour and no name; the colours of the model are dropped"]);
    expect((await renderDxf(request(PLATE))).warnings).toBeUndefined();
  });

  test("the same model gives the same bytes", async () => {
    const a = (await renderDxf(request(PLATE))).bytes;
    const b = (await renderDxf(request(PLATE))).bytes;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  test("the size bound is an upper bound of the written size", () => {
    const long = Array.from({ length: 1000 }, (_, i) => [-123456.7891 - i / 7, -0.0000012345678912 * (i + 1)]);
    const contours = [[[0, 0], [123456.789, 0], [-0.000001, -98765.4321]], long];
    expect(writeDxf(contours).byteLength).toBeLessThanOrEqual(dxfByteLength(contours));
  });

  test("an output over maxMemoryMb rejects with E_LIMIT", async () => {
    const err = await rejectionOf(renderDxf(request(PLATE, {}, { ...testSettings(), maxMemoryMb: 0.0001 })));
    expect(err).toMatchObject({ code: "E_LIMIT" });
    expect((err as Error).message).toMatch(/^the dxf output needs \d+ bytes; the limit is \d+ bytes$/);
  });
});

const CORPUS = fileURLToPath(new URL("../corpus/mesh/", import.meta.url));
const corpus = (name: string): Uint8Array => new Uint8Array(readFileSync(CORPUS + name));

const fileRequest = (type: "step" | "iges" | "brep", bytes: unknown, options: Record<string, unknown> = {}, settings = testSettings()): WorkerJob["request"] =>
  ({ type, format: "dxf", source: bytes, options, settings }) as unknown as WorkerJob["request"];

/** A closed tetrahedron with the triangles wound inward, so that its volume is negative. */
const inverted: CadMesh = {
  name: "inverted",
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  normals: new Float32Array(12),
  indices: Uint32Array.from([0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2]),
  faces: [{ first: 0, last: 3, color: null }],
};

/** A closed unit tetrahedron with outward triangles, moved by dx along X. The colour applies to every face. */
const tetra = (name: string, dx: number, color: [number, number, number] | null = null): CadMesh => ({
  name,
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1].map((v, i) => (i % 3 === 0 ? v + dx : v))),
  normals: new Float32Array(12),
  indices: Uint32Array.from([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
  faces: [{ first: 0, last: 3, color }],
});

/** One triangle: a mesh that is not a closed solid. */
const sliver: CadMesh = {
  name: "sliver",
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array(9),
  indices: Uint32Array.from([0, 1, 2]),
  faces: [{ first: 0, last: 0, color: null }],
};

describe("step, iges and brep to dxf", () => {
  test("the design lists the three pairs and the registry routes them to the dxf backend", () => {
    for (const type of ["step", "iges", "brep"] as const) {
      expect(findPair(type, "dxf")).toEqual({ type, format: "dxf", stage: "mesh" });
      expect(DEFAULT_REGISTRY[registryKey(type, "dxf")]).toEqual({ backend: "mesh/occt+manifold+dxf", moduleUrl: expect.stringContaining("mesh/backend-dxf") });
    }
  });

  test("the STEP outline holds two closed contours: the cube and the cylinder", async () => {
    const lines = polylines(text((await renderDxf(fileRequest("step", corpus("red_cube_blue_cylinder.step")))).bytes));
    expect(lines.length).toBe(2);
    for (const p of lines) {
      expect(p.closed).toBe(true);
      expect(p.layer).toBe("0");
    }
    const areas = lines.map((p) => Math.abs(area(p.points))).sort((a, b) => b - a);
    expect(areas[0]).toBeCloseTo(100, 3);
    expect(areas[1]).toBeCloseTo(78.4373, 3);
    const xs = lines.flatMap((p) => p.points.map((q) => q[0]!));
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-10, 15]);
  });

  test("the STEP colours give the colour warning", async () => {
    const out = await renderDxf(fileRequest("step", corpus("red_cube_blue_cylinder.step")));
    expect(out.warnings).toEqual(["dxf holds no colour and no name; the colours of the model are dropped"]);
  });

  test("the STEP section at z = 5 holds two contours; z = 50 rejects with E_INPUT", async () => {
    const section = polylines(text((await renderDxf(fileRequest("step", corpus("red_cube_blue_cylinder.step"), { z: 5 }))).bytes));
    expect(section.length).toBe(2);
    const err = await rejectionOf(renderDxf(fileRequest("step", corpus("red_cube_blue_cylinder.step"), { z: 50 })));
    expect(err).toMatchObject({ code: "E_INPUT" });
    expect((err as Error).message).toBe("the drawing at z = 50 holds no contour");
  });

  test("the IGES outline is one contour of area 100, and it warns about the black faces", async () => {
    const out = await renderDxf(fileRequest("iges", corpus("cube-10x10mm.igs")));
    const lines = polylines(text(out.bytes));
    expect(lines.length).toBe(1);
    expect(Math.abs(area(lines[0]!.points))).toBeCloseTo(100, 3);
    expect(out.warnings).toEqual(["dxf holds no colour and no name; the colours of the model are dropped"]);
  });

  test("the IGES section above the cube rejects with E_INPUT", async () => {
    expect(await rejectionOf(renderDxf(fileRequest("iges", corpus("cube-10x10mm.igs"), { z: 10 })))).toMatchObject({ code: "E_INPUT" });
  });

  test("the BREP outline is one contour of area 12.5418 (a polygon on the circle of area 4 pi), and it gives no warning", async () => {
    const out = await renderDxf(fileRequest("brep", corpus("cylinder1.brep")));
    const lines = polylines(text(out.bytes));
    expect(lines.length).toBe(1);
    expect(Math.abs(area(lines[0]!.points))).toBeCloseTo(12.5418, 3);
    expect(out.warnings).toBeUndefined();
  });

  test("the same BREP bytes give the same drawing", async () => {
    const a = (await renderDxf(fileRequest("brep", corpus("cylinder1.brep")))).bytes;
    const b = (await renderDxf(fileRequest("brep", corpus("cylinder1.brep")))).bytes;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  test("option linearUnit rejects with E_INPUT, and a z that is not a number rejects too", async () => {
    expect(await rejectionOf(renderDxf(fileRequest("step", corpus("red_cube_blue_cylinder.step"), { linearUnit: "meter" })))).toMatchObject({
      code: "E_INPUT",
      message: "step to dxf takes no option linearUnit",
    });
    expect(await rejectionOf(renderDxf(fileRequest("brep", corpus("cylinder1.brep"), { z: "1" })))).toMatchObject({
      code: "E_INPUT",
      message: "option z must be a finite number",
    });
  });

  test("text source for BREP rejects with E_INPUT", async () => {
    expect(await rejectionOf(renderDxf(fileRequest("brep", "not bytes")))).toMatchObject({ code: "E_INPUT", message: "brep takes bytes, not text" });
  });

  test("a BREP over maxCadFacets rejects with E_LIMIT before the solid is built", async () => {
    const err = await rejectionOf(renderDxf(fileRequest("brep", corpus("cylinder1.brep"), {}, testSettings({ maxCadFacets: 10 }))));
    expect(err).toMatchObject({ code: "E_LIMIT" });
    expect((err as Error).message).toMatch(/^the model has 228 facets; the limit is 10$/);
  });

  test("a BREP with exactly maxCadFacets triangles renders", async () => {
    const out = await renderDxf(fileRequest("brep", corpus("cylinder1.brep"), {}, testSettings({ maxCadFacets: 228 })));
    expect(polylines(text(out.bytes)).length).toBe(1);
  });

  test("an output over maxMemoryMb rejects with E_LIMIT", async () => {
    expect(await rejectionOf(renderDxf(fileRequest("brep", corpus("cylinder1.brep"), {}, testSettings({ maxMemoryMb: 0.0001 }))))).toMatchObject({ code: "E_LIMIT" });
  });

  test("a mesh with one triangle rejects with E_INPUT, because it is not a closed solid", async () => {
    const readCad = async () => [sliver];
    const err = await rejectionOf(renderDxf(fileRequest("step", new Uint8Array([1])), { readCad } as never));
    expect(err).toMatchObject({ code: "E_INPUT" });
    expect((err as Error).message).toContain("is not a closed solid");
  });

  test("a closed mesh wound inward rejects with E_INPUT at the volume check", async () => {
    const readCad = async () => [inverted];
    const err = await rejectionOf(renderDxf(fileRequest("step", new Uint8Array([1])), { readCad } as never));
    expect(err).toMatchObject({ code: "E_INPUT" });
    expect((err as Error).message).toContain("inward");
  });

  test("an unnamed mesh that is not a closed solid gives its index in the message", async () => {
    const readCad = async () => [tetra("a", 0), { ...sliver, name: "" }];
    const err = await rejectionOf(renderDxf(fileRequest("step", new Uint8Array([1])), { readCad } as never));
    expect(err).toMatchObject({ code: "E_INPUT" });
    expect((err as Error).message).toStartWith("mesh 1 is not a closed solid: its vertices could not be welded into a closed solid (");
  });

  test("a named mesh that is not a closed solid gives its name in quotes", async () => {
    const readCad = async () => [sliver];
    const err = await rejectionOf(renderDxf(fileRequest("step", new Uint8Array([1])), { readCad } as never));
    expect((err as Error).message).toStartWith('mesh "sliver" is not a closed solid: its vertices could not be welded into a closed solid (');
  });

  test("drawMeshes rejects, and does not throw, when the sum of the triangles of all meshes is over the limit", async () => {
    const meshes = [tetra("a", 0), tetra("b", 5)];
    const drawing = drawMeshes(meshes, 7);
    expect(drawing).toBeInstanceOf(Promise);
    await expect(drawing).rejects.toMatchObject({ code: "E_LIMIT", message: "the model has 8 facets; the limit is 7" });
    expect((await drawMeshes(meshes, 8)).contours.length).toBe(2);
  });

  test("one coloured part and one part with no colour give the colour warning; no colour gives no warning", async () => {
    const mixed = async () => [tetra("a", 0), tetra("b", 5, [1, 0, 0])];
    const out = await renderDxf(fileRequest("step", new Uint8Array([1])), { readCad: mixed } as never);
    expect(out.warnings).toEqual(["dxf holds no colour and no name; the colours of the model are dropped"]);
    const plain = async () => [tetra("a", 0), tetra("b", 5)];
    expect((await renderDxf(fileRequest("step", new Uint8Array([1])), { readCad: plain } as never)).warnings).toBeUndefined();
  });

  test("the section of an imported mesh is not its outline: a tetrahedron gives 0.5 from above and 0.125 at z = 0.5", async () => {
    const readCad = async () => [tetra("a", 0)];
    const outline = polylines(text((await renderDxf(fileRequest("step", new Uint8Array([1])), { readCad } as never)).bytes));
    const section = polylines(text((await renderDxf(fileRequest("step", new Uint8Array([1]), { z: 0.5 }), { readCad } as never)).bytes));
    expect(outline.map((p) => Math.abs(area(p.points)))).toEqual([expect.closeTo(0.5, 5)]);
    expect(section.map((p) => Math.abs(area(p.points)))).toEqual([expect.closeTo(0.125, 5)]);
  });

  test("the IGES section at z = 0 is one contour of area 100", async () => {
    const lines = polylines(text((await renderDxf(fileRequest("iges", corpus("cube-10x10mm.igs"), { z: 0 }))).bytes));
    expect(lines.length).toBe(1);
    expect(Math.abs(area(lines[0]!.points))).toBeCloseTo(100, 3);
  });
});
