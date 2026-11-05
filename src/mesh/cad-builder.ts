import type {
  BooleanNode,
  CadDocument,
  CadStyle,
  CircleNode,
  CubeNode,
  CylinderNode,
  ExtrudeNode,
  MirrorNode,
  PolygonNode,
  PolyhedronNode,
  ProfileNode,
  RectangleNode,
  RevolveNode,
  RotateNode,
  ScaleNode,
  SolidNode,
  SphereNode,
  TranslateNode,
  Vec2,
  Vec3,
} from "./cad-document.ts";

/**
 * The builder API: functions that write the nodes of a CAD document. A program that uses the builder functions runs in the
 * caller's process. The engine receives only the document, as data.
 */

/** Returns the object without the keys whose value is undefined, so the document holds only given keys. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** The options of a cube. */
export type CubeOptions = CadStyle & { center?: boolean };
/** The options of a node with segments. */
export type RoundOptions = CadStyle & { segments?: number };

/** A box. A number gives a box with equal sides. */
export function cube(size: number | Vec3, options: CubeOptions = {}): CubeNode {
  return compact({ type: "cube", size, ...options });
}

/** A cylinder. Give one radius, or the bottom and the top radius for a cone. */
export function cylinder(height: number, radius: number | [number, number], options: RoundOptions & { center?: boolean } = {}): CylinderNode {
  const radii = typeof radius === "number" ? { radius } : { radius1: radius[0], radius2: radius[1] };
  return compact({ type: "cylinder", height, ...radii, ...options });
}

/** A sphere centred on the origin. */
export function sphere(radius: number, options: RoundOptions = {}): SphereNode {
  return compact({ type: "sphere", radius, ...options });
}

/** A closed solid from points and convex faces, counter-clockwise seen from outside. */
export function polyhedron(points: Vec3[], faces: number[][], options: CadStyle = {}): PolyhedronNode {
  return compact({ type: "polyhedron", points, faces, ...options });
}

/** A rectangle profile. */
export function rectangle(size: number | Vec2, options: CubeOptions = {}): RectangleNode {
  return compact({ type: "rectangle", size, ...options });
}

/** A circle profile. */
export function circle(radius: number, options: RoundOptions = {}): CircleNode {
  return compact({ type: "circle", radius, ...options });
}

/** A polygon profile, counter-clockwise. */
export function polygon(points: Vec2[], options: CadStyle = {}): PolygonNode {
  return compact({ type: "polygon", points, ...options });
}

/** The options of an extrusion. */
export type ExtrudeOptions = CadStyle & { twist?: number; scale?: number | Vec2; divisions?: number; center?: boolean };

/** Pulls a profile along the z axis. */
export function extrude(profile: ProfileNode, height: number, options: ExtrudeOptions = {}): ExtrudeNode {
  return compact({ type: "extrude", height, child: profile, ...options });
}

/** Turns a profile around its y axis. */
export function revolve(profile: ProfileNode, options: RoundOptions & { degrees?: number } = {}): RevolveNode {
  return compact({ type: "revolve", child: profile, ...options });
}

/** The union of the solids. */
export function union(children: SolidNode[], options: CadStyle = {}): BooleanNode {
  return compact({ type: "union", children, ...options });
}

/** The first solid minus the others. */
export function difference(children: SolidNode[], options: CadStyle = {}): BooleanNode {
  return compact({ type: "difference", children, ...options });
}

/** The common part of the solids. */
export function intersection(children: SolidNode[], options: CadStyle = {}): BooleanNode {
  return compact({ type: "intersection", children, ...options });
}

/** Moves a solid. */
export function translate(offset: Vec3, child: SolidNode, options: CadStyle = {}): TranslateNode {
  return compact({ type: "translate", offset, child, ...options });
}

/** Turns a solid about x, then y, then z, in degrees. */
export function rotate(angles: Vec3, child: SolidNode, options: CadStyle = {}): RotateNode {
  return compact({ type: "rotate", angles, child, ...options });
}

/** Scales a solid. */
export function scale(factor: number | Vec3, child: SolidNode, options: CadStyle = {}): ScaleNode {
  return compact({ type: "scale", factor, child, ...options });
}

/** Reflects a solid through the plane through the origin with this normal. */
export function mirror(normal: Vec3, child: SolidNode, options: CadStyle = {}): MirrorNode {
  return compact({ type: "mirror", normal, child, ...options });
}

/** Writes the document of a model. Give the result to `render` as `JSON.stringify(document)`. */
export function cadDocument(model: SolidNode, options: { segments?: number } = {}): CadDocument {
  return compact({ version: 1 as const, model, ...options });
}
