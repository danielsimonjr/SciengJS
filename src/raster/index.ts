import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { readAsset, RESVG_WASM_FILE } from "../assets.ts";
import { DEFAULT_ASSETS_URL } from "../config.ts";
import { RenderError } from "../errors.ts";

/**
 * The most megabytes of RGBA pixels that one PNG render accepts. Measured: a render holds about two
 * copies of the pixel buffer (the pixmap and the PNG encoder input), so the peak is 2.0 times the pixels
 * (8000 by 8000 pixels peak at 536 MB, 16000 by 16000 at 1999 MB). WASM memory ends at 4 GiB.
 */
export const MAX_PNG_PIXEL_MB = 1024;

/** The options of one SVG to PNG render. */
export interface SvgToPngOptions {
  scale: number;
  maxMemoryMb: number;
  font?: Uint8Array;
  /**
   * The folder URL of the bundled files. When the folder URL is absent, the code uses the
   * package assets folder (DEFAULT_ASSETS_URL). The code reads the WASM file from this folder on
   * the first start of the module only.
   */
  assetsUrl?: string;
  /** Replaces the reader of the resvg WASM file. Tests use it to fail the first start. */
  readWasm?: () => Uint8Array;
}

let wasmPromise: Promise<void> | undefined;

// The first start decides the bytes; later calls reuse the started module whatever their assetsUrl.
// A failed start is not cached, so a later render can try again.
function ensureWasm(readWasm: () => Uint8Array): Promise<void> {
  if (wasmPromise === undefined) {
    const started = (async () => {
      const bytes = readWasm();
      try {
        await initWasm(bytes);
      } catch (err) {
        if (err instanceof Error && err.name === "CompileError") {
          throw new RenderError("E_STAGE_MISSING", RESVG_WASM_FILE + " is not a usable WebAssembly module: " + err.message);
        }
        throw err;
      }
    })();
    wasmPromise = started;
    started.catch(() => {
      if (wasmPromise === started) {
        wasmPromise = undefined;
      }
    });
  }
  return wasmPromise;
}

/** Renders an SVG to PNG bytes with resvg. The scale multiplies the SVG size. A pixel buffer over maxMemoryMb or over MAX_PNG_PIXEL_MB rejects with E_LIMIT. */
export async function svgToPng(svg: string, options: SvgToPngOptions): Promise<Uint8Array> {
  const assetsUrl = options.assetsUrl ?? DEFAULT_ASSETS_URL;
  await ensureWasm(options.readWasm ?? (() => readAsset(assetsUrl, RESVG_WASM_FILE)));
  let resvg: InstanceType<typeof Resvg>;
  try {
    resvg = new Resvg(svg, {
      fitTo: { mode: "zoom", value: options.scale },
      dpi: 72,
      font: { loadSystemFonts: false, fontBuffers: options.font ? [options.font] : [] },
    });
  } catch (err) {
    throw new RenderError("E_INPUT", "resvg cannot read the SVG: " + (err instanceof Error ? err.message : String(err)));
  }
  try {
    const limitMb = Math.min(options.maxMemoryMb, MAX_PNG_PIXEL_MB);
    const limitBytes = limitMb * 1048576;
    const needed = Math.ceil(resvg.width * options.scale) * Math.ceil(resvg.height * options.scale) * 4;
    if (needed > limitBytes) {
      throw new RenderError(
        "E_LIMIT",
        "the PNG needs " + needed + " bytes of pixels; the limit is " + limitBytes + " bytes",
      );
    }
    return resvg.render().asPng();
  } finally {
    resvg.free();
  }
}

/** Tells whether the bytes start with a TrueType, OpenType or Apple TrueType font signature. A collection (ttcf) is not a single font. */
export function isFontFile(bytes: Uint8Array): boolean {
  if (bytes.length < 4) {
    return false;
  }
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];
  if (b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00) {
    return true;
  }
  if (b0 === 0x4f && b1 === 0x54 && b2 === 0x54 && b3 === 0x4f) {
    return true;
  }
  if (b0 === 0x74 && b1 === 0x72 && b2 === 0x75 && b3 === 0x65) {
    return true;
  }
  return false;
}
