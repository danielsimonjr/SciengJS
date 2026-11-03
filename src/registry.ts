import { extname } from "node:path";
import { fileURLToPath } from "node:url";

/** One backend: the module that the worker loads for a (type, format) pair. */
export interface BackendEntry {
  /** The backend name that a result reports, for example "graph/viz". */
  backend: string;
  /** An absolute file URL of a module that exports `render`. */
  moduleUrl: string;
}

/** Maps "type:format" to a backend. A key is missing when no backend is built in. */
export type Registry = Record<string, BackendEntry>;

/** The URL of a backend module of this package. The extension follows the build: .ts from src, .js from dist. */
function backendUrl(name: string): string {
  const extension = extname(fileURLToPath(import.meta.url));
  return new URL(`./${name}${extension}`, import.meta.url).href;
}

/** The backends of this build. */
export const DEFAULT_REGISTRY: Registry = {
  "dot:svg": { backend: "graph/viz", moduleUrl: backendUrl("graph/backend-svg") },
  "dot:png": { backend: "graph/viz+raster/resvg", moduleUrl: backendUrl("graph/backend-png") },
  "mermaid:svg": { backend: "mermaid/native", moduleUrl: backendUrl("mermaid/backend-svg") },
  "mermaid:png": { backend: "mermaid/native+raster/resvg", moduleUrl: backendUrl("mermaid/backend-png") },
};

/** Builds the registry key of a pair. */
export function registryKey(type: string, format: string): string {
  return `${type}:${format}`;
}
