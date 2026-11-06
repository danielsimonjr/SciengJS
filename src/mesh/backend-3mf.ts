import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { readMeshes } from "./backend-glb.ts";
import { threemfByteLength, write3mf } from "./threemf.ts";

/**
 * Renders a CAD document to a 3MF Core package. The worker calls this function. The package keeps the colours and
 * the names of the model. An output over maxMemoryMb rejects with E_LIMIT before the writer starts.
 */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const meshes = await readMeshes(request);
  const needed = threemfByteLength(meshes);
  const limitBytes = Math.floor(request.settings.maxMemoryMb * 1048576);
  if (needed > limitBytes) {
    throw new RenderError("E_LIMIT", "the 3mf output needs " + needed + " bytes; the limit is " + limitBytes + " bytes");
  }
  return { bytes: write3mf(meshes) };
}
