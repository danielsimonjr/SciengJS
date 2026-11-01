import { Worker } from "node:worker_threads";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob, WorkerMessage } from "./protocol.ts";

export interface WorkerLimits {
  /** The time limit of one render, in milliseconds. */
  timeoutMs: number;
  /** The heap limit of the worker, in megabytes. Node enforces it. Bun does not. */
  maxMemoryMb: number;
}

/**
 * The entry file sits next to this module. Its extension follows this module:
 * `.ts` under Bun tests, `.js` in the built package.
 */
function entryUrl(): URL {
  const here = fileURLToPath(import.meta.url);
  return new URL(`./entry${extname(here)}`, import.meta.url);
}

/**
 * Runs one render in a fresh worker. The worker ends at the first of: its message, its error,
 * its exit, or the time limit. The worker is always terminated before the promise settles.
 */
export function runInWorker(job: WorkerJob, limits: WorkerLimits): Promise<BackendOutput> {
  return new Promise<BackendOutput>((resolve, reject) => {
    const worker = new Worker(entryUrl(), {
      workerData: job,
      resourceLimits: { maxOldGenerationSizeMb: limits.maxMemoryMb },
    });
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (action: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      void worker.terminate().catch(() => undefined);
      action();
    };

    timer = setTimeout(() => {
      settle(() => reject(new RenderError("E_TIMEOUT", `render did not finish within ${limits.timeoutMs} ms`)));
    }, limits.timeoutMs);

    worker.once("message", (msg: WorkerMessage) => {
      settle(() => {
        if (msg.ok) {
          resolve({ bytes: msg.bytes, warnings: msg.warnings });
        } else {
          const code = msg.code as RenderError["code"];
          reject(new RenderError(code, msg.message, { line: msg.line, column: msg.column }));
        }
      });
    });
    worker.once("error", (err: Error) => {
      settle(() => reject(new RenderError("E_INTERNAL", `render worker failed: ${err.message}`)));
    });
    worker.once("exit", (code: number) => {
      settle(() => reject(new RenderError("E_INTERNAL", `render worker exited with code ${code} before it returned`)));
    });
  });
}
