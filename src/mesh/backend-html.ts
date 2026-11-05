import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { render as renderGlb } from "./backend-glb.ts";
import { viewerPageHtml } from "./viewer.ts";

/**
 * Renders a STEP, IGES or BREP file to html: one page with a Three.js viewer that embeds the glb. The page names the
 * pinned Three.js URLs. The options are the options of the glb render. The worker calls this function.
 */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const glb = await renderGlb(request);
  const html = viewerPageHtml(glb.bytes, { title: `${request.type} model`, controls: true });
  return { bytes: new TextEncoder().encode(html), warnings: glb.warnings };
}
