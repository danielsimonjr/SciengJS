// Tests of the CAD build through the real manifold-3d WASM: volumes against closed forms, colours and normals.
// Also the builder against a hand-written document, and the CAD backends.
import { describe, expect, test } from "bun:test";
import { buildCad } from "../../src/mesh/cad-build.ts";
import * as cad from "../../src/mesh/cad-builder.ts";
import { checkCadDocument, type CadDocument, type SolidNode } from "../../src/mesh/cad-document.ts";
import { render as renderGlb, readMeshes } from "../../src/mesh/backend-glb.ts";
import { render as renderStl } from "../../src/mesh/backend-stl.ts";
import { render as renderHtml } from "../../src/mesh/backend-html.ts";
import type { WorkerJob } from "../../src/worker/protocol.ts";
import { readGlb } from "../support/glb-reader.ts";
import { rejectionOf } from "../support/rejections.ts";
import { testSettings } from "../support/settings.ts";

const LIMITS = { maxNodes: 10000, maxFacets: 2000000 };

async function volumeOf(model: SolidNode, segments?: number): Promise<number> {
  const document: CadDocument = segments === undefined ? { version: 1, model } : { version: 1, model, segments };
  checkCadDocument(document, LIMITS);
  return (await buildCad(document, LIMITS.maxFacets)).volume;
}

/** The volume of a prism over a regular n-gon inscribed in a circle of radius r. */
const prism = (n: number, r: number, h: number): number => (n / 2) * r * r * Math.sin((2 * Math.PI) / n) * h;

describe("volumes against closed forms", () => {
  test("cube", async () => {
    expect(await volumeOf(cad.cube([2, 3, 4]))).toBeCloseTo(24, 4);
  });

  test("cylinder: a prism over the inscribed n-gon", async () => {
    expect(await volumeOf(cad.cylinder(5, 2, { segments: 12 }))).toBeCloseTo(prism(12, 2, 5), 3);
  });

  test("cone: a third of the prism", async () => {
    expect(await volumeOf(cad.cylinder(6, [2, 0], { segments: 16 }))).toBeCloseTo(prism(16, 2, 6) / 3, 3);
  });

  test("sphere: inside the true sphere and within 2 % of it at 64 segments", async () => {
    const v = await volumeOf(cad.sphere(1, { segments: 64 }));
    const exact = (4 / 3) * Math.PI;
    expect(v).toBeLessThan(exact);
    expect(v).toBeGreaterThan(exact * 0.98);
  });

  test("polyhedron: a right tetrahedron", async () => {
    const tetra = cad.polyhedron([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]]);
    expect(await volumeOf(tetra)).toBeCloseTo(1 / 6, 5);
  });

  test("extrude of a rectangle, with and without a scaled top", async () => {
    expect(await volumeOf(cad.extrude(cad.rectangle([2, 3]), 4))).toBeCloseTo(24, 4);
    // A square frustum from 2 x 2 to 1 x 1 over height 3: h (A1 + A2 + sqrt(A1 A2)) / 3 = 7.
    expect(await volumeOf(cad.extrude(cad.rectangle(2, { center: true }), 3, { scale: 0.5 }))).toBeCloseTo(7, 4);
  });

  test("revolve of a rectangle: an n-gon ring", async () => {
    // A ring from radius 1 to 2, height 1, as the difference of two prisms over 24-gons.
    const v = await volumeOf(cad.revolve(cad.polygon([[1, 0], [2, 0], [2, 1], [1, 1]]), { segments: 24 }));
    expect(v).toBeCloseTo(prism(24, 2, 1) - prism(24, 1, 1), 3);
  });

  test("boolean: cube minus a centred smaller cube that cuts through", async () => {
    const model = cad.difference([cad.cube(2, { center: true }), cad.cube([1, 1, 4], { center: true })]);
    expect(await volumeOf(model)).toBeCloseTo(8 - 2, 4);
  });

  test("union and intersection of two overlapping cubes", async () => {
    const a = cad.cube(2);
    const b = cad.translate([1, 0, 0], cad.cube(2));
    expect(await volumeOf(cad.union([a, b]))).toBeCloseTo(12, 4);
    expect(await volumeOf(cad.intersection([a, b]))).toBeCloseTo(4, 4);
  });

  test("transforms keep or scale the volume", async () => {
    const c = cad.cube([1, 2, 3]);
    expect(await volumeOf(cad.rotate([30, 40, 50], c))).toBeCloseTo(6, 4);
    expect(await volumeOf(cad.mirror([1, 1, 0], c))).toBeCloseTo(6, 4);
    expect(await volumeOf(cad.scale(2, c))).toBeCloseTo(48, 3);
    expect(await volumeOf(cad.scale([1, 1, 0.5], c))).toBeCloseTo(3, 4);
  });
});

