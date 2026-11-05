import { RenderError } from "../errors.ts";

/** A point or a size in 2D. */
export type Vec2 = [number, number];
/** A point, a size or a direction in 3D. */
export type Vec3 = [number, number, number];
/** A colour: red, green and blue, each from 0 to 1. */
export type Rgb = [number, number, number];

/** The keys that every node can carry. */
export interface CadStyle {
  name?: string;
  color?: Rgb;
}

/** A box with one corner at the origin, or centred on the origin. */
export interface CubeNode extends CadStyle {
  type: "cube";
  size: number | Vec3;
  center?: boolean;
}

/** A cylinder or a cone along the z axis. Give `radius`, or `radius1` (bottom) and `radius2` (top). */
export interface CylinderNode extends CadStyle {
  type: "cylinder";
  height: number;
  radius?: number;
  radius1?: number;
  radius2?: number;
  center?: boolean;
  segments?: number;
}

/** A sphere centred on the origin. */
export interface SphereNode extends CadStyle {
  type: "sphere";
  radius: number;
  segments?: number;
}

/** A closed solid from points and faces. Each face is convex and counter-clockwise, seen from outside. */
export interface PolyhedronNode extends CadStyle {
  type: "polyhedron";
  points: Vec3[];
  faces: number[][];
}

/** A rectangle with one corner at the origin, or centred on the origin. */
export interface RectangleNode extends CadStyle {
  type: "rectangle";
  size: number | Vec2;
  center?: boolean;
}

/** A circle centred on the origin. */
export interface CircleNode extends CadStyle {
  type: "circle";
  radius: number;
  segments?: number;
}

/** A simple polygon, counter-clockwise. */
export interface PolygonNode extends CadStyle {
  type: "polygon";
  points: Vec2[];
}

/** A 2D profile. Use a profile only as the child of extrude or revolve. */
export type ProfileNode = RectangleNode | CircleNode | PolygonNode;

/** A profile pulled along the z axis. */
export interface ExtrudeNode extends CadStyle {
  type: "extrude";
  height: number;
  child: ProfileNode;
  /** The twist of the top against the bottom, in degrees. */
  twist?: number;
  /** The scale of the top against the bottom. */
  scale?: number | Vec2;
  /** The number of extra layers between the bottom and the top. */
  divisions?: number;
  center?: boolean;
}

/** A profile turned around the y axis of the profile, which becomes the z axis of the solid. */
export interface RevolveNode extends CadStyle {
  type: "revolve";
  child: ProfileNode;
  degrees?: number;
  segments?: number;
}

/** A boolean operation. `difference` subtracts the second and later children from the first. */
export interface BooleanNode extends CadStyle {
  type: "union" | "difference" | "intersection";
  children: SolidNode[];
}

/** A move of a solid by an offset. */
export interface TranslateNode extends CadStyle {
  type: "translate";
  offset: Vec3;
  child: SolidNode;
}

/** A rotation about x, then y, then z, in degrees. */
export interface RotateNode extends CadStyle {
  type: "rotate";
  angles: Vec3;
  child: SolidNode;
}

/** A scale of a solid: one factor, or one factor per axis. */
export interface ScaleNode extends CadStyle {
  type: "scale";
  factor: number | Vec3;
  child: SolidNode;
}

/** A reflection through the plane through the origin with this normal. */
export interface MirrorNode extends CadStyle {
  type: "mirror";
  normal: Vec3;
  child: SolidNode;
}

/** A 3D node. */
export type SolidNode =
  | CubeNode
  | CylinderNode
  | SphereNode
  | PolyhedronNode
  | ExtrudeNode
  | RevolveNode
  | BooleanNode
  | TranslateNode
  | RotateNode
  | ScaleNode
  | MirrorNode;

/** Any node of a CAD document. */
export type CadNode = SolidNode | ProfileNode;

/** A CAD document: data only. The engine executes no code from the document. */
export interface CadDocument {
  version: 1;
  model: SolidNode;
  /** The default number of segments of a full circle. */
  segments?: number;
}

