<!-- repo-map:no-verification -->
# sciengjs components

Each entry gives the path, the purpose and the exported signatures. The signatures copy the source.

## `src/index.ts`

Purpose: the public entry point of the package.

```ts
export function render(req: RenderRequest, config?: Partial<SciengConfig>): Promise<RenderResult>;
export function capabilities(config?: Partial<SciengConfig>): Promise<Capability[]>;
```

It re-exports `RenderError`, `RENDER_ERROR_CODES`, `loadConfig`, `INPUT_TYPES`, `OUTPUT_FORMATS` and the types.

## `src/core.ts`

Purpose: the render and capability logic. The registry and the configuration dependencies are parameters, so that tests inject them.

```ts
export function renderWithRegistry(
  req: RenderRequest,
  options: Partial<SciengConfig>,
  registry: Registry,
  configDeps?: Partial<ConfigDeps>,
): Promise<RenderResult>;

export function capabilitiesWithRegistry(
  options: Partial<SciengConfig>,
  registry: Registry,
  configDeps?: Partial<ConfigDeps>,
): Promise<Capability[]>;
```

## `src/config.ts`

Purpose: the configuration loader. It holds the only defaults of the engine.

```ts
export type NetworkPolicy = "none" | "tex-bundles" | "tex-bundles,images";

export interface SciengConfig {
  browser?: string;
  cacheDir: string;
  texBundleUrl: string;
  timeoutMs: number;
  maxSourceBytes: number;
  maxMemoryMb: number;
  allowNetwork: NetworkPolicy;
}

export function loadConfig(
  options?: Partial<SciengConfig>,
  deps?: Partial<ConfigDeps>,
): Promise<SciengConfig>;
```

`ConfigDeps` holds the environment, the platform, the home folder, the file reader and the engine version. A test injects each one.

## `src/errors.ts`

Purpose: the error type of the engine.

```ts
export const RENDER_ERROR_CODES: readonly [
  "E_INPUT", "E_UNSUPPORTED", "E_LIMIT", "E_TIMEOUT",
  "E_STAGE_MISSING", "E_CONFIG", "E_INTEGRITY", "E_INTERNAL",
];

export class RenderError extends Error {
  readonly code: RenderErrorCode;
  readonly line: number | undefined;
  readonly column: number | undefined;
  constructor(code: RenderErrorCode, message: string, position?: RenderErrorPosition);
}
```

## `src/registry.ts`

Purpose: maps `type:format` to a backend module.

```ts
export interface BackendEntry { backend: string; moduleUrl: string; }
export type Registry = Record<string, BackendEntry>;
export const DEFAULT_REGISTRY: Registry;
export function registryKey(type: string, format: string): string;
```

`DEFAULT_REGISTRY` names the backends of `dot` to `svg`, `dot` to `png`, `mermaid` to `svg` and `mermaid` to `png`.

## `src/pairs.ts`

Purpose: the table of supported pairs and the stage of each pair.

```ts
export interface PairSpec { type: InputType; format: OutputFormat; stage: string; }
export const PAIRS: readonly PairSpec[];
export function findPair(type: InputType, format: OutputFormat): PairSpec | undefined;
```

## `src/worker/run.ts`

Purpose: the main-thread side of a render.

```ts
export interface WorkerLimits { timeoutMs: number; maxMemoryMb: number; }
export function runInWorker(job: WorkerJob, limits: WorkerLimits): Promise<BackendOutput>;
```

## `src/worker/entry.ts`

Purpose: the worker side. The module has no export. The module reads `workerData`. The module imports the backend module. The module runs the backend module. The module posts one `WorkerMessage`.

## `src/worker/protocol.ts`

Purpose: the message shapes that the two sides share. It exports `WorkerJob`, `BackendOutput` and `WorkerMessage`.

## `src/graph/dot.ts`

Purpose: renders a DOT source to SVG with the viz library. The module removes the image attributes first. It maps the library messages to warnings. The library loads on the first call, and one module-level promise holds it.

