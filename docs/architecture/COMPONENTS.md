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

Purpose: the worker side. The module has no export. It reads `workerData`, imports the backend module, runs it and posts one `WorkerMessage`.

## `src/worker/protocol.ts`

Purpose: the message shapes that the two sides share. It exports `WorkerJob`, `BackendOutput` and `WorkerMessage`.

## `src/types.ts`

Purpose: the public types. It exports `INPUT_TYPES`, `OUTPUT_FORMATS`, `BINARY_INPUT_TYPES`, `RenderRequest`, `RenderResult`, `RenderAsset`, `Capability` and `RenderOptions`.
