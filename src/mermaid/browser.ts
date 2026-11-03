import { blockedWarnings, browserPathOf } from "../browser/input.ts";
import { createHash } from "node:crypto";
import { MERMAID_CDN_URL, MERMAID_FILE, MERMAID_SHA256 } from "../browser/pinned.ts";
import { RenderError } from "../errors.ts";
import { mermaidPageHtml, svgPageHtml } from "../browser/page.ts";
import { renderHtmlPage, type HtmlFormat, type HtmlPageRequest, type PinnedBytes } from "../browser/render.ts";
import { readAsset } from "../assets.ts";

/** The backend name of a Mermaid type that the browser stage draws. */
export const MERMAID_BROWSER_BACKEND = "mermaid/browser/chromium";
/** The backend name of a native Mermaid diagram that is then drawn to pdf in the browser. */
export const MERMAID_NATIVE_PDF_BACKEND = "mermaid/native+browser/chromium";

/** The settings of one browser render that a Mermaid backend reads. */
export interface BrowserSettings {
  browser: string | undefined;
  timeoutMs: number;
  assetsUrl: string;
}

/** The bytes and the warnings of one browser render. */
export interface BrowserDraw {
  bytes: Uint8Array;
  warnings: string[];
}

/**
 * Draws one Mermaid source of a browser type through the browser stage. The page names the pinned Mermaid URL.
 * The client fulfils that URL from the pinned build in the assets folder, so no request leaves the process.
 */
export async function drawMermaidInBrowser(
  source: string,
  format: HtmlFormat,
  settings: BrowserSettings,
  scale = 1,
): Promise<BrowserDraw & { backend: string }> {
  const browser = browserPathOf(settings.browser);
  const base = {
    html: mermaidPageHtml(source, MERMAID_CDN_URL),
    browser,
    timeoutMs: settings.timeoutMs,
    pinned: pinnedMermaid(settings.assetsUrl),
    awaitDone: true as const,
  };
  // A png of a page that reports done is sized from the diagram box. The scale is the device scale of the screenshot.
  const request: HtmlPageRequest =
    format === "png"
      ? { ...base, format: "png", width: 0, height: 0, scale }
      : format === "pdf"
        ? { ...base, format: "pdf" }
        : { ...base, format: "svg" };
  const out = await renderHtmlPage(request);
  return { bytes: out.bytes, warnings: blockedWarnings(out.blocked), backend: MERMAID_BROWSER_BACKEND };
}

/** Draws the SVG of a native Mermaid diagram to pdf in the browser. */
export async function drawSvgToPdf(svg: string, settings: BrowserSettings): Promise<BrowserDraw> {
  const browser = browserPathOf(settings.browser);
  const out = await renderHtmlPage({ html: svgPageHtml(svg), format: "pdf", browser, timeoutMs: settings.timeoutMs });
  return { bytes: out.bytes, warnings: blockedWarnings(out.blocked) };
}

/**
 * Reads the pinned Mermaid build from the assets folder and checks its SHA-256. A missing file rejects with
 * E_STAGE_MISSING. A file with other bytes rejects with E_INTEGRITY, so a changed copy never runs in a page.
 */
export function pinnedMermaid(assetsUrl: string): ReadonlyMap<string, PinnedBytes> {
  const bytes = readAsset(assetsUrl, MERMAID_FILE);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== MERMAID_SHA256) {
    throw new RenderError("E_INTEGRITY", `${MERMAID_FILE} has the SHA-256 ${hash}, not the pinned ${MERMAID_SHA256}`);
  }
  return new Map([[MERMAID_CDN_URL, { bytes, mime: "application/javascript" }]]);
}

