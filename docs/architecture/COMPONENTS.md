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

`DEFAULT_REGISTRY` is empty in increment I0.

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
export function dotToSvg(source: string): Promise<DotSvgResult>;
export function dotSourceText(source: string | Uint8Array): string;
```

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

## `src/raster/index.ts`

Purpose: SVG to PNG through resvg. It loads the WASM file once for the process. It checks the pixel buffer against `maxMemoryMb` before it renders. It checks the signature of a font file.

```ts
export interface SvgToPngOptions { scale: number; maxMemoryMb: number; font?: Uint8Array }
export function svgToPng(svg: string, options: SvgToPngOptions): Promise<Uint8Array>;
export function isFontFile(bytes: Uint8Array): boolean;
```

## `src/types.ts`

Purpose: the public types. It exports `INPUT_TYPES`, `OUTPUT_FORMATS`, `BINARY_INPUT_TYPES`, `RenderRequest`, `RenderResult`, `RenderAsset`, `Capability` and `RenderOptions`.