```ts
export interface DotSvgResult { svg: string; warnings: string[] }
export function dotToSvg(source: string, getViz?: () => Promise<Viz>): Promise<DotSvgResult>;
export function dotSourceText(source: string | Uint8Array): string;
```

`getViz` returns the viz instance. The default is the shared instance. A test passes a new instance for each source, so that the library gives its warnings for each source.

## `src/graph/image.ts`

Purpose: scans the tokens of a DOT source. The scanner removes each assignment of the key `image` and reports its line and file name. It also removes each SVG image element from the output of the library.

```ts
export function stripImageAttributes(source: string): StripResult;
export function dropImageElements(svg: string): { svg: string; dropped: number };
```

## `src/graph/backend-svg.ts`

Purpose: the backend of `dot` to `svg`. It takes no options. Any option rejects with `E_INPUT`.

## `src/graph/backend-png.ts`

Purpose: the backend of `dot` to `png`. It takes the option `scale`. It reads the raster font, which is the file of `rasterFont` or the bundled font. It renders the SVG with `dotToSvg`, and then it renders the PNG with `svgToPng`.

```ts
export function svgDocumentToPng(svg: string, request: WorkerJob["request"]): Promise<BackendOutput>;
```

`svgDocumentToPng` renders an SVG document to PNG with the font rule of the DOT backend. The Mermaid PNG backend uses it.

## `src/raster/index.ts`

Purpose: SVG to PNG through resvg. The raster module loads the WASM file once for the process. It checks the pixel buffer against `maxMemoryMb` and against the fixed cap of 1024 MB before it renders. It checks the signature of a font file.

```ts
export interface SvgToPngOptions {
  scale: number;
  maxMemoryMb: number;
  font?: Uint8Array;
  readWasm?: () => Uint8Array;
}
export function svgToPng(svg: string, options: SvgToPngOptions): Promise<Uint8Array>;
export function isFontFile(bytes: Uint8Array): boolean;
```

`readWasm` replaces the reader of the resvg WASM file. The tests use it to fail the first start.

## `src/mermaid/common.ts`

Purpose: the header and option reader of each Mermaid source. It reads the front matter, the directives, the comment lines and the header line. It rejects a Mermaid type that the native layouts do not draw with `E_UNSUPPORTED`. It reads the option `lenient`. Any other option rejects with `E_INPUT`.

```ts
export type DiagramKind = "class" | "state" | "sequence";
export function prepare(source: string, options: Record<string, unknown>, extra?: readonly string[]): Source;
export function sourceText(source: string | Uint8Array): string;
```

`Source` holds the diagram kind, the header line, the content lines, the lenient flag and the warnings.

## `src/mermaid/class.ts`

Purpose: parses a `classDiagram` and builds the DOT source of the diagram.

```ts
export function parseClassDiagram(src: Source): ClassModel;
export function classToDot(model: ClassModel): string;
```

It exports the types `ClassModel`, `ClassDef`, `ClassRelation`, `ClassArrow` and `Marker`.

## `src/mermaid/state.ts`

Purpose: parses a `stateDiagram-v2` and builds the DOT source of the diagram. A composite state is outside the grammar. In lenient mode, the parser skips the state and its body.

```ts
export function parseStateDiagram(src: Source): StateModel;
export function stateToDot(model: StateModel): string;
```

It exports the types `StateModel`, `StateDef` and `StateTransition`.

## `src/mermaid/sequence.ts`

Purpose: parses a `sequenceDiagram` into participants and events. The events are messages, notes, activations, deactivations and blocks. A block holds one or more branches.

```ts
export function parseSequenceDiagram(src: Source): SequenceModel;
```

It exports the types `SequenceModel`, `Participant`, `MessageEvent`, `NoteEvent`, `ActivateEvent`, `DeactivateEvent`, `Branch`, `BlockEvent` and `SeqEvent`.

## `src/mermaid/sequence-layout.ts`