/** The limits of one document. */
export interface CadLimits {
  maxNodes: number;
  maxFacets: number;
}

/** A checked document with its node count and its facet estimate. */
export interface CheckedCadDocument {
  document: CadDocument;
  nodes: number;
  facetEstimate: number;
}

/** The default number of segments of a full circle. */
export const DEFAULT_SEGMENTS = 32;
/** The range of a segments value. */
export const MIN_SEGMENTS = 3;
export const MAX_SEGMENTS = 1024;

type Json = Record<string, unknown>;

const STYLE_KEYS = ["type", "name", "color"];

/** The keys of each node type, after the style keys. */
const NODE_KEYS: Record<CadNode["type"], readonly string[]> = {
  cube: ["size", "center"],
  cylinder: ["height", "radius", "radius1", "radius2", "center", "segments"],
  sphere: ["radius", "segments"],
  polyhedron: ["points", "faces"],
  rectangle: ["size", "center"],
  circle: ["radius", "segments"],
  polygon: ["points"],
  extrude: ["height", "child", "twist", "scale", "divisions", "center"],
  revolve: ["child", "degrees", "segments"],
  union: ["children"],
  difference: ["children"],
  intersection: ["children"],
  translate: ["offset", "child"],
  rotate: ["angles", "child"],
  scale: ["factor", "child"],
  mirror: ["normal", "child"],
};

const PROFILE_TYPES: readonly string[] = ["rectangle", "circle", "polygon"];

/** The largest number of extrude divisions. */
const MAX_DIVISIONS = 1024;

const fail = (path: string, why: string): never => {
  throw new RenderError("E_INPUT", `${path} ${why}`);
};

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fail(path, "must be a finite number");
  return value;
}

function positive(value: unknown, path: string): number {
  const n = finite(value, path);
  if (n <= 0) fail(path, "must be greater than 0");
  return n;
}

function nonNegative(value: unknown, path: string): number {
  const n = finite(value, path);
  if (n < 0) fail(path, "must not be negative");
  return n;
}

function vector(value: unknown, length: number, path: string, check: (v: unknown, p: string) => number = finite): number[] {
  if (!Array.isArray(value) || value.length !== length) return fail(path, `must be a list of ${length} numbers`);
  return value.map((v, i) => check(v, `${path}[${i}]`));
}

function sizeOf(value: unknown, length: number, path: string): void {
  if (typeof value === "number") positive(value, path);
  else vector(value, length, path, positive);
}

function bool(value: unknown, path: string): void {
  if (typeof value !== "boolean") fail(path, "must be true or false");
}

function segmentsOf(value: unknown, path: string): number {
  const n = finite(value, path);
  if (!Number.isInteger(n) || n < MIN_SEGMENTS || n > MAX_SEGMENTS) {
    fail(path, `must be a whole number from ${MIN_SEGMENTS} to ${MAX_SEGMENTS}`);
  }
  return n;
}

function list(value: unknown, path: string, min: number): unknown[] {
  if (!Array.isArray(value) || value.length < min) return fail(path, `must be a list of ${min} or more items`);
  return value;
}

/** The walk state: the node count, the facet estimate and the limits. */
interface Walk {
  nodes: number;
  facets: number;
  limits: CadLimits;
  segments: number;
}

function countNode(walk: Walk): void {
  walk.nodes += 1;
  if (walk.nodes > walk.limits.maxNodes) {
    throw new RenderError("E_LIMIT", `the document has more than ${walk.limits.maxNodes} nodes`);
  }
}

function addFacets(walk: Walk, facets: number): void {
  walk.facets += facets;
  if (walk.facets > walk.limits.maxFacets) {
    throw new RenderError("E_LIMIT", `the model needs more than ${walk.limits.maxFacets} facets`);
  }
}

/** The facets of a sphere: the engine refines an octahedron, so the segments round up to a multiple of 4. */
export function sphereFacets(segments: number): number {
  const k = Math.ceil(segments / 4);
  return 8 * k * k;
}

