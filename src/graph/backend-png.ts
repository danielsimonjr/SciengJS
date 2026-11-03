import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RenderError } from "../errors.ts";
import type { BackendOutput, WorkerJob } from "../worker/protocol.ts";
import { dotSourceText, dotToSvg } from "./dot.ts";
import { isFontFile, svgToPng } from "../raster/index.ts";
import { rasterWarnings } from "../raster/warnings.ts";

const BUNDLED_FONT_PATH = fileURLToPath(
  new URL("../../assets/fonts/LiberationSerif-Regular.ttf", import.meta.url),
);

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

/** Renders dot to png: the SVG of the graph, then the PNG of that SVG at the option scale. */
export function render(request: WorkerJob["request"]): Promise<BackendOutput> {
  return renderPng(request, BUNDLED_FONT_PATH);
}

/** Renders dot to png with the bundled font at the given path. The path is a parameter so that a test can name a missing or invalid bundled font. */
export async function renderPng(request: WorkerJob["request"], bundledFontPath: string): Promise<BackendOutput> {
  const options = request.options;
  for (const key of Object.keys(options)) {
    if (key !== "scale") {
      throw new RenderError("E_INPUT", "dot to png takes no option " + key);
    }
  }
  let scale = 1;
  if ("scale" in options) {
    const value: unknown = options.scale;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      scale = value;
    } else {
      throw new RenderError("E_INPUT", "option scale must be a finite number greater than 0");
    }
  }

  const rasterFont = request.settings.rasterFont;
  const font = readFont(rasterFont ?? bundledFontPath, rasterFont === undefined);

  const dot = await dotToSvg(dotSourceText(request.source));
  const bytes = await svgToPng(dot.svg, {
    scale,
    maxMemoryMb: request.settings.maxMemoryMb,
    font,
  });
  return { bytes, warnings: [...dot.warnings, ...rasterWarnings(dot.svg, font)] };
}
