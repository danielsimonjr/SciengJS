// Tests of the CAD document reader: a test per node type, a test per rejection, and the node and facet limits.
import { describe, expect, test } from "bun:test";
import { checkCadDocument, parseCadDocument, sphereFacets, type CadLimits, type CheckedCadDocument } from "../../src/mesh/cad-document.ts";
import { RenderError } from "../../src/errors.ts";

const LIMITS: CadLimits = { maxNodes: 10000, maxFacets: 2000000 };
const doc = (model: unknown, extra: Record<string, unknown> = {}) => ({ version: 1, model, ...extra });

function rejects(value: unknown, code: string, text: string, limits: CadLimits = LIMITS): void {
  let caught: unknown;
  try {
    checkCadDocument(value, limits);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(RenderError);
  expect((caught as RenderError).code).toBe(code as RenderError["code"]);
  expect((caught as RenderError).message).toContain(text);
}

/** Checks a document that must pass. A rejection fails an assertion, so a mutation audit counts the kill. */
function accepted(value: unknown, limits: CadLimits = LIMITS): CheckedCadDocument {
  let result: CheckedCadDocument | undefined;
  let caught: unknown;
  try {
    result = checkCadDocument(value, limits);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeUndefined();
  return result!;
}

const rect = { type: "rectangle", size: [1, 2] };
const cube = { type: "cube", size: 1 };

describe("the CAD reader accepts each node type", () => {
  const cases: [string, unknown, number, number][] = [
    ["cube", { type: "cube", size: [1, 2, 3], center: true, name: "box", color: [1, 0, 0] }, 1, 12],
    ["cylinder with one radius", { type: "cylinder", height: 2, radius: 1, segments: 16, center: false }, 1, 64],
    ["cone with two radii", { type: "cylinder", height: 2, radius1: 1, radius2: 0 }, 1, 128],
    ["sphere", { type: "sphere", radius: 1, segments: 16 }, 1, 128],
    ["polyhedron", { type: "polyhedron", points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], faces: [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]] }, 1, 4],
    ["extrude of a rectangle", { type: "extrude", height: 1, child: rect, twist: 10, scale: [1, 0.5], divisions: 2, center: true }, 2, 32],
    ["extrude of a circle", { type: "extrude", height: 1, child: { type: "circle", radius: 1, segments: 8 }, scale: 0 }, 2, 32],
    ["revolve of a polygon", { type: "revolve", degrees: 90, segments: 8, child: { type: "polygon", points: [[1, 0], [2, 0], [2, 1]] } }, 2, 54],
    ["union", { type: "union", children: [cube, cube] }, 3, 24],
    ["difference", { type: "difference", children: [cube, cube] }, 3, 24],
    ["intersection", { type: "intersection", children: [cube] }, 2, 12],
    ["translate", { type: "translate", offset: [1, 2, 3], child: cube }, 2, 12],
    ["rotate", { type: "rotate", angles: [0, 0, 45], child: cube }, 2, 12],
    ["scale by a number", { type: "scale", factor: 2, child: cube }, 2, 12],
    ["scale by a vector", { type: "scale", factor: [1, 2, 3], child: cube }, 2, 12],
    ["mirror", { type: "mirror", normal: [1, 0, 0], child: cube }, 2, 12],
  ];
  for (const [label, model, nodes, facets] of cases) {
    test(label, () => {
      const checked = accepted(doc(model), LIMITS);
      expect(checked.nodes).toBe(nodes);
      expect(checked.facetEstimate).toBe(facets);
    });
  }

  test("the boundary values are accepted: a full revolve and 1024 divisions", () => {
    expect(accepted(doc({ type: "revolve", degrees: 360, segments: 8, child: rect }), LIMITS).facetEstimate).toBe(72);
    expect(accepted(doc({ type: "extrude", height: 1, divisions: 1024, child: rect }), LIMITS).facetEstimate).toBe(8208);
  });

  test("the document segments set the default; a node overrides it", () => {
    expect(accepted(doc({ type: "cylinder", height: 1, radius: 1 }, { segments: 10 }), LIMITS).facetEstimate).toBe(40);
    expect(accepted(doc({ type: "cylinder", height: 1, radius: 1, segments: 5 }, { segments: 10 }), LIMITS).facetEstimate).toBe(20);
    expect(accepted(doc({ type: "cylinder", height: 1, radius: 1 }), LIMITS).facetEstimate).toBe(128);
  });

  test("the sphere estimate rounds the segments up to a multiple of 4", () => {
    expect(sphereFacets(13)).toBe(128);
    expect(sphereFacets(16)).toBe(128);
    expect(sphereFacets(17)).toBe(200);
  });

  test("a chain of 10000 nested nodes is checked without a stack overflow", () => {
    let model: unknown = cube;
    for (let i = 0; i < 9999; i++) model = { type: "translate", offset: [0, 0, 0], child: model };
    expect(accepted(doc(model)).nodes).toBe(10000);
  });

  test("parseCadDocument reads JSON text", () => {
    expect(parseCadDocument(JSON.stringify(doc(cube)), LIMITS).nodes).toBe(1);
  });
});

