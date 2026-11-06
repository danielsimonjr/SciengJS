import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { texCoreFiles, type BundleSettings } from "./tex/bundles.ts";
import { detectBundles } from "./tex/detect.ts";

/** One backend: the module that the worker loads for a (type, format) pair. */
export interface BackendEntry {
  /** The backend name that a result reports, for example "graph/viz". */
  backend: string;
  /** An absolute file URL of a module that exports `render`. */
  moduleUrl: string;
  /**
   * Loads data in the parent process before the worker starts. The worker gets the result as `settings.texCore`.
   * A preload that returns undefined or rejects leaves the worker to load the data itself.
   */
  preload?: (settings: BundleSettings, source: string | Uint8Array) => Promise<ReadonlyMap<string, Uint8Array> | undefined>;
}

/** Maps "type:format" to a backend. A key is missing when no backend is built in. */
export type Registry = Record<string, BackendEntry>;

/** The URL of a backend module of this package. The extension follows the build: .ts from src, .js from dist. */
function backendUrl(name: string): string {
  const extension = extname(fileURLToPath(import.meta.url));
  return new URL(`./${name}${extension}`, import.meta.url).href;
}

/**
 * The preload of the tikz entries. The package detection runs first. A source that the detection rejects loads no
 * bundle: the worker then reports the error, as it does without a preload.
 */
async function texPreload(settings: BundleSettings, source: string | Uint8Array): Promise<ReadonlyMap<string, Uint8Array> | undefined> {
  if (typeof source !== "string") return undefined;
  try {
    detectBundles(source);
  } catch {
    return undefined;
  }
  return texCoreFiles(settings);
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
  "plot:html": { backend: "plot/plotly", moduleUrl: backendUrl("plot/backend-html") },
  "mermaid:svg": { backend: "mermaid/native", moduleUrl: backendUrl("mermaid/backend-svg") },
  "mermaid:png": { backend: "mermaid/native+raster/resvg", moduleUrl: backendUrl("mermaid/backend-png") },
  "dot:pdf": { backend: "graph/viz+browser/chromium", moduleUrl: backendUrl("graph/backend-pdf") },
  "mermaid:pdf": { backend: "mermaid/browser/chromium", moduleUrl: backendUrl("mermaid/backend-pdf") },
  "html:png": { backend: "browser/chromium", moduleUrl: backendUrl("browser/backend-png") },
  "html:pdf": { backend: "browser/chromium", moduleUrl: backendUrl("browser/backend-pdf") },
  "html:md": { backend: "html/md", moduleUrl: backendUrl("html/backend-md") },
  "step:glb": { backend: "mesh/occt+glb", moduleUrl: backendUrl("mesh/backend-glb") },
  "iges:glb": { backend: "mesh/occt+glb", moduleUrl: backendUrl("mesh/backend-glb") },
  "brep:glb": { backend: "mesh/occt+glb", moduleUrl: backendUrl("mesh/backend-glb") },
  "step:html": { backend: "mesh/occt+viewer", moduleUrl: backendUrl("mesh/backend-html") },
  "iges:html": { backend: "mesh/occt+viewer", moduleUrl: backendUrl("mesh/backend-html") },
  "brep:html": { backend: "mesh/occt+viewer", moduleUrl: backendUrl("mesh/backend-html") },
  "step:png": { backend: "mesh/occt+viewer+browser/chromium", moduleUrl: backendUrl("mesh/backend-png") },
  "iges:png": { backend: "mesh/occt+viewer+browser/chromium", moduleUrl: backendUrl("mesh/backend-png") },
  "brep:png": { backend: "mesh/occt+viewer+browser/chromium", moduleUrl: backendUrl("mesh/backend-png") },
  "cad:glb": { backend: "mesh/manifold+glb", moduleUrl: backendUrl("mesh/backend-glb") },
  "cad:stl": { backend: "mesh/manifold+stl", moduleUrl: backendUrl("mesh/backend-stl") },
  "cad:3mf": { backend: "mesh/manifold+3mf", moduleUrl: backendUrl("mesh/backend-3mf") },
  "cad:dxf": { backend: "mesh/manifold+dxf", moduleUrl: backendUrl("mesh/backend-dxf") },
  "cad:md": { backend: "mesh/manifold+dfm", moduleUrl: backendUrl("mesh/backend-dfm") },
  "cad:html": { backend: "mesh/manifold+viewer", moduleUrl: backendUrl("mesh/backend-html") },
  "cad:png": { backend: "mesh/manifold+viewer+browser/chromium", moduleUrl: backendUrl("mesh/backend-png") },
  "cad:pdf": { backend: "mesh/manifold+drawing+browser/chromium", moduleUrl: backendUrl("mesh/backend-pdf") },
  "tikz:svg": { backend: "tex/etex", moduleUrl: backendUrl("tex/backend-svg"), preload: texPreload },
  "tikz:png": { backend: "tex/etex+raster/resvg", moduleUrl: backendUrl("tex/backend-png"), preload: texPreload },
  "tikz:pdf": { backend: "tex/etex+browser/chromium", moduleUrl: backendUrl("tex/backend-pdf"), preload: texPreload },
  "sysml:svg": { backend: "sysml/graph", moduleUrl: backendUrl("sysml/backend-svg") },
  "sysml:png": { backend: "sysml/graph+raster/resvg", moduleUrl: backendUrl("sysml/backend-png") },
  "sysml:pdf": { backend: "sysml/graph+browser/chromium", moduleUrl: backendUrl("sysml/backend-pdf") },
};

/** Builds the registry key of a pair. */
export function registryKey(type: string, format: string): string {
  return `${type}:${format}`;
}
