import { readFileSync } from "node:fs";
import { RenderError } from "../errors.ts";
import { bundledFontPathIn } from "../assets.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { dotToSvg } from "./dot.ts";
import { sourceText } from "./text.ts";
import { isFontFile, svgToPng } from "../raster/index.ts";
import { rasterWarnings } from "../raster/warnings.ts";

function readFont(path: string, bundled: boolean): Buffer {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    throw bundled
      ? new RenderError("E_STAGE_MISSING", "the bundled raster font is missing: " + path)
      : new RenderError("E_CONFIG", "rasterFont cannot be read: " + path);
  }
  if (!isFontFile(bytes)) {
    throw bundled
      ? new RenderError("E_STAGE_MISSING", "the bundled raster font is not a font: " + path)
      : new RenderError("E_CONFIG", "rasterFont is not a TrueType or OpenType font: " + path);
  }
  return bytes;
}

/** Reads the font of a render: the rasterFont setting when set, else the bundled font at the given path. */
function fontOf(settings: WorkerJob["request"]["settings"], bundledFontPath: string): Buffer {
  const rasterFont = settings.rasterFont;
  return readFont(rasterFont ?? bundledFontPath, rasterFont === undefined);
}

/** Reads the option scale of a png. An absent value gives 1. A value that is not a finite number above 0 rejects with E_INPUT. */
export function readScale(options: Record<string, unknown>): number {
  const value: unknown = options.scale;
  if (value === undefined) return 1;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  throw new RenderError("E_INPUT", "option scale must be a finite number greater than 0");
}

/** Renders dot to png: the SVG of the graph, then the PNG of that SVG at the option scale. The bundled font comes from the assets folder named in the settings. */
export async function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  return renderPng(request, bundledFontPathIn(request.settings.assetsUrl));
}

/** Renders dot to png with the bundled font at the given path. The path is a parameter so that a test can name a missing or invalid bundled font. */
export async function renderPng(request: WorkerJob["request"], bundledFontPath: string): Promise<BackendOutput> {
  const options = request.options;
  for (const key of Object.keys(options)) {
    if (key !== "scale") {
      throw new RenderError("E_INPUT", "dot to png takes no option " + key);
    }
  }
  const scale = readScale(options);

  const font = fontOf(request.settings, bundledFontPath);

  const dot = await dotToSvg(sourceText(request.source));
  const bytes = await svgToPng(dot.svg, {
    scale,
    maxMemoryMb: request.settings.maxMemoryMb,
    font,
    assetsUrl: request.settings.assetsUrl,
  });
  return { bytes, warnings: [...dot.warnings, ...rasterWarnings(dot.svg, font)] };
}

/**
 * Rasterizes one SVG document to PNG at the given scale. The font follows render: the rasterFont setting when set,
 * else the bundled font in the assets folder. The Mermaid PNG backend uses this function.
 */
export async function svgDocumentToPng(svg: string, request: WorkerJob["request"], scale = 1): Promise<BackendOutput> {
  const font = fontOf(request.settings, bundledFontPathIn(request.settings.assetsUrl));
  const bytes = await svgToPng(svg, {
    scale,
    maxMemoryMb: request.settings.maxMemoryMb,
    font,
    assetsUrl: request.settings.assetsUrl,
  });
  return { bytes, warnings: rasterWarnings(svg, font) };
}
