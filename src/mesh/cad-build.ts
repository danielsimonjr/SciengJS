import { RenderError } from "../errors.ts";
import type { CadDocument, ProfileNode, Rgb, SolidNode } from "./cad-document.ts";
import { DEFAULT_SEGMENTS } from "./cad-document.ts";
import type { CadFace, CadMesh } from "./read.ts";

/** The parts of the manifold-3d module that the build uses. */
interface ManifoldModule {
  Manifold: ManifoldStatic;
  CrossSection: CrossSectionStatic;
  setup(): void;
}

interface Solid {
  translate(v: number[]): Solid;
  rotate(v: number[]): Solid;
  scale(v: number[] | number): Solid;
  mirror(v: number[]): Solid;
  asOriginal(): Solid;
  originalID(): number;
  calculateNormals(normalIdx: number, minSharpAngle: number): Solid;
  getMesh(normalIdx?: number): ManifoldMesh;
  numTri(): number;
  volume(): number;
  surfaceArea(): number;
  boundingBox(): { min: number[]; max: number[] };
  status(): string;
  slice(height: number): Section;
  project(): Section;
  delete(): void;
}

/** A planar section of a solid. Each polygon is a closed contour of [x, y] points. */
interface Section {
  toPolygons(): number[][][];
  offset(delta: number, joinType: "Round", miterLimit: number, circularSegments: number): Section;
  subtract(other: Section): Section;
  intersect(other: Section): Section;
  translate(v: number[]): Section;
  simplify(epsilon: number): Section;
  decompose(): Section[];
  area(): number;
  delete(): void;
}

interface Profile {
  extrude(height: number, divisions: number, twist: number, scaleTop: number[], center: boolean): Solid;
  revolve(segments: number, degrees: number): Solid;
  delete(): void;
}

interface ManifoldStatic {
  cube(size: number[] | number, center: boolean): Solid;
  cylinder(height: number, radiusLow: number, radiusHigh: number, segments: number, center: boolean): Solid;
  sphere(radius: number, segments: number): Solid;
  ofMesh(mesh: unknown): Solid;
  union(list: Solid[]): Solid;
  difference(list: Solid[]): Solid;
  intersection(list: Solid[]): Solid;
}

interface CrossSectionStatic {
  square(size: number[] | number, center: boolean): Profile & Section;
  circle(radius: number, segments: number): Profile;
  ofPolygons(contours: number[][][]): Profile;
}

interface ManifoldMesh {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  runIndex?: Uint32Array;
  runOriginalID?: Uint32Array;
}

/** A manifold-3d Mesh input. merge() welds the vertices that share a position. */
interface MeshInput {
  merge(): boolean;
}

/** The constructor of a manifold-3d Mesh. */
type MeshCtor = new (options: { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array }) => MeshInput;

/** The one WASM module of this process. The module loads once, and every build shares the module. */
let manifoldPromise: Promise<ManifoldModule & { Mesh: MeshCtor }> | undefined;

/** Loads the WASM module once. A failed load clears the cache so that a later build tries again. */
export function loadManifold(): Promise<ManifoldModule & { Mesh: MeshCtor }> {
  if (manifoldPromise === undefined) {
    const started = import("manifold-3d").then(async (mod) => {
      const wasm = (await (mod.default as () => Promise<unknown>)()) as ManifoldModule & { Mesh: MeshCtor };
      wasm.setup();
      return wasm;
    });
    manifoldPromise = started;
    started.catch(() => {
      if (manifoldPromise === started) manifoldPromise = undefined;
    });
  }
  return manifoldPromise;
}

/** The angle in degrees above which the build keeps an edge sharp in the normals. */
const SHARP_ANGLE = 60;

/** The normal channel of manifold-3d: channel 0 is the first property after x, y and z. */
const NORMAL_CHANNEL = 0;

/** The property index of the first normal component in the output mesh. */
const NORMAL_OFFSET = 3 + NORMAL_CHANNEL;

const vec3 = (v: number | number[]): number[] => (typeof v === "number" ? [v, v, v] : v);