function checkStyle(node: Json, path: string): void {
  if (node.name !== undefined && typeof node.name !== "string") fail(`${path}.name`, "must be a string");
  if (node.color !== undefined) {
    vector(node.color, 3, `${path}.color`, (v, p) => {
      const n = finite(v, p);
      if (n < 0 || n > 1) fail(p, "must be from 0 to 1");
      return n;
    });
  }
}

function checkKeys(node: Json, type: CadNode["type"], path: string): void {
  const allowed = [...STYLE_KEYS, ...NODE_KEYS[type]];
  for (const key of Object.keys(node)) {
    if (!allowed.includes(key)) fail(`${path}.${key}`, `is not a key of ${type}`);
  }
}

function required(node: Json, key: string, path: string): unknown {
  if (node[key] === undefined) fail(`${path}.${key}`, "is missing");
  return node[key];
}

function nodeSegments(node: Json, path: string, walk: Walk): number {
  return node.segments === undefined ? walk.segments : segmentsOf(node.segments, `${path}.segments`);
}

/** Checks one profile and returns its number of edges. */
function checkProfile(value: unknown, path: string, walk: Walk): number {
  if (!isObject(value)) return fail(path, "must be an object");
  const type = value.type;
  if (typeof type !== "string" || !PROFILE_TYPES.includes(type)) {
    return fail(`${path}.type`, "must be a 2D profile: rectangle, circle or polygon");
  }
  countNode(walk);
  checkKeys(value, type as ProfileNode["type"], path);
  checkStyle(value, path);
  switch (type) {
    case "rectangle":
      sizeOf(required(value, "size", path), 2, `${path}.size`);
      if (value.center !== undefined) bool(value.center, `${path}.center`);
      return 4;
    case "circle":
      positive(required(value, "radius", path), `${path}.radius`);
      return nodeSegments(value, path, walk);
    default: {
      const points = list(required(value, "points", path), `${path}.points`, 3);
      points.forEach((p, i) => vector(p, 2, `${path}.points[${i}]`));
      return points.length;
    }
  }
}

