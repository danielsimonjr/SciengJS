import { THREE_MAIN_URL, THREE_MODULES } from "../browser/pinned.ts";
import { VIEWER_SCRIPT } from "./viewer-script.ts";

/** The options of a viewer page. */
export interface ViewerOptions {
  /** The page title. */
  title?: string;
  /** True shows the panel with the section and exploded view controls. A png render hides the panel. */
  controls?: boolean;
}

const PAGE_STYLE = "html,body{margin:0;height:100%;overflow:hidden;background:#f2f4f7}";

/** Escapes text for an HTML element body. */
function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The pinned module with a path inside the three package. */
function moduleOf(path: string): { url: string; sri: string } {
  const found = THREE_MODULES.find((m) => m.path === path);
  if (found === undefined) throw new Error(`the pinned module ${path} is missing`);
  return found;
}

/**
 * A page that views one glTF binary. The page embeds the glb as base64 text and loads the pinned Three.js modules
 * from their exact URLs. An import map maps the name three to the pinned URL and holds the integrity value of every
 * module. A modulepreload link with the same integrity value starts each download. The page draws one frame and then
 * sets window.__sciengDone, so the browser stage knows when to take the screenshot.
 */
export function viewerPageHtml(glb: Uint8Array, options: ViewerOptions = {}): string {
  const orbit = moduleOf("examples/jsm/controls/OrbitControls.js");
  const loader = moduleOf("examples/jsm/loaders/GLTFLoader.js");
  const integrity: Record<string, string> = {};
  for (const m of THREE_MODULES) integrity[m.url] = m.sri;
  const importMap = JSON.stringify({ imports: { three: THREE_MAIN_URL }, integrity }).replace(/</g, "\u003c");
  const preload = THREE_MODULES.map(
    (m) => `<link rel="modulepreload" href="${m.url}" integrity="${m.sri}" crossorigin="anonymous">`,
  ).join("");
  const script = VIEWER_SCRIPT.replace("@@ORBIT@@", orbit.url)
    .replace("@@GLTF@@", loader.url)
    .replace("@@GLB@@", Buffer.from(glb).toString("base64"))
    .replace("@@CONTROLS@@", options.controls === false ? "false" : "true");
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escapeHtmlText(options.title ?? "model")}</title><style>${PAGE_STYLE}</style>` +
    `<script type="importmap">${importMap}</script>${preload}</head><body>` +
    `<script type="module">${script}</script></body></html>`
  );
}
