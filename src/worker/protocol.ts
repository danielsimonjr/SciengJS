import type { NetworkPolicy } from "../config.ts";
import type { InputType, OutputFormat, RenderAsset, RenderOptions } from "../types.ts";

/** The configuration values that a backend reads. */
export interface BackendSettings {
  /** The memory limit of one render, in megabytes. */
  maxMemoryMb: number;
  /** The path of the raster font that replaces the bundled font, or undefined for the bundled font. */
  rasterFont: string | undefined;
  /** The folder URL of the bundled files: the raster font and the resvg WASM file. */
  assetsUrl: string;
  /** The path of the Chromium or Chrome executable, or undefined when no browser is configured. */
  browser: string | undefined;
  /** The time limit of one render, in milliseconds. A browser backend cleans up inside this limit. */
  timeoutMs: number;
  /** The network rule of the configuration. The html to md stage reads it for remote images. */
  allowNetwork: NetworkPolicy;
  /** The time limit of one remote image download, in milliseconds. */
  imageTimeoutMs: number;
  /** The node limit of one CAD document. */
  maxCadNodes: number;
  /** The facet limit of one CAD model. */
  maxCadFacets: number;
  /** The size limit of one remote image body, in bytes. */
  maxImageBytes: number;
  /** The cache folder. The tex stage keeps its bundles there. */
  cacheDir: string;
  /** The base URL of the TeX bundles. */
  texBundleUrl: string;
}

/** What the worker receives: one render request and the backend module that serves it. */
export interface WorkerJob {
  moduleUrl: string;
  backend: string;
  request: {
    type: InputType;
    format: OutputFormat;
    source: string | Uint8Array;
    options: RenderOptions;
    settings: BackendSettings;
  };
}

/** The value that a backend module returns from `render`. */
export interface BackendOutput {
  bytes: Uint8Array;
  warnings?: string[];
  /** The backend name of this output, when it differs from the registry entry (a route chosen per source). */
  backend?: string;
  /** Extra files of the render, for example the images of an html to md render. */
  assets?: RenderAsset[];
}

/** The one message that a worker sends back. */
export type WorkerMessage =
  | { ok: true; bytes: Uint8Array; warnings: string[]; backend?: string; assets?: RenderAsset[] }
  | { ok: false; code: string; message: string; line?: number; column?: number };
