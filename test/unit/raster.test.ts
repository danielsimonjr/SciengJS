import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RenderError } from "../../src/errors.ts";
import { isFontFile, MAX_PNG_PIXEL_MB, svgToPng } from "../../src/raster/index.ts";
import { countOpaquePixels, decodePng } from "../support/png-decode.ts";
import { makeAssetsFolder, makeScratch, realFiles, removeScratch } from "../support/assets-fixture.ts";

const FONT_BYTES = new Uint8Array(readFileSync(fileURLToPath(new URL("../../assets/fonts/LiberationSerif-Regular.ttf", import.meta.url))));
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RECT = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" viewBox="0 0 200 80"><rect x="0" y="0" width="100" height="80" fill="#ff0000"/></svg>';
const TEXT = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" viewBox="0 0 200 80"><text x="10" y="45" font-family="Times,serif" font-size="24">Hello</text></svg>';
const scratch = makeScratch("scieng-raster-");
const ASSETS = makeAssetsFolder(scratch, "assets", realFiles());
afterAll(() => removeScratch(scratch));

async function rejectionOf(promise: Promise<unknown>): Promise<RenderError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RenderError) return err;
    throw err;
  }
  throw new Error("expected a RenderError, but the promise resolved");
}

describe("svgToPng", () => {
  test("writes a PNG with the signature and the size of the SVG at the scale", async () => {
    const bytes = await svgToPng(RECT, { scale: 2, maxMemoryMb: 2048, assetsUrl: ASSETS });
    expect(Array.from(bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);
    const png = decodePng(bytes);
    expect(png.width).toBe(400);
    expect(png.height).toBe(160);
  });

  test("draws the fill of a rectangle with its colour", async () => {
    const png = decodePng(await svgToPng(RECT, { scale: 1, maxMemoryMb: 2048, assetsUrl: ASSETS }));
    const i = (40 * png.width + 50) * 4;
    expect(Array.from(png.rgba.subarray(i, i + 4))).toEqual([255, 0, 0, 255]);
  });

  test("census: without a font, a text element draws no pixel", async () => {
    const png = decodePng(await svgToPng(TEXT, { scale: 1, maxMemoryMb: 2048, assetsUrl: ASSETS }));
    expect(countOpaquePixels(png)).toBe(0);
  });

  test("census: with the bundled font, the same text draws pixels", async () => {
    const png = decodePng(await svgToPng(TEXT, { scale: 1, maxMemoryMb: 2048, font: FONT_BYTES, assetsUrl: ASSETS }));
    expect(countOpaquePixels(png)).toBeGreaterThan(100);
  });

  test("a pixel buffer of exactly maxMemoryMb renders, and one pixel column more rejects with E_LIMIT", async () => {
    // 512 by 512 pixels at four bytes each is exactly one mebibyte.
    const square = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#00ff00"/></svg>';
    const wide = '<svg xmlns="http://www.w3.org/2000/svg" width="513" height="512"><rect width="513" height="512" fill="#00ff00"/></svg>';
    expect(decodePng(await svgToPng(square, { scale: 1, maxMemoryMb: 1, assetsUrl: ASSETS })).width).toBe(512);
    const err = await rejectionOf(svgToPng(wide, { scale: 1, maxMemoryMb: 1, assetsUrl: ASSETS }));
    expect(err.code).toBe("E_LIMIT");
  });
});

describe("svgToPng pixel cap", () => {
  test("a PNG over the fixed pixel cap rejects with E_LIMIT even when maxMemoryMb is larger", async () => {
    // One row of 1.5 billion pixels is 6 GB of pixels: over the cap, and more than the 4 GiB of WASM memory.
    // The check rejects it before resvg draws. A square input over the cap would draw a 1 GiB buffer if the
    // cap were removed, and that run would stop at its time limit instead of failing an assertion.
    const wide = `<svg xmlns="http://www.w3.org/2000/svg" width="1500000000" height="1"><rect width="1" height="1"/></svg>`;
    const err = await rejectionOf(svgToPng(wide, { scale: 1, maxMemoryMb: 8192, assetsUrl: ASSETS }));
    expect(err.code).toBe("E_LIMIT");
    expect(err.message).toContain("pixel");
  });

  test("the cap is below the 4 GiB WASM memory with room for two copies", () => {
    expect(MAX_PNG_PIXEL_MB).toBeLessThanOrEqual(1024);
  });
});

describe("svgToPng failure paths", () => {
  test("an SVG that resvg cannot parse rejects with E_INPUT", async () => {
    const err = await rejectionOf(svgToPng("<svg", { scale: 1, maxMemoryMb: 2048, assetsUrl: ASSETS }));
    expect(err.code).toBe("E_INPUT");
  });

  test("a render after a failed render still works", async () => {
    await rejectionOf(svgToPng("<svg", { scale: 1, maxMemoryMb: 2048, assetsUrl: ASSETS }));
    expect((await svgToPng(RECT, { scale: 1, maxMemoryMb: 2048, assetsUrl: ASSETS })).byteLength).toBeGreaterThan(50);
  });
});

describe("isFontFile", () => {
  test("accepts a TrueType, an OpenType and an Apple TrueType signature", () => {
    expect(isFontFile(new Uint8Array([0, 1, 0, 0, 0, 0]))).toBe(true);
    expect(isFontFile(new TextEncoder().encode("OTTO0000"))).toBe(true);
    expect(isFontFile(new TextEncoder().encode("true0000"))).toBe(true);
  });

  test("rejects a TrueType collection, because resvg gets one font buffer", () => {
    expect(isFontFile(new TextEncoder().encode("ttcf0000"))).toBe(false);
  });

  test("rejects an empty file, a short file and text", () => {
    expect(isFontFile(new Uint8Array())).toBe(false);
    expect(isFontFile(new Uint8Array([0, 1]))).toBe(false);
    expect(isFontFile(new TextEncoder().encode('{"name":"not a font"}'))).toBe(false);
  });

  test("the bundled font has a font signature", () => {
    expect(isFontFile(FONT_BYTES)).toBe(true);
  });
});
