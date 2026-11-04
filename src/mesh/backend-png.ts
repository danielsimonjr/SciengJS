import { blockedWarnings, browserPathOf, parsePngOptions } from "../browser/input.ts";
import { renderHtmlPage } from "../browser/render.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { render as renderGlb } from "./backend-glb.ts";
import { pinnedThree } from "./pinned-three.ts";
import { viewerPageHtml } from "./viewer.ts";

/** The options that the png render reads itself. The glb render reads the others. */
const PNG_KEYS = ["width", "height", "scale"] as const;

/**
 * Renders a STEP, IGES or BREP file to png: the viewer page in the headless browser. The client fulfils the pinned
 * Three.js URLs from the assets folder, so no request leaves the process. The worker calls this function.
 */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const pngOptions: Record<string, unknown> = {};
  const meshOptions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(request.options)) {
    (PNG_KEYS.includes(key as (typeof PNG_KEYS)[number]) ? pngOptions : meshOptions)[key] = value;
  }
  const size = parsePngOptions(pngOptions);
  const browser = browserPathOf(request.settings.browser);
  const glb = await renderGlb({ ...request, options: meshOptions });
  const pinned = pinnedThree(request.settings.assetsUrl);
  const out = await renderHtmlPage({
    html: viewerPageHtml(glb.bytes, { title: `${request.type} model`, controls: false }),
    format: "png",
    width: size.width,
    height: size.height,
    scale: size.scale,
    browser,
    timeoutMs: request.settings.timeoutMs,
    pinned,
    awaitReady: true,
  });
  return { bytes: out.bytes, warnings: [...(glb.warnings ?? []), ...blockedWarnings(out.blocked)] };
}
