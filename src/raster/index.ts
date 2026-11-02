import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { RenderError } from "../errors.ts";

/** The options of one SVG to PNG render. */
export interface SvgToPngOptions {
  scale: number;
  maxMemoryMb: number;
  font?: Uint8Array;
}

let wasmPromise: Promise<void> | undefined;

function ensureWasm(): Promise<void> {
  if (wasmPromise === undefined) {
    wasmPromise = (async () => {
      const path = createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm");
      await initWasm(readFileSync(path));
    })();
  }
  return wasmPromise;
}

/** Renders an SVG to PNG bytes with resvg. The scale multiplies the SVG size. A pixel buffer over maxMemoryMb rejects with E_LIMIT. */
export async function svgToPng(svg: string, options: SvgToPngOptions): Promise<Uint8Array> {
  await ensureWasm();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: options.scale },
    dpi: 72,
    font: { loadSystemFonts: false, fontBuffers: options.font ? [options.font] : [] },
  });
  const limitBytes = options.maxMemoryMb * 1048576;
  const needed = Math.ceil(resvg.width * options.scale) * Math.ceil(resvg.height * options.scale) * 4;
  if (needed > limitBytes) {
    resvg.free();
    throw new RenderError(
      "E_LIMIT",
      "the PNG needs " + needed + " bytes of pixels; the limit is " + limitBytes + " bytes",
    );
  }
  const image = resvg.render();
  const png = image.asPng();
  resvg.free();
  return png;
}

/** Tells whether the bytes start with a TrueType, OpenType or Apple TrueType font signature. */
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