/** Checks one 3D node and its subtree. */
function checkSolid(value: unknown, path: string, walk: Walk): void {
  if (!isObject(value)) return fail(path, "must be an object");
  const type = value.type;
  if (typeof type !== "string" || !Object.hasOwn(NODE_KEYS, type)) return fail(`${path}.type`, "is not a node type");
  if (PROFILE_TYPES.includes(type)) return fail(`${path}.type`, `${type} is a 2D profile; use it as the child of extrude or revolve`);
  countNode(walk);
  checkKeys(value, type as CadNode["type"], path);
  checkStyle(value, path);
  const childOf = (): void => checkSolid(required(value, "child", path), `${path}.child`, walk);
  switch (type) {
    case "cube":
      sizeOf(required(value, "size", path), 3, `${path}.size`);
      if (value.center !== undefined) bool(value.center, `${path}.center`);
      addFacets(walk, 12);
      return;
    case "cylinder": {
      positive(required(value, "height", path), `${path}.height`);
      if (value.radius !== undefined) {
        if (value.radius1 !== undefined || value.radius2 !== undefined) fail(`${path}.radius`, "excludes radius1 and radius2");
        positive(value.radius, `${path}.radius`);
      } else {
        const r1 = nonNegative(required(value, "radius1", path), `${path}.radius1`);
        const r2 = nonNegative(required(value, "radius2", path), `${path}.radius2`);
        if (r1 === 0 && r2 === 0) fail(`${path}.radius1`, "and radius2 must not both be 0");
      }
      if (value.center !== undefined) bool(value.center, `${path}.center`);
      addFacets(walk, 4 * nodeSegments(value, path, walk));
      return;
    }
    case "sphere":
      positive(required(value, "radius", path), `${path}.radius`);
      addFacets(walk, sphereFacets(nodeSegments(value, path, walk)));
      return;
    case "polyhedron": {
      const points = list(required(value, "points", path), `${path}.points`, 4);
      points.forEach((p, i) => vector(p, 3, `${path}.points[${i}]`));
      const faces = list(required(value, "faces", path), `${path}.faces`, 4);
      let facets = 0;
      faces.forEach((f, i) => {
        const face = list(f, `${path}.faces[${i}]`, 3);
        face.forEach((v, j) => {
          if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= points.length) {
            fail(`${path}.faces[${i}][${j}]`, `must be a point index from 0 to ${points.length - 1}`);
          }
        });
        facets += face.length - 2;
      });
      addFacets(walk, facets);
      return;
    }
    case "extrude": {
      positive(required(value, "height", path), `${path}.height`);
      if (value.twist !== undefined) finite(value.twist, `${path}.twist`);
      if (value.scale !== undefined) {
        if (typeof value.scale === "number") nonNegative(value.scale, `${path}.scale`);
        else vector(value.scale, 2, `${path}.scale`, nonNegative);
      }
      let divisions = 0;
      if (value.divisions !== undefined) {
        divisions = finite(value.divisions, `${path}.divisions`);
        if (!Number.isInteger(divisions) || divisions < 0 || divisions > MAX_DIVISIONS) {
          fail(`${path}.divisions`, `must be a whole number from 0 to ${MAX_DIVISIONS}`);
        }
      }
      if (value.center !== undefined) bool(value.center, `${path}.center`);
      const edges = checkProfile(required(value, "child", path), `${path}.child`, walk);
      addFacets(walk, 2 * edges * (divisions + 1) + 2 * edges);
      return;
    }
    case "revolve": {
      if (value.degrees !== undefined) {
        const d = positive(value.degrees, `${path}.degrees`);
        if (d > 360) fail(`${path}.degrees`, "must not be more than 360");
      }
      const segments = nodeSegments(value, path, walk);
      const edges = checkProfile(required(value, "child", path), `${path}.child`, walk);
      addFacets(walk, 2 * edges * segments + 2 * edges);
      return;
    }
    case "union":
    case "difference":
    case "intersection": {
      const children = list(required(value, "children", path), `${path}.children`, 1);
      children.forEach((c, i) => checkSolid(c, `${path}.children[${i}]`, walk));
      return;
    }
    case "translate":
      vector(required(value, "offset", path), 3, `${path}.offset`);
      return childOf();
    case "rotate":
      vector(required(value, "angles", path), 3, `${path}.angles`);
      return childOf();
    case "scale": {
      const factor = required(value, "factor", path);
      if (typeof factor === "number") positive(factor, `${path}.factor`);
      else vector(factor, 3, `${path}.factor`, positive);
      return childOf();
    }
    default: {
      const n = vector(required(value, "normal", path), 3, `${path}.normal`);
      if (n.every((c) => c === 0)) fail(`${path}.normal`, "must not be the zero vector");
      return childOf();
    }
  }
}

/** Checks a parsed document. The function rejects with E_INPUT on a bad value and with E_LIMIT over a limit. */
export function checkCadDocument(value: unknown, limits: CadLimits): CheckedCadDocument {
  if (!isObject(value)) return fail("document", "must be an object");
  for (const key of Object.keys(value)) {
    if (!["version", "model", "segments"].includes(key)) fail(key, "is not a key of the document");
  }
  if (value.version !== 1) fail("version", "must be 1");
  const walk: Walk = { nodes: 0, facets: 0, limits, segments: DEFAULT_SEGMENTS };
  if (value.segments !== undefined) walk.segments = segmentsOf(value.segments, "segments");
  checkSolid(required(value, "model", "document"), "model", walk);
  return { document: value as unknown as CadDocument, nodes: walk.nodes, facetEstimate: walk.facets };
}

/** Parses and checks the JSON text of a CAD document. Text that is not JSON rejects with E_INPUT. */
export function parseCadDocument(text: string, limits: CadLimits): CheckedCadDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new RenderError("E_INPUT", `the CAD document is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return checkCadDocument(value, limits);
}
