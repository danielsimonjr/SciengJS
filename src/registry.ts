/** One backend: the module that the worker loads for a (type, format) pair. */
export interface BackendEntry {
  /** The backend name that a result reports, for example "graph/viz". */
  backend: string;
  /** An absolute file URL of a module that exports `render`. */
  moduleUrl: string;
}

/** Maps "type:format" to a backend. A key is missing when no backend is built in. */
export type Registry = Record<string, BackendEntry>;

/** The backends of this build. I0 ships none; each increment adds its entries. */
export const DEFAULT_REGISTRY: Registry = {};

export function registryKey(type: string, format: string): string {
  return `${type}:${format}`;
}