Purpose: lays out a sequence model as one SVG document. There is one column for each participant. There is one row for each message or note. Each element carries its source line in `data-scieng-line`.

```ts
export function layoutSequence(model: SequenceModel): string;
```

The layout measures each text run as 8 px for each character.

## `src/mermaid/render.ts`

Purpose: renders one Mermaid source to SVG. A class diagram or a state diagram goes through its DOT builder and `dotToSvg`. A sequence diagram goes through `layoutSequence`.

```ts
export interface MermaidSvg { svg: string; warnings: string[] }
export function renderMermaidSvg(source: string, options: Record<string, unknown>): Promise<MermaidSvg>;
```

## `src/mermaid/backend-svg.ts`

Purpose: the backend of `mermaid` to `svg`. The backend returns the SVG from `renderMermaidSvg`.

```ts
export function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/mermaid/backend-png.ts`

Purpose: the backend of `mermaid` to `png`. It renders the SVG with `renderMermaidSvg`. It then renders the PNG with `svgDocumentToPng`.

```ts
export function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/mermaid/index.ts`

Purpose: the public entry of the `./mermaid` subpath. It re-exports the functions and the types of the Mermaid stage.

## `src/mesh/cad-document.ts`

Purpose: the reader of a CAD document. The reader checks the JSON value against the node types and gives the JSON path of a bad value with `E_INPUT`. The reader counts the nodes and estimates the facets of each primitive before any solid operation. A count over a limit rejects with `E_LIMIT`. The reader accepts a 2D profile only as the child of `extrude` or `revolve`.

```ts
export function parseCadDocument(text: string, limits: CadLimits): CheckedCadDocument;
export function checkCadDocument(value: unknown, limits: CadLimits): CheckedCadDocument;
export function sphereFacets(segments: number): number;
```

## `src/mesh/cad-build.ts`

Purpose: the solid operations of a checked document through manifold-3d. The WASM module loads once for each process. Each primitive becomes an original solid with its colour. Each run of output triangles keeps the colour of the primitive that made the run. The build frees every WASM object in a `finally` block. A result over the facet limit rejects with `E_LIMIT`.

```ts
export function loadManifold(): Promise<ManifoldModule>;
export function buildCad(document: CadDocument, maxFacets: number): Promise<CadBuildResult>;
```

## `src/mesh/cad-builder.ts`

Purpose: the builder functions. Each function returns a plain node object with only the keys that the caller gives. `cadDocument` wraps the model in a document. The `./mesh` subpath exports the module as `cad`.

## `src/mesh/stl.ts`

Purpose: the binary STL writer: an 80-byte header, a 32-bit facet count, and 50 bytes for each facet, little-endian. The facet normal comes from the vertex order. STL holds no colour and no name.

```ts
export function writeStl(meshes: CadMesh[]): Uint8Array;
export function stlByteLength(meshes: CadMesh[]): number;
```

## `src/mesh/backend-glb.ts`

Purpose: the backend of `step`, `iges`, `brep` and `cad` to `glb`. `readMeshes` reads the meshes of a mesh render: a CAD document through the reader and the build, a STEP, IGES or BREP file through occt-import-js. The html and png backends also call `readMeshes` through this render. An output over `maxMemoryMb` rejects with `E_LIMIT`.

```ts
export function readMeshes(request: WorkerJob["request"], deps?: Partial<GlbDeps>): Promise<CadMesh[]>;
export function render(request: WorkerJob["request"], deps?: Partial<GlbDeps>): Promise<BackendOutput>;
```

## `src/mesh/backend-stl.ts`

Purpose: the backend of `cad` to `stl`. A model with a colour gives a warning, because STL holds no colour. An output over `maxMemoryMb` rejects with `E_LIMIT`.

## `src/types.ts`

Purpose: the public types. It exports `INPUT_TYPES`, `OUTPUT_FORMATS`, `BINARY_INPUT_TYPES`, `RenderRequest`, `RenderResult`, `RenderAsset`, `Capability` and `RenderOptions`.
