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
  status(): string;
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
export async function buildCad(document: CadDocument, maxFacets: number): Promise<CadBuildResult> {
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
    const shaded = build.keep(solid.calculateNormals(NORMAL_CHANNEL, SHARP_ANGLE));
    const out = shaded.getMesh(NORMAL_CHANNEL);
    return { mesh: toCadMesh(out, build.colors, document.model.name ?? "model"), volume: solid.volume() };
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