/** The build state: the module, the default segments, the colour of each original solid and every live object. */
class Build {
  readonly colors = new Map<number, Rgb | null>();
  private readonly live: { delete(): void }[] = [];

  constructor(
    readonly m: ManifoldModule & { Mesh: MeshCtor },
    readonly segments: number,
    readonly maxFacets: number,
  ) {}

  /** Rejects with E_LIMIT when a solid has more facets than the limit. An operation can add facets. */
  checkFacets(solid: Solid): Solid {
    const facets = solid.numTri();
    if (facets > this.maxFacets) {
      throw new RenderError("E_LIMIT", `the model has ${facets} facets; the limit is ${this.maxFacets}`);
    }
    return solid;
  }

  /** Keeps an object for the final clean-up and returns it. */
  keep<T extends { delete(): void }>(value: T): T {
    this.live.push(value);
    return value;
  }

  /** Frees every WASM object of the build. */
  free(): void {
    for (const value of this.live) value.delete();
    this.live.length = 0;
  }

  /** Marks a primitive as an original solid with a colour, so the faces of the result keep the colour. */
  primitive(solid: Solid, color: Rgb | null): Solid {
    const original = this.keep(solid.asOriginal());
    this.colors.set(original.originalID(), color);
    return original;
  }

  profile(node: ProfileNode): Profile {
    const { CrossSection } = this.m;
    switch (node.type) {
      case "rectangle":
        return this.keep(CrossSection.square(typeof node.size === "number" ? [node.size, node.size] : node.size, node.center ?? false));
      case "circle":
        return this.keep(CrossSection.circle(node.radius, node.segments ?? this.segments));
      default:
        return this.keep(CrossSection.ofPolygons([node.points]));
    }
  }

  solid(node: SolidNode, inherited: Rgb | null): Solid {
    const color = node.color ?? inherited;
    const { Manifold } = this.m;
    switch (node.type) {
      case "cube":
        return this.primitive(this.keep(Manifold.cube(vec3(node.size), node.center ?? false)), color);
      case "cylinder": {
        const low = node.radius ?? node.radius1!;
        const high = node.radius ?? node.radius2!;
        return this.primitive(this.keep(Manifold.cylinder(node.height, low, high, node.segments ?? this.segments, node.center ?? false)), color);
      }
      case "sphere":
        return this.primitive(this.keep(Manifold.sphere(node.radius, node.segments ?? this.segments)), color);
      case "polyhedron":
        return this.primitive(this.polyhedron(node.points, node.faces), color);
      case "extrude": {
        const profileColor = node.child.color ?? color;
        // manifold-3d 3.2.1 reads a number scaleTop as [n, 0]: always pass both components.
        const scale = typeof node.scale === "number" ? [node.scale, node.scale] : (node.scale ?? [1, 1]);
        const solid = this.profile(node.child).extrude(node.height, node.divisions ?? 0, node.twist ?? 0, scale, node.center ?? false);
        return this.primitive(this.keep(solid), profileColor);
      }
      case "revolve": {
        const solid = this.profile(node.child).revolve(node.segments ?? this.segments, node.degrees ?? 360);
        return this.primitive(this.keep(solid), node.child.color ?? color);
      }
      case "union":
      case "difference":
      case "intersection": {
        const parts = node.children.map((child) => this.solid(child, color));
        if (parts.length === 1) return parts[0]!;
        return this.checkFacets(this.keep(Manifold[node.type](parts)));
      }
      case "translate":
        return this.keep(this.solid(node.child, color).translate(node.offset));
      case "rotate":
        return this.keep(this.solid(node.child, color).rotate(node.angles));
      case "scale":
        return this.keep(this.solid(node.child, color).scale(vec3(node.factor)));
      default:
        return this.keep(this.solid(node.child, color).mirror(node.normal));
    }
  }

