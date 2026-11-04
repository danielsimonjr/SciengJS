import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { RenderError } from "../errors.ts";
import { browserPathOf, blockedWarnings } from "../browser/input.ts";
import { renderHtmlPage } from "../browser/render.ts";
import { convertPage } from "./md.ts";

/** The options of html to md. Each key has one default, here and nowhere else. */
const OPTION_KEYS = ["browser", "downloadImages"] as const;

/** Checks the options. An unknown key or a value that is not a boolean rejects with E_INPUT. */
function parseOptions(options: Record<string, unknown>): { browser: boolean; downloadImages: boolean } {
  for (const key of Object.keys(options)) {
    if (!(OPTION_KEYS as readonly string[]).includes(key)) {
      throw new RenderError("E_INPUT", `html to md takes no option ${key}`);
    }
    if (typeof options[key] !== "boolean") {
      throw new RenderError("E_INPUT", `option ${key} must be true or false`);
    }
  }
  return { browser: options.browser === true, downloadImages: options.downloadImages === true };
}

/** Renders html to Markdown. The worker calls this function. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  const options = parseOptions(request.options);
  if (typeof request.source !== "string") {
    throw new RenderError("E_INPUT", "html takes text, not bytes");
  }
  let html = request.source;
  const warnings: string[] = [];
  if (options.browser) {
    const browser = browserPathOf(request.settings.browser);
    const dom = await renderHtmlPage({ html, format: "dom", browser, timeoutMs: request.settings.timeoutMs });
    html = new TextDecoder().decode(dom.bytes);
    warnings.push(...blockedWarnings(dom.blocked));
  }
  const page = await convertPage(html, {
    downloadImages: options.downloadImages,
    allowNetwork: request.settings.allowNetwork,
    fetchImage: options.downloadImages ? fetchRemoteImage : undefined,
  });
  return {
    bytes: new TextEncoder().encode(page.markdown),
    warnings: [...warnings, ...page.warnings],
    assets: page.assets,
  };
}

/** Downloads one remote image with the network of the engine process. */
async function fetchRemoteImage(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const reply = await fetch(url);
  if (!reply.ok) throw new Error(`HTTP ${reply.status}`);
  const mime = (reply.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  return { bytes: new Uint8Array(await reply.arrayBuffer()), mime: mime === "" ? "application/octet-stream" : mime };
}
