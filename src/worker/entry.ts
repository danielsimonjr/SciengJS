import { parentPort, workerData } from "node:worker_threads";
import { RenderError, RENDER_ERROR_CODES, type RenderErrorCode } from "../errors.ts";
import type { BackendOutput, WorkerJob, WorkerMessage } from "./protocol.ts";

/**
 * The worker side of a render. It loads the backend module, runs one request and posts one message.
 * A backend error that is a RenderError keeps its code. Any other error maps to E_INTERNAL.
 */
async function run(job: WorkerJob): Promise<WorkerMessage> {
  try {
    const mod = (await import(job.moduleUrl)) as { render?: (req: WorkerJob["request"]) => BackendOutput | Promise<BackendOutput> };
    if (typeof mod.render !== "function") {
      throw new RenderError("E_INTERNAL", `backend module ${job.moduleUrl} exports no render function`);
    }
    const out = await mod.render(job.request);
    return { ok: true, bytes: out.bytes, warnings: out.warnings ?? [] };
  } catch (err) {
    if (err instanceof RenderError) {
      return { ok: false, code: err.code, message: err.message, line: err.line, column: err.column };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "E_INTERNAL", message };
  }
}

const job = workerData as WorkerJob;
const message = await run(job);
if (!message.ok && !(RENDER_ERROR_CODES as readonly string[]).includes(message.code)) {
  message.code = "E_INTERNAL" satisfies RenderErrorCode;
}
parentPort?.postMessage(message);
