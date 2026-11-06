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
  square(size: number[] | number, center: boolean): Profile;
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

/** The constructor of a manifold-3d Mesh. */
type MeshCtor = new (options: { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array }) => unknown;

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
    const section = build.keep(z === undefined ? solid.project() : solid.slice(z));
    const colored = [...build.colors.values()].some((c) => c !== null);
    return { contours: section.toPolygons(), colored };
  });
}

/** The axes of the wall check and the gap check. A rotation turns each axis into the Z axis, so that a slice of the turned solid cuts across the original axis. */
const SECTION_AXES = [
  { axis: "X", index: 0, angles: [0, -90, 0] },
  { axis: "Y", index: 1, angles: [90, 0, 0] },
  { axis: "Z", index: 2, angles: [0, 0, 0] },
] as const;

/** The segments of a full circle in the round joins of the wall check and the gap check. The joins shape only the corners of a section change. */
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
        const thinAt = thinArea(build, section, minWall);
        if (thinAt > 0) thin.push({ axis, at, area: thinAt });
        const gapAt = gapArea(build, section, minGap);
        if (gapAt > 0) narrow.push({ axis, at, area: gapAt });
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
 * The area of the regions of a section that an opening by minWall removes, less the corners of the opening. The
 * opening shrinks the section by a little less than half of minWall, so that a wall equal to minWall stays.
 */
function thinArea(build: Build, section: Section, minWall: number): number {
  const segments = OFFSET_SEGMENTS;
  const half = (minWall / 2) * (1 - 1e-6);
  const opened = build.keep(build.keep(section.offset(-half, "Round", 2, segments)).offset(half, "Round", 2, segments));
  return countedArea(build, build.keep(section.subtract(opened)), minWall);
}

/**
 * The area of the regions that a closing by minGap adds to a section, less the concave corners of the closing. The
 * closing grows the section by a little less than half of minGap, so that a slot equal to minGap stays open.
 */
function gapArea(build: Build, section: Section, minGap: number): number {
  const segments = OFFSET_SEGMENTS;
  const half = (minGap / 2) * (1 - 1e-6);
  const closed = build.keep(build.keep(section.offset(half, "Round", 2, segments)).offset(-half, "Round", 2, segments));
  return countedArea(build, build.keep(closed.subtract(section)), minGap);
}

/**
 * The area of the pieces of a difference that are narrow. The difference also holds the fill of each right-angle
 * corner. A piece is narrow when it is wider than a quarter of min, or when its bounding box is longer than 0.75 min on
 * one axis. A piece with an inscribed disc of radius min/8 is wide. The fill of a right-angle corner is at most
 * min/sqrt(2) long, so the length test keeps a hairline slot or fin and drops the corners. The subtraction leaves
 * slivers of zero width with a reversed winding. A shrink grows such a sliver, so the simplify step removes the
 * slivers before the tests.
 */
function countedArea(build: Build, removed: Section, min: number): number {
  const segments = OFFSET_SEGMENTS;
  const cleaned = build.keep(removed.simplify(min / 1000));
  let area = 0;
  for (const piece of cleaned.decompose()) {
    build.keep(piece);
    if (longestPart(build, piece, min) > 0.75 * min || build.keep(piece.offset(-min / 8, "Round", 2, segments)).area() > 0) area += piece.area();
  }
  return area;
}

/**
 * The longest bounding box side of the parts of a piece. An opening by min/200 first removes the bridges of zero
 * width and the slivers of the offsets, so that two corners on one edge are two parts. A slot of min/50 stays.
 */
function longestPart(build: Build, piece: Section, min: number): number {
  const e = min / 200;
  const opened = build.keep(build.keep(piece.offset(-e, "Round", 2, OFFSET_SEGMENTS)).offset(e, "Round", 2, OFFSET_SEGMENTS));
  let longest = 0;
  for (const part of opened.decompose()) {
    build.keep(part);
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
    longest = Math.max(longest, maxX - minX, maxY - minY);
  }
  return longest;
}

/**
 * Builds the solid of a checked document and gives the solid to the reader. The build frees every WASM object
 * after the reader returns. A failed operation rejects with E_INPUT. A solid over maxFacets rejects with E_LIMIT.
 */
async function withSolid<T>(document: CadDocument, maxFacets: number, read: (solid: Solid, build: Build) => T): Promise<T> {
  const m = await loadManifold();
  const build = new Build(m, document.segments ?? DEFAULT_SEGMENTS, maxFacets);
  try {
    let solid: Solid;
    try {
      solid = build.solid(document.model, null);
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
