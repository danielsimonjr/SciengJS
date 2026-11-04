import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderWithRegistry } from "../../src/core.ts";
import { DEFAULT_REGISTRY } from "../../src/registry.ts";
import { readCad } from "../../src/mesh/read.ts";
import { ISOLATED_CONFIG_DEPS } from "../support/test-registry.ts";
import { readGlb } from "../support/glb-reader.ts";

const CORPUS = fileURLToPath(new URL("../corpus/mesh/", import.meta.url));
const load = (name: string): Uint8Array => new Uint8Array(readFileSync(CORPUS + name));

const STEP = load("red_cube_blue_cylinder.step");
const IGES = load("cube-10x10mm.igs");
const BREP = load("cylinder1.brep");

const renderGlb = (type: "step" | "iges" | "brep", source: Uint8Array, options?: Record<string, unknown>) =>
  renderWithRegistry({ type, source, format: "glb", options }, {}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);

describe("the default registry of the mesh stage", () => {
  test("holds step, iges and brep to glb, and each module file exists", () => {
    for (const type of ["step", "iges", "brep"]) {
      const entry = DEFAULT_REGISTRY[`${type}:glb`];
      expect(entry).toBeDefined();
      expect(existsSync(fileURLToPath(entry!.moduleUrl))).toBe(true);
      expect(entry!.backend).toBe("mesh/occt+glb");
    }
  });

  test("the corpus holds the three samples and their licence texts", () => {
    for (const name of ["red_cube_blue_cylinder.step", "cube-10x10mm.igs", "cylinder1.brep", "LICENSES/Apache-2.0.cadquery.txt"]) {
      expect(existsSync(CORPUS + name)).toBe(true);
    }
  });
});

describe("the glb output of the samples", () => {
  test("the coloured STEP sample gives a valid glb with one material per face colour", async () => {
    const result = await renderGlb("step", STEP);
    expect(result.mime).toBe("model/gltf-binary");
    expect(result.backend).toBe("mesh/occt+glb");
    const doc = readGlb(result.bytes);
    expect(doc.primitives.length).toBeGreaterThanOrEqual(2);

    const faces = await readCad("step", STEP);
    const colours = new Set<string>();
    for (const mesh of faces) {
      for (const face of mesh.faces) if (face.color) colours.add(face.color.map((v) => v.toFixed(6)).join(","));
    }
    expect(colours.size).toBe(2);
    const materialColours = new Set(doc.materials.map((m) => m.baseColorFactor.slice(0, 3).map((v) => v.toFixed(6)).join(",")));
    for (const colour of colours) expect(materialColours.has(colour)).toBe(true);
  });

  test("the IGES sample gives a valid glb", async () => {
    const doc = readGlb((await renderGlb("iges", IGES)).bytes);
    expect(doc.primitives.length).toBeGreaterThanOrEqual(1);
    expect(doc.primitives.reduce((n, p) => n + p.indices.length / 3, 0)).toBe(12);
  });

  test("the BREP sample gives a valid glb with the default material", async () => {
    const doc = readGlb((await renderGlb("brep", BREP)).bytes);
    expect(doc.primitives.reduce((n, p) => n + p.indices.length / 3, 0)).toBe(228);
    expect(doc.materials.length).toBe(1);
    expect(doc.materials[0]!.baseColorFactor).toEqual([0.8, 0.8, 0.8, 1]);
  });

  test("the positions carry the millimetre values by default and the metre values with linearUnit meter", async () => {
    const mm = readGlb((await renderGlb("step", STEP)).bytes);
    const m = readGlb((await renderGlb("step", STEP, { linearUnit: "meter" })).bytes);
    const mmMax = Math.max(...mm.primitives.flatMap((p) => Array.from(p.positions)).map(Math.abs));
    const mMax = Math.max(...m.primitives.flatMap((p) => Array.from(p.positions)).map(Math.abs));
    expect(mmMax).toBeCloseTo(15, 3);
    expect(mMax).toBeCloseTo(0.015, 6);
  });
});

describe("the glb options", () => {
  test("an unknown option rejects with E_INPUT", async () => {
    await expect(renderGlb("step", STEP, { scale: 2 })).rejects.toMatchObject({ code: "E_INPUT" });
  });

  test("an unknown linear unit rejects with E_INPUT", async () => {
    await expect(renderGlb("step", STEP, { linearUnit: "inch" })).rejects.toMatchObject({ code: "E_INPUT" });
  });

  test("the BREP reader takes no option", async () => {
    await expect(renderGlb("brep", BREP, { linearUnit: "meter" })).rejects.toMatchObject({ code: "E_INPUT" });
  });

  test("bytes that are not a CAD file reject with E_INPUT", async () => {
    await expect(renderGlb("step", new TextEncoder().encode("not a step file"))).rejects.toMatchObject({ code: "E_INPUT" });
  });
});