  /** Builds a polyhedron. The build splits each face into a fan of triangles. */
  private polyhedron(points: number[][], faces: number[][]): Solid {
    const triVerts: number[] = [];
    for (const face of faces) {
      for (let i = 1; i + 1 < face.length; i++) triVerts.push(face[0]!, face[i]!, face[i + 1]!);
    }
    const mesh = new this.m.Mesh({ numProp: 3, vertProperties: Float32Array.from(points.flat()), triVerts: Uint32Array.from(triVerts) });
    let solid: Solid;
    try {
      solid = this.keep(this.m.Manifold.ofMesh(mesh));
    } catch (error) {
      throw new RenderError("E_INPUT", `the polyhedron is not a closed solid: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (solid.volume() < 0) {
      throw new RenderError("E_INPUT", "the polyhedron faces turn inward; give each face counter-clockwise, seen from outside");
    }
    return solid;
  }
}

/** The result of a build: the mesh for the writers, and the volume of the solid. */
export interface CadBuildResult {
  mesh: CadMesh;
  volume: number;
}

/**
 * Builds the solid of a checked document and returns one mesh with flat normals at sharp edges.
 * The faces carry the colours of the primitives. A result over maxFacets rejects with E_LIMIT.
 */
export function buildCad(document: CadDocument, maxFacets: number): Promise<CadBuildResult> {
  return withSolid(document, maxFacets, (solid, build) => {
    const shaded = build.keep(solid.calculateNormals(NORMAL_CHANNEL, SHARP_ANGLE));
    const out = shaded.getMesh(NORMAL_CHANNEL);
    return { mesh: toCadMesh(out, build.colors, document.model.name ?? "model"), volume: solid.volume() };
  });
}

/** The result of a drawing: the closed contours in the X-Y plane, and whether the model has a colour. */
export interface CadDrawing {
  contours: number[][][];
  colored: boolean;
}

/**
 * Draws a checked document in the X-Y plane. With no height, the drawing is the outline of the solid seen from
 * above. With a height, the drawing is the section of the solid at that height. A result over maxFacets rejects
 * with E_LIMIT.
 */
export function drawCad(document: CadDocument, maxFacets: number, z?: number): Promise<CadDrawing> {
  return withSolid(document, maxFacets, (solid, build) => {
    const colored = [...build.colors.values()].some((c) => c !== null);
    return { contours: contoursAt(solid, build, z), colored };
  });
}

/** The closed contours of the outline (no height) or of the section at a height, in the X-Y plane. */
function contoursAt(solid: Solid, build: Build, z?: number): number[][][] {
  return build.keep(z === undefined ? solid.project() : solid.slice(z)).toPolygons();
}

/**
 * Draws the solid of imported meshes (STEP, IGES or BREP) in the X-Y plane, as drawCad does for a CAD document. Each
 * mesh is welded, read as a closed solid and joined by a union. The triangle count of all meshes is checked before
 * any WASM call. A mesh that is not a closed solid rejects with E_INPUT. A count or a result over maxFacets rejects
 * with E_LIMIT. Every error is a rejection of the returned promise.
 */
export async function drawMeshes(meshes: CadMesh[], maxFacets: number, z?: number): Promise<CadDrawing> {
  const triangles = meshes.reduce((n, mesh) => n + mesh.indices.length / 3, 0);
  if (triangles > maxFacets) {
    throw new RenderError("E_LIMIT", `the model has ${triangles} facets; the limit is ${maxFacets}`);
  }
  const colored = meshes.some((mesh) => mesh.faces.some((face) => face.color !== null));
  return withSolidOf(
    DEFAULT_SEGMENTS,
    maxFacets,
    (build) => importedSolid(build, meshes),
    (solid, build) => ({ contours: contoursAt(solid, build, z), colored }),
  );
}

/**
 * Reads each mesh as a closed solid and joins the solids by a union. A mesh with no closed volume rejects with E_INPUT.
 * Manifold.ofMesh throws on every status other than NoError. withSolidOf checks the status and the facets of the union.
 */
function importedSolid(build: Build, meshes: CadMesh[]): Solid {
  const { Manifold, Mesh } = build.m;
  const parts = meshes.map((mesh, index) => {
    const name = mesh.name === "" ? String(index) : JSON.stringify(mesh.name);
    const input = new Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices });
    input.merge();
    let solid: Solid;
    try {
      solid = build.keep(Manifold.ofMesh(input));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new RenderError("E_INPUT", `mesh ${name} is not a closed solid: its vertices could not be welded into a closed solid (${reason})`);
    }
    if (solid.volume() < 0) throw new RenderError("E_INPUT", `mesh ${name} is not a closed solid: its faces turn inward`);
    return solid;
  });
  if (parts.length === 1) return parts[0]!;
  return build.keep(Manifold.union(parts));
}

/**
 * The three views of a drawing: the top view (X and Y), the front view (X and Z) and the right view (Y and Z), each
 * a list of closed contours. The bounding box of the solid is min and max. The views are one build of the solid.
 */
export interface CadViews {
  top: number[][][];
  front: number[][][];
  right: number[][][];
  min: number[];
  max: number[];
  colored: boolean;
}

/** Drops the contours with no area. A contour with no area is an artefact of the projection. */
function contoursWithArea(contours: number[][][]): number[][][] {
  return contours.filter((c) => Math.abs(shoelace(c)) >= 1e-6);
}

/** The signed area of a closed contour by the shoelace formula. */
function shoelace(points: number[][]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    sum += x1! * y2! - x2! * y1!;
  }
  return sum / 2;
}

/**
 * Draws the three views of a checked document in one build. The front view projects the solid turned by -90 degrees
 * about X, so that Z is up in the view. The right view turns the solid by -90 degrees about Z, then by -90 degrees
 * about X, so that Y is to the right. A result over maxFacets rejects with E_LIMIT.
 */
export function drawCadViews(document: CadDocument, maxFacets: number): Promise<CadViews> {
  return withSolid(document, maxFacets, (solid, build) => {
    const { min, max } = solid.boundingBox();
    const top = contoursWithArea(build.keep(solid.project()).toPolygons());
    const front = contoursWithArea(build.keep(build.keep(solid.rotate([-90, 0, 0])).project()).toPolygons());
    const turned = build.keep(solid.rotate([0, 0, -90]));
    const right = contoursWithArea(build.keep(build.keep(turned.rotate([-90, 0, 0])).project()).toPolygons());
    const colored = [...build.colors.values()].some((c) => c !== null);
    return { top, front, right, min: [...min], max: [...max], colored };
  });
}

/** The axes of the wall check and the gap check. A rotation turns each axis into the Z axis, so that a slice of the turned solid cuts across the original axis. */
const SECTION_AXES = [
  { axis: "X", index: 0, angles: [0, -90, 0] },
  { axis: "Y", index: 1, angles: [90, 0, 0] },
  { axis: "Z", index: 2, angles: [0, 0, 0] },
] as const;

/** The segments of a full circle in the round joins of the wall check and the gap check. The joins change only the corners of a section. */
const OFFSET_SEGMENTS = 32;

/** The number of sections of the wall check on each axis. */
export const WALL_SECTIONS = 32;

/** A section of the wall check or the gap check with a found region: the axis, the position on the axis and the area. */
export interface ThinSection {
  axis: "X" | "Y" | "Z";
  at: number;
  area: number;
}

/** The measures of a solid for the report of the design for manufacture. */
export interface CadMeasures {
  min: number[];
  max: number[];
  volume: number;
  area: number;
  /** The vertex positions (x, y, z) and the triangles (three vertex indices each) of the solid. */
  positions: Float32Array;
  triangles: Uint32Array;
  thin: ThinSection[];
  narrow: ThinSection[];
}

/**
 * Measures a checked document for the report of the design for manufacture. The wall check cuts WALL_SECTIONS
 * sections on each axis. An opening of each section by minWall removes each wall thinner than minWall. A model
 * with no solid rejects with E_INPUT. A closing of each section by minGap fills each gap narrower than minGap.
 */
export function measureCad(document: CadDocument, maxFacets: number, minWall: number, minGap: number): Promise<CadMeasures> {
  return withSolid(document, maxFacets, (solid, build) => {
    if (solid.numTri() === 0) throw new RenderError("E_INPUT", "the model holds no solid");
    const { min, max } = solid.boundingBox();
    const mesh = solid.getMesh();
    const positions = new Float32Array(mesh.vertProperties.length / mesh.numProp * 3);
    for (let v = 0; v < positions.length / 3; v++) {
      for (let c = 0; c < 3; c++) positions[v * 3 + c] = mesh.vertProperties[v * mesh.numProp + c]!;
    }
    const thin: ThinSection[] = [];
    const narrow: ThinSection[] = [];
    for (const { axis, index, angles } of SECTION_AXES) {
      const turned = index === 2 ? solid : build.keep(solid.rotate([...angles]));
      const lo = min[index]!;
      const step = (max[index]! - lo) / WALL_SECTIONS;
      for (let i = 0; i < WALL_SECTIONS; i++) {
        const at = lo + (i + 0.5) * step;
        const section = build.keep(turned.slice(at));
        const thinAt = thinPieces(build, section, minWall).pieces;
        if (thinAt.length > 0 && persists(build, turned, at, thinAt, minWall, thinPieces)) thin.push({ axis, at, area: areaOf(thinAt) });
        const gapAt = gapPieces(build, section, minGap).pieces;
        if (gapAt.length > 0 && persists(build, turned, at, gapAt, minGap, gapPieces)) narrow.push({ axis, at, area: areaOf(gapAt) });
      }
    }
    return {
      min: [...min],
      max: [...max],
      volume: solid.volume(),
      area: solid.surfaceArea(),
      positions,
      triangles: Uint32Array.from(mesh.triVerts),
      thin,
      narrow,
    };
  });
}

/**
 * The thin pieces of a section: the regions that an opening by minWall removes, and that count. The opening shrinks
 * the section by a little less than half of minWall, so that a wall equal to minWall stays.
 */
function thinPieces(build: Build, section: Section, minWall: number): Found {
  const segments = OFFSET_SEGMENTS;
  const half = (minWall / 2) * (1 - 1e-6);
  const opened = build.keep(build.keep(section.offset(-half, "Round", 2, segments)).offset(half, "Round", 2, segments));
  const wideIn = (shape: Section): number => build.keep(shape.intersect(opened)).area();
  return { pieces: countedPieces(build, section, build.keep(section.subtract(opened)), minWall, wideIn), wideIn };
}

/**
 * The narrow pieces of a section: the regions that a closing by minGap fills, and that count. The closing grows the
 * section by a little less than half of minGap, so that a slot equal to minGap stays open.
 */
function gapPieces(build: Build, section: Section, minGap: number): Found {
  const segments = OFFSET_SEGMENTS;
  const half = (minGap / 2) * (1 - 1e-6);
  const closed = build.keep(build.keep(section.offset(half, "Round", 2, segments)).offset(-half, "Round", 2, segments));
  const wideIn = (shape: Section): number => build.keep(shape.subtract(closed)).area();
  return { pieces: countedPieces(build, section, build.keep(closed.subtract(section)), minGap, wideIn), wideIn };
}

/**
 * The pieces that a check finds in a section, and a test against the section. The test gives the area of a piece
 * that the section holds as a wide region. The wide region is wide solid for the wall check and wide space for the
 * gap check.
 */
interface Found {
  pieces: Section[];
  wideIn(piece: Section): number;
}

/** A vertex of a section. A convex vertex turns left, seen along the contour. */
interface SectionVertex {
  x: number;
  y: number;
  convex: boolean;
}

/**
 * The pieces of a removed region that count. An opening of min/200 splits the removed region into parts. A part that
 * holds one vertex of the section is a corner of the opening, at any angle. A part can hold two or more convex
 * vertices and be not longer than 2 min on each axis. Such a part is the region near a vertex of the solid when it
 * also touches the wide region of the section. A separate body or a pin cut on its own does not touch the wide
 * region. A piece with no other part does not count. A piece counts when a part is longer than 0.75 min, or when the
 * piece holds a disc of radius min/8. First, the simplify step removes the slivers of zero width with a reversed
 * winding. A shrink grows such a sliver, so the slivers must go before the tests.
 */
function countedPieces(build: Build, section: Section, removed: Section, min: number, wideIn: (shape: Section) => number): Section[] {
  const segments = OFFSET_SEGMENTS;
  const vertices = sectionVertices(build, section, min);
  const cleaned = simplified(build, removed, min);
  const pieces: Section[] = [];
  for (const piece of cleaned.decompose()) {
    build.keep(piece);
    let longest = 0;
    let wall = false;
    for (const part of openedParts(build, piece, min)) {
      const held = heldVertices(build, part, vertices, min);
      if (held.length === 1) continue;
      const side = longestSide(part);
      if (held.length >= 2 && held.every((v) => v.convex) && side <= 2 * min && bordersWide(build, part, min, wideIn)) continue;
      wall = true;
      longest = Math.max(longest, side);
    }
    if (!wall) continue;
    if (longest > 0.75 * min || build.keep(piece.offset(-min / 8, "Round", 2, segments)).area() > 0) pieces.push(piece);
  }
  return pieces;
}

/** True when a part touches the wide region of its section. A separate body or a pin cut on its own does not touch the wide region. */
function bordersWide(build: Build, part: Section, min: number, wideIn: (shape: Section) => number): boolean {
  return wideIn(build.keep(part.offset(min / 100, "Round", 2, OFFSET_SEGMENTS))) > 0;
}

/** A section or a region with the points of min/1000 removed. */
function simplified(build: Build, shape: Section, min: number): Section {
  return build.keep(shape.simplify(min / 1000));
}

/** The vertices of a section, each with the sign of its turn. A Manifold contour keeps the region to its left. */
function sectionVertices(build: Build, section: Section, min: number): SectionVertex[] {
  const out: SectionVertex[] = [];
  for (const polygon of simplified(build, section, min).toPolygons()) {
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      const a = polygon[(i + n - 1) % n]!;
      const b = polygon[i]!;
      const c = polygon[(i + 1) % n]!;
      const cross = (b[0]! - a[0]!) * (c[1]! - b[1]!) - (b[1]! - a[1]!) * (c[0]! - b[0]!);
      out.push({ x: b[0]!, y: b[1]!, convex: cross > 0 });
    }
  }
  return out;
}

/**
 * The vertices of the section that a small square centred on the vertex meets in the part. The square has side min/4.
 * A vertex out of the bounding box of the part, grown by min/8, cannot meet the part, so the test skips the vertex.
 */
function heldVertices(build: Build, part: Section, vertices: SectionVertex[], min: number): SectionVertex[] {
  const box = boundsOf(part);
  const reach = min / 8;
  return vertices.filter((v) => {
    if (v.x < box.minX - reach || v.x > box.maxX + reach || v.y < box.minY - reach || v.y > box.maxY + reach) return false;
    const square = build.keep(build.m.CrossSection.square([min / 4, min / 4], true));
    const tip = build.keep(square.translate([v.x, v.y]));
    return build.keep(tip.intersect(part)).area() > 0;
  });
}

/** The parts of a piece after an opening by min/200. The opening removes the bridges of zero width and the slivers. */
function openedParts(build: Build, piece: Section, min: number): Section[] {
  const e = min / 200;
  const opened = build.keep(build.keep(piece.offset(-e, "Round", 2, OFFSET_SEGMENTS)).offset(e, "Round", 2, OFFSET_SEGMENTS));
  return opened.decompose().map((part) => build.keep(part));
}

/** The bounding box of a part. */
function boundsOf(part: Section): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of part.toPolygons()) {
    for (const [x, y] of polygon) {
      minX = Math.min(minX, x!);
      maxX = Math.max(maxX, x!);
      minY = Math.min(minY, y!);
      maxY = Math.max(maxY, y!);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** The longest bounding box side of a part. */
function longestSide(part: Section): number {
  const { minX, minY, maxX, maxY } = boundsOf(part);
  let longest = 0;
  longest = Math.max(longest, maxX - minX, maxY - minY);
  return longest;
}

/** The total area of a list of pieces. The pieces are disjoint. */
function areaOf(pieces: Section[]): number {
  return pieces.reduce((sum, piece) => sum + piece.area(), 0);
}

/**
 * True when a piece of the section is a real thin region, not the slant cut of an edge or a vertex. The test looks at
 * the sections at min/2 before and after. A piece is a slant cut when one of these sections holds more than half of
 * the piece as a wide region. Also, neither section has a found piece within min/2 of the piece. A wall or a pin that
 * ends before the next section does not have a wide region there, so the wall or the pin counts.
 */
function persists(
  build: Build,
  turned: Solid,
  at: number,
  pieces: Section[],
  min: number,
  find: (build: Build, section: Section, min: number) => Found,
): boolean {
  const near = pieces.map((piece) => build.keep(piece.offset(min / 2, "Round", 2, OFFSET_SEGMENTS)));
  const covered = pieces.map(() => false);
  for (const other of [at - min / 2, at + min / 2]) {
    const section = build.keep(turned.slice(other));
    if (section.area() === 0) continue;
    const found = find(build, section, min);
    for (let i = 0; i < pieces.length; i++) {
      if (found.pieces.some((f) => build.keep(f.intersect(near[i]!)).area() > 0)) return true;
      if (found.wideIn(pieces[i]!) > pieces[i]!.area() / 2) covered[i] = true;
    }
  }
  return covered.some((c) => !c);
}

/**
 * Builds the solid of a checked document and gives the solid to the reader. The build frees every WASM object
 * after the reader returns. A failed operation rejects with E_INPUT. A solid over maxFacets rejects with E_LIMIT.
 */
function withSolid<T>(document: CadDocument, maxFacets: number, read: (solid: Solid, build: Build) => T): Promise<T> {
  return withSolidOf(document.segments ?? DEFAULT_SEGMENTS, maxFacets, (build) => build.solid(document.model, null), read);
}

/**
 * Builds a solid with make and gives the solid to the reader. The build frees every WASM object after the reader
 * returns. A failed operation rejects with E_INPUT. A solid over maxFacets rejects with E_LIMIT.
 */
async function withSolidOf<T>(
  segments: number,
  maxFacets: number,
  make: (build: Build) => Solid,
  read: (solid: Solid, build: Build) => T,
): Promise<T> {
  const m = await loadManifold();
  const build = new Build(m, segments, maxFacets);
  try {
    let solid: Solid;
    try {
      solid = make(build);
    } catch (error) {
      if (error instanceof RenderError) throw error;
      throw new RenderError("E_INPUT", `the solid operations failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const status = solid.status();
    if (status !== "NoError") {
      throw new RenderError("E_INPUT", `the solid operations failed: ${String(status)}`);
    }
    build.checkFacets(solid);
    return read(solid, build);
  } finally {
    build.free();
  }
}

/** Converts the output mesh to flat arrays. Each run of triangles from one original solid becomes one face. */
function toCadMesh(out: ManifoldMesh, colors: Map<number, Rgb | null>, name: string): CadMesh {
  const stride = out.numProp;
  const count = out.vertProperties.length / stride;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) {
    for (let c = 0; c < 3; c++) {
      positions[v * 3 + c] = out.vertProperties[v * stride + c]!;
      normals[v * 3 + c] = out.vertProperties[v * stride + NORMAL_OFFSET + c]!;
    }
  }
  const faces: CadFace[] = [];
  const runIndex = out.runIndex ?? Uint32Array.from([0, out.triVerts.length]);
  const runIds = out.runOriginalID ?? new Uint32Array(runIndex.length - 1);
  for (let r = 0; r + 1 < runIndex.length; r++) {
    const first = runIndex[r]! / 3;
    const last = runIndex[r + 1]! / 3 - 1;
    if (last < first) continue;
    faces.push({ first, last, color: colors.get(runIds[r]!) ?? null });
  }
  return { name, positions, normals, indices: Uint32Array.from(out.triVerts), faces };
}
