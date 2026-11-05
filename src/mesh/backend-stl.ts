import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { readMeshes } from "./backend-glb.ts";
import { stlByteLength, writeStl } from "./stl.ts";

/**
 * Renders a CAD document to a binary STL file. The worker calls this function. STL holds no colour and no name,
 * so the render warns when the model has a colour. An output over maxMemoryMb rejects with E_LIMIT before the
 * writer starts.
 */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const meshes = await readMeshes(request);
  const needed = stlByteLength(meshes);
  const limitBytes = request.settings.maxMemoryMb * 1048576;
  if (needed > limitBytes) {
    throw new RenderError("E_LIMIT", "the stl output needs " + needed + " bytes; the limit is " + limitBytes + " bytes");
  }
  const colored = meshes.some((m) => m.faces.some((f) => f.color !== null));
  return { bytes: writeStl(meshes), warnings: colored ? ["stl holds no colour; the colours of the model are dropped"] : undefined };
}
