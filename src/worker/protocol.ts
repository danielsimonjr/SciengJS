import type { InputType, OutputFormat, RenderOptions } from "../types.ts";

/** The configuration values that a backend reads. */
export interface BackendSettings {
  /** The memory limit of one render, in megabytes. */
  maxMemoryMb: number;
  /** The path of the raster font that replaces the bundled font, or undefined for the bundled font. */
  rasterFont: string | undefined;
  /** The folder URL of the bundled files: the raster font and the resvg WASM file. */
  assetsUrl: string;
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
}

/** The one message that a worker sends back. */
export type WorkerMessage =
  | { ok: true; bytes: Uint8Array; warnings: string[] }
  | { ok: false; code: string; message: string; line?: number; column?: number };
