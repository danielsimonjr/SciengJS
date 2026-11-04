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
  "math:svg": { backend: "math/mathjax", moduleUrl: backendUrl("math/backend-svg") },
  "math:png": { backend: "math/mathjax+raster/resvg", moduleUrl: backendUrl("math/backend-png") },
  "math:pdf": { backend: "math/mathjax+browser/chromium", moduleUrl: backendUrl("math/backend-pdf") },
  "plot:svg": { backend: "plot/svg", moduleUrl: backendUrl("plot/backend-svg") },
  "plot:png": { backend: "plot/svg+raster/resvg", moduleUrl: backendUrl("plot/backend-png") },
  "mermaid:svg": { backend: "mermaid/native", moduleUrl: backendUrl("mermaid/backend-svg") },
  "mermaid:png": { backend: "mermaid/native+raster/resvg", moduleUrl: backendUrl("mermaid/backend-png") },
  "dot:pdf": { backend: "graph/viz+browser/chromium", moduleUrl: backendUrl("graph/backend-pdf") },
  "mermaid:pdf": { backend: "mermaid/browser/chromium", moduleUrl: backendUrl("mermaid/backend-pdf") },
  "html:png": { backend: "browser/chromium", moduleUrl: backendUrl("browser/backend-png") },
  "html:pdf": { backend: "browser/chromium", moduleUrl: backendUrl("browser/backend-pdf") },
};

/** Builds the registry key of a pair. */
export function registryKey(type: string, format: string): string {
  return `${type}:${format}`;
}
