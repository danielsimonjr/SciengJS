import { Worker } from "node:worker_threads";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob, WorkerMessage } from "./protocol.ts";

/** The exit of one worker. The exit code is the code that `Worker.terminate` reports. */
export interface WorkerExit {
  exitCode: number;
}

/** The limits of one worker render. */
export interface WorkerLimits {
  /** The time limit of one render, in milliseconds. */
  timeoutMs: number;
  /**
   * The heap limit of the worker, in megabytes. Node enforces it. Bun 1.4.4 accepts the option
   * and does not enforce it, so the limit holds only under Node, the release runtime.
   */
  maxMemoryMb: number;
  /** Called once the worker has exited, before the render settles. Tests use it to prove the exit. */
  onWorkerExit?: (exit: WorkerExit) => void;
  /** The longest wait for the worker to stop after the render settles, in milliseconds. */
  terminateWaitMs?: number;
  /** Creates the worker. Tests replace it with a double. */
  createWorker?: (entry: URL, data: WorkerJob, maxMemoryMb: number) => Worker;
}

/** The default longest wait for a worker to stop. It is the only place where this value is set. */
const DEFAULT_TERMINATE_WAIT_MS = 5000;

function createDefaultWorker(entry: URL, data: WorkerJob, maxMemoryMb: number): Worker {
  return new Worker(entry, {
    workerData: data,
    resourceLimits: { maxOldGenerationSizeMb: maxMemoryMb },
  });
}

/** Terminates the worker. It rejects when terminate throws, rejects or does not resolve within the wait. */
function stopWorker(worker: Worker, waitMs: number): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`the worker did not stop within ${waitMs} ms`)), waitMs);
  });
  const stop = new Promise<number>((resolve) => resolve(worker.terminate()));
  return Promise.race([stop, bound]).finally(() => clearTimeout(timer));
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
 * its exit, or the time limit. The promise settles only after the worker has exited.
 *
 * A heap exhaustion (`ERR_WORKER_OUT_OF_MEMORY`) maps to `E_LIMIT`. The design lists the heap
 * limit as a resource limit of a source. A crash of any other kind maps to `E_INTERNAL`.
 */
export function runInWorker(job: WorkerJob, limits: WorkerLimits): Promise<BackendOutput> {
  return new Promise<BackendOutput>((resolve, reject) => {
    const create = limits.createWorker ?? createDefaultWorker;
    const worker = create(entryUrl(), job, limits.maxMemoryMb);
    const terminateWaitMs = limits.terminateWaitMs ?? DEFAULT_TERMINATE_WAIT_MS;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (action: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      stopWorker(worker, terminateWaitMs)
        .then((exitCode) => {
          limits.onWorkerExit?.({ exitCode });
        })
        .then(action, (err: unknown) => {
          reject(new RenderError("E_INTERNAL", `render worker did not stop cleanly: ${messageOf(err)}`));
        });
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
    worker.once("error", (err: Error & { code?: string }) => {
      settle(() => {
        if (err.code === "ERR_WORKER_OUT_OF_MEMORY") {
          reject(new RenderError("E_LIMIT", `render exceeded the heap limit of ${limits.maxMemoryMb} MB`));
        } else {
          reject(new RenderError("E_INTERNAL", `render worker failed: ${err.message}`));
        }
      });
    });
    worker.once("exit", (code: number) => {
      settle(() => reject(new RenderError("E_INTERNAL", `render worker exited with code ${code} before it returned`)));
    });
  });
}