describe("the build output", () => {
  test("the faces keep the colours of their primitives; the cut face takes the colour of the cutter", async () => {
    const red: [number, number, number] = [1, 0, 0];
    const blue: [number, number, number] = [0, 0, 1];
    const model = cad.difference([cad.cube(2, { center: true, color: red }), cad.cylinder(4, 0.5, { center: true, segments: 16, color: blue })]);
    const { mesh } = await buildCad({ version: 1, model }, LIMITS.maxFacets);
    const colors = mesh.faces.map((f) => JSON.stringify(f.color));
    expect(new Set(colors)).toEqual(new Set([JSON.stringify(red), JSON.stringify(blue)]));
    const triangles = mesh.indices.length / 3;
    expect(mesh.faces[0]!.first).toBe(0);
    expect(mesh.faces.at(-1)!.last).toBe(triangles - 1);
  });

  test("a parent colour flows down to a child with no colour; null when no node has one", async () => {
    const green: [number, number, number] = [0, 1, 0];
    const colored = await buildCad({ version: 1, model: cad.translate([1, 0, 0], cad.cube(1), { color: green }) }, LIMITS.maxFacets);
    expect(colored.mesh.faces.every((f) => JSON.stringify(f.color) === JSON.stringify(green))).toBe(true);
    const plain = await buildCad({ version: 1, model: cad.cube(1) }, LIMITS.maxFacets);
    expect(plain.mesh.faces.every((f) => f.color === null)).toBe(true);
  });

  test("the normals are unit vectors and a cube keeps sharp edges (24 vertices)", async () => {
    const { mesh } = await buildCad({ version: 1, model: cad.cube(1) }, LIMITS.maxFacets);
    expect(mesh.positions.length / 3).toBe(24);
    for (let i = 0; i < mesh.normals!.length; i += 3) {
      expect(Math.hypot(mesh.normals![i]!, mesh.normals![i + 1]!, mesh.normals![i + 2]!)).toBeCloseTo(1, 5);
    }
  });

  test("the mesh takes the name of the model, else model", async () => {
    expect((await buildCad({ version: 1, model: cad.cube(1, { name: "block" }) }, LIMITS.maxFacets)).mesh.name).toBe("block");
    expect((await buildCad({ version: 1, model: cad.cube(1) }, LIMITS.maxFacets)).mesh.name).toBe("model");
  });

  test("a result over the facet limit rejects with E_LIMIT", async () => {
    const err = await rejectionOf(buildCad({ version: 1, model: cad.cube(1) }, 11));
    expect(err.code).toBe("E_LIMIT");
  });

  test("a polyhedron with inward faces rejects with E_INPUT", async () => {
    const inward = cad.polyhedron([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]]);
    const err = await rejectionOf(buildCad({ version: 1, model: inward }, LIMITS.maxFacets));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("faces turn inward");
  });

  test("a clockwise polygon profile rejects with E_INPUT", async () => {
    const err = await rejectionOf(buildCad({ version: 1, model: cad.extrude(cad.polygon([[0, 0], [0, 1], [1, 0]]), 1) }, LIMITS.maxFacets));
    expect(err.code).toBe("E_INPUT");
  });

  test("the colour of a profile colours its extrusion and its revolution", async () => {
    const red: [number, number, number] = [1, 0, 0];
    for (const model of [cad.extrude(cad.rectangle(1, { color: red }), 1, { color: [0, 1, 0] }), cad.revolve(cad.rectangle(1, { color: red }), { segments: 8 })]) {
      const { mesh } = await buildCad({ version: 1, model }, LIMITS.maxFacets);
      expect(mesh.faces.map((f) => f.color)).toEqual(mesh.faces.map(() => red));
    }
  });

  test("an operation result over the facet limit rejects with E_LIMIT before the next operation", async () => {
    // The final intersection has fewer facets than the union inside it. A limit between the two must still reject.
    const spheres = cad.union([cad.sphere(1, { segments: 16 }), cad.translate([1, 0, 0], cad.sphere(1, { segments: 16 }))]);
    const model = cad.intersection([spheres, cad.cube(0.1)]);
    const union = await buildCad({ version: 1, model: spheres }, LIMITS.maxFacets);
    const unionFacets = union.mesh.indices.length / 3;
    expect((await buildCad({ version: 1, model }, LIMITS.maxFacets)).mesh.indices.length / 3).toBeLessThan(unionFacets);
    const err = await rejectionOf(buildCad({ version: 1, model }, unionFacets - 1));
    expect(err.code).toBe("E_LIMIT");
  });

  test("a polyhedron that is not closed rejects with E_INPUT", async () => {
    const open = cad.polyhedron([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], [[0, 2, 1], [0, 1, 3], [0, 3, 2], [0, 1, 2]]);
    const err = await rejectionOf(buildCad({ version: 1, model: open }, LIMITS.maxFacets));
    expect(err.code).toBe("E_INPUT");
  });
});

