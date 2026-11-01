import type { InputType, OutputFormat, RenderOptions } from "../types.ts";

/** What the worker receives: one render request and the backend module that serves it. */
export interface WorkerJob {
  moduleUrl: string;
  backend: string;
  request: {
    type: InputType;
    format: OutputFormat;
    source: string | Uint8Array;
    options: RenderOptions;
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