describe("the CAD reader rejects", () => {
  const cases: [string, unknown, string][] = [
    ["text that is not an object", [], "document must be an object"],
    ["a wrong version", { version: 2, model: cube }, "version must be 1"],
    ["an unknown document key", { version: 1, model: cube, units: "mm" }, "units is not a key of the document"],
    ["a missing model", { version: 1 }, "document.model is missing"],
    ["segments under 3", doc(cube, { segments: 2 }), "segments must be a whole number from 3 to 1024"],
    ["segments over 1024", doc(cube, { segments: 1025 }), "segments must be a whole number"],
    ["fractional segments", doc(cube, { segments: 3.5 }), "segments must be a whole number"],
    ["a node that is not an object", doc(5), "model must be an object"],
    ["an unknown type", doc({ type: "torus" }), "model.type is not a node type"],
    ["an inherited object key as the type", doc({ type: "constructor" }), "model.type is not a node type"],
    ["__proto__ as the type", doc({ type: "__proto__" }), "model.type is not a node type"],
    ["toString as the type", doc({ type: "toString" }), "model.type is not a node type"],
    ["a profile at the top", doc(rect), "rectangle is a 2D profile"],
    ["a profile in a union", doc({ type: "union", children: [cube, rect] }), "model.children[1].type"],
    ["a solid as a profile", doc({ type: "extrude", height: 1, child: cube }), "model.child.type must be a 2D profile"],
    ["an unknown key", doc({ type: "cube", size: 1, radius: 2 }), "model.radius is not a key of cube"],
    ["a missing size", doc({ type: "cube" }), "model.size is missing"],
    ["a size of 0", doc({ type: "cube", size: 0 }), "model.size must be greater than 0"],
    ["a negative vector size", doc({ type: "cube", size: [1, -1, 1] }), "model.size[1] must be greater than 0"],
    ["a size vector of the wrong length", doc({ type: "cube", size: [1, 1] }), "model.size must be a list of 3 numbers"],
    ["a size that is not a number", doc({ type: "cube", size: "1" }), "model.size must be a list of 3 numbers"],
    ["a size element that is not finite", doc({ type: "cube", size: [1, null, 1] }), "model.size[1] must be a finite number"],
    ["a center that is not a boolean", doc({ type: "cube", size: 1, center: 1 }), "model.center must be true or false"],
    ["a name that is not a string", doc({ type: "cube", size: 1, name: 3 }), "model.name must be a string"],
    ["a colour out of range", doc({ type: "cube", size: 1, color: [0, 2, 0] }), "model.color[1] must be from 0 to 1"],
    ["a colour of the wrong length", doc({ type: "cube", size: 1, color: [0, 0] }), "model.color must be a list of 3 numbers"],
    ["radius with radius1", doc({ type: "cylinder", height: 1, radius: 1, radius1: 1 }), "model.radius excludes radius1 and radius2"],
    ["a cylinder with no radius", doc({ type: "cylinder", height: 1 }), "model.radius1 is missing"],
    ["a cone with two zero radii", doc({ type: "cylinder", height: 1, radius1: 0, radius2: 0 }), "must not both be 0"],
    ["a negative cone radius", doc({ type: "cylinder", height: 1, radius1: -1, radius2: 1 }), "model.radius1 must not be negative"],
    ["a node segments value out of range", doc({ type: "sphere", radius: 1, segments: 2000 }), "model.segments must be a whole number"],
    ["a polyhedron with too few points", doc({ type: "polyhedron", points: [[0, 0, 0]], faces: [] }), "model.points must be a list of 4 or more items"],
    ["a polyhedron face index out of range", doc({ type: "polyhedron", points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], faces: [[0, 1, 9], [0, 1, 3], [0, 3, 2], [1, 2, 3]] }), "model.faces[0][2] must be a point index from 0 to 3"],
    ["a polyhedron face with two points", doc({ type: "polyhedron", points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], faces: [[0, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]] }), "model.faces[0] must be a list of 3 or more items"],
    ["a polyhedron face index equal to the point count", doc({ type: "polyhedron", points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], faces: [[0, 1, 4], [0, 1, 3], [0, 3, 2], [1, 2, 3]] }), "model.faces[0][2] must be a point index from 0 to 3"],
    ["divisions over 1024", doc({ type: "extrude", height: 1, child: rect, divisions: 1025 }), "model.divisions must be a whole number from 0 to 1024"],
    ["a polygon with two points", doc({ type: "extrude", height: 1, child: { type: "polygon", points: [[0, 0], [1, 0]] } }), "model.child.points must be a list of 3 or more items"],
    ["a circle with no radius", doc({ type: "extrude", height: 1, child: { type: "circle" } }), "model.child.radius is missing"],
    ["an unknown profile key", doc({ type: "extrude", height: 1, child: { ...rect, height: 3 } }), "model.child.height is not a key of rectangle"],
    ["a negative extrude scale", doc({ type: "extrude", height: 1, child: rect, scale: -1 }), "model.scale must not be negative"],
    ["fractional divisions", doc({ type: "extrude", height: 1, child: rect, divisions: 1.5 }), "model.divisions must be a whole number from 0 to 1024"],
    ["a twist that is not finite", doc({ type: "extrude", height: 1, child: rect, twist: null }), "model.twist must be a finite number"],
    ["a revolve over 360 degrees", doc({ type: "revolve", degrees: 361, child: rect }), "model.degrees must not be more than 360"],
    ["an empty union", doc({ type: "union", children: [] }), "model.children must be a list of 1 or more items"],
    ["a translate with no child", doc({ type: "translate", offset: [0, 0, 0] }), "model.child is missing"],
    ["a rotate with two angles", doc({ type: "rotate", angles: [0, 0], child: cube }), "model.angles must be a list of 3 numbers"],
    ["a scale factor of 0", doc({ type: "scale", factor: 0, child: cube }), "model.factor must be greater than 0"],
    ["a zero mirror normal", doc({ type: "mirror", normal: [0, 0, 0], child: cube }), "model.normal must not be the zero vector"],
    ["a deep bad value names its path", doc({ type: "union", children: [cube, { type: "translate", offset: [0, 0, 0], child: { type: "sphere", radius: -1 } }] }), "model.children[1].child.radius must be greater than 0"],
  ];
  for (const [label, value, text] of cases) {
    test(label + " with E_INPUT", () => rejects(value, "E_INPUT", text));
  }

  test("text that is not JSON with E_INPUT", () => {
    expect(() => parseCadDocument("{", LIMITS)).toThrow("the CAD document is not JSON");
  });

  test("a document over the node limit with E_LIMIT, before any build", () => {
    const model = { type: "union", children: [cube, cube, cube] };
    expect(accepted(doc(model), { ...LIMITS, maxNodes: 4 }).nodes).toBe(4);
    rejects(doc(model), "E_LIMIT", "more than 3 nodes", { ...LIMITS, maxNodes: 3 });
  });

  test("a document over the facet estimate with E_LIMIT, before any build", () => {
    expect(accepted(doc(cube), { ...LIMITS, maxFacets: 12 }).facetEstimate).toBe(12);
    rejects(doc(cube), "E_LIMIT", "more than 11 facets", { ...LIMITS, maxFacets: 11 });
    rejects(doc({ type: "sphere", radius: 1, segments: 1024 }), "E_LIMIT", "more than 100000 facets", { ...LIMITS, maxFacets: 100000 });
  });
});