/** A bracket: a plate with a hole and a revolved boss, written by hand. */
const HAND_WRITTEN: CadDocument = {
  version: 1,
  segments: 24,
  model: {
    type: "difference",
    name: "bracket",
    children: [
      {
        type: "union",
        children: [
          { type: "cube", size: [4, 2, 0.5], color: [0.6, 0.6, 0.6] },
          { type: "translate", offset: [3, 1, 0], child: { type: "revolve", child: { type: "circle", radius: 0.2, segments: 12 }, degrees: 180 } },
          { type: "extrude", height: 1, child: { type: "polygon", points: [[0, 0], [1, 0], [0, 1]] }, twist: 15 },
        ],
      },
      { type: "translate", offset: [1, 1, -1], child: { type: "cylinder", height: 3, radius: 0.4, color: [0, 0, 1] } },
      { type: "mirror", normal: [0, 0, 1], child: { type: "scale", factor: [1, 1, 2], child: { type: "rotate", angles: [0, 0, 10], child: { type: "sphere", radius: 0.3 } } } },
    ],
  },
};

const BUILT = cad.cadDocument(
  cad.difference(
    [
      cad.union([
        cad.cube([4, 2, 0.5], { color: [0.6, 0.6, 0.6] }),
        cad.translate([3, 1, 0], cad.revolve(cad.circle(0.2, { segments: 12 }), { degrees: 180 })),
        cad.extrude(cad.polygon([[0, 0], [1, 0], [0, 1]]), 1, { twist: 15 }),
      ]),
      cad.translate([1, 1, -1], cad.cylinder(3, 0.4, { color: [0, 0, 1] })),
      cad.mirror([0, 0, 1], cad.scale([1, 1, 2], cad.rotate([0, 0, 10], cad.sphere(0.3)))),
    ],
    { name: "bracket" },
  ),
  { segments: 24 },
);

const request = (source: string | Uint8Array, format: string, options: Record<string, unknown> = {}): WorkerJob["request"] =>
  ({ type: "cad", format, source, options, settings: testSettings() }) as WorkerJob["request"];

describe("the builder API", () => {
  test("the builder writes the same document as the hand-written one", () => {
    expect(JSON.parse(JSON.stringify(BUILT))).toEqual(HAND_WRITTEN);
  });

  test("the builder and the hand-written document give the same mesh", async () => {
    const a = (await renderGlb(request(JSON.stringify(BUILT), "glb"))).bytes;
    const b = (await renderGlb(request(JSON.stringify(HAND_WRITTEN), "glb"))).bytes;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe("the cad backends", () => {
  test("glb: a second reader reads one mesh with a material per colour", async () => {
    const glb = readGlb((await renderGlb(request(JSON.stringify(HAND_WRITTEN), "glb"))).bytes);
    expect(glb.json.meshes).toHaveLength(1);
    expect(glb.json.meshes[0]!.name).toBe("bracket");
    expect((glb.json.materials ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("stl: the header, the facet count and the length agree; colours give a warning", async () => {
    const out = await renderStl(request(JSON.stringify(HAND_WRITTEN), "stl"));
    const view = new DataView(out.bytes.buffer, out.bytes.byteOffset, out.bytes.byteLength);
    const facets = view.getUint32(80, true);
    expect(facets).toBeGreaterThan(0);
    expect(out.bytes.byteLength).toBe(84 + 50 * facets);
    expect(new TextDecoder().decode(out.bytes.subarray(0, 5))).not.toBe("solid");
    expect(out.warnings).toEqual(["stl holds no colour; the colours of the model are dropped"]);
    const plain = await renderStl(request(JSON.stringify({ version: 1, model: { type: "cube", size: 1 } }), "stl"));
    expect(plain.warnings).toBeUndefined();
    expect(plain.bytes.byteLength).toBe(84 + 50 * 12);
  });

  test("html: the viewer page embeds the glb of the model", async () => {
    const out = await renderHtml(request(JSON.stringify(HAND_WRITTEN), "html"));
    const match = /const GLB_BASE64 = "([A-Za-z0-9+/=]+)";/.exec(new TextDecoder().decode(out.bytes));
    expect(match).not.toBeNull();
    const embedded = new Uint8Array(Buffer.from(match![1]!, "base64"));
    const direct = (await renderGlb(request(JSON.stringify(HAND_WRITTEN), "glb"))).bytes;
    expect(Buffer.from(embedded).equals(Buffer.from(direct))).toBe(true);
  });

  test("bytes, an option, an empty result and a limit reject", async () => {
    expect((await rejectionOf(readMeshes(request(new Uint8Array([1]), "glb")))).code).toBe("E_INPUT");
    expect((await rejectionOf(readMeshes(request("{}", "glb", { linearUnit: "meter" })))).message).toContain("cad takes no option linearUnit");
    const apart = cad.intersection([cad.cube(1), cad.translate([5, 0, 0], cad.cube(1))]);
    expect((await rejectionOf(readMeshes(request(JSON.stringify(cad.cadDocument(apart)), "glb")))).message).toContain("holds no triangles");
    const tooMany = { ...request(JSON.stringify(cad.cadDocument(cad.union([cad.cube(1), cad.cube(1)]))), "glb"), settings: testSettings({ maxCadNodes: 2 }) };
    expect((await rejectionOf(readMeshes(tooMany))).code).toBe("E_LIMIT");
  });
});
