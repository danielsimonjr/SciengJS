import { afterAll, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RenderError } from "../../src/errors.ts";
import { render, renderPng } from "../../src/graph/backend-png.ts";
import type { WorkerJob } from "../../src/worker/protocol.ts";
import { countDarkPixels, decodePng } from "../support/png-decode.ts";
import { renderWithRegistry } from "../../src/core.ts";
import { DEFAULT_REGISTRY } from "../../src/registry.ts";
import { ISOLATED_CONFIG_DEPS } from "../support/test-registry.ts";
import { makeAssetsFolder, noGlyphFont, realFiles, wasmImportingMissingFunction, wasmWhoseStartTraps, wasmWithCustomSection } from "../support/assets-fixture.ts";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SOURCE = 'digraph G { a -> b [label="Hello"] }';
const BUNDLED_FONT = fileURLToPath(new URL("../../assets/fonts/LiberationSerif-Regular.ttf", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "scieng-i1-png-"));
const ASSETS = makeAssetsFolder(scratch, "assets", realFiles());

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function request(options: Record<string, unknown> = {}, rasterFont: string | undefined = undefined): WorkerJob["request"] {
  return {
    type: "dot",
    format: "png",
    source: SOURCE,
    options,
    settings: { maxMemoryMb: 2048, rasterFont, assetsUrl: ASSETS },
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<RenderError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RenderError) return err;
    throw err;
  }
  throw new Error("expected a RenderError, but the promise resolved");
}

describe("dot to png backend", () => {
  test("renders a PNG with the signature, the nodes and no warning", async () => {
    const out = await render(request());
    expect(Array.from(out.bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);
    expect(out.warnings).toEqual([]);
    expect(countDarkPixels(decodePng(out.bytes))).toBeGreaterThan(50);
  });

  test("the scale option enlarges the image", async () => {
    const one = decodePng((await render(request({ scale: 1 }))).bytes);
    const two = decodePng((await render(request({ scale: 2 }))).bytes);
    expect(two.width).toBeGreaterThan(one.width);
    expect(two.height).toBeGreaterThan(one.height);
  });

  test("an unknown option rejects with E_INPUT", async () => {
    const err = await rejectionOf(render(request({ dpi: 300 })));
    expect(err.code).toBe("E_INPUT");
  });

  test("a scale that is not a finite number above zero rejects with E_INPUT", async () => {
    for (const scale of [0, -1, "2", Infinity]) {
      const err = await rejectionOf(render(request({ scale })));
      expect(err.code).toBe("E_INPUT");
    }
  });

  test("an image over maxMemoryMb rejects with E_LIMIT before any pixel is drawn", async () => {
    const err = await rejectionOf(render(request({ scale: 1000 })));
    expect(err.code).toBe("E_LIMIT");
  });

  test("a rasterFont that cannot be read rejects with E_CONFIG", async () => {
    const err = await rejectionOf(render(request({}, join(scratch, "missing.ttf"))));
    expect(err.code).toBe("E_CONFIG");
  });

  test("an empty rasterFont rejects with E_CONFIG", async () => {
    const path = join(scratch, "empty.ttf");
    writeFileSync(path, "");
    const err = await rejectionOf(render(request({}, path)));
    expect(err.code).toBe("E_CONFIG");
  });

  test("a rasterFont that is not a font rejects with E_CONFIG", async () => {
    const path = join(scratch, "text.ttf");
    writeFileSync(path, '{"name":"not a font"}');
    const err = await rejectionOf(render(request({}, path)));
    expect(err.code).toBe("E_CONFIG");
  });

  test("a rasterFont with a font signature is used in place of the bundled font", async () => {
    // A file with a TrueType signature and no tables holds no glyph, so a render that uses it draws no text.
    const path = join(scratch, "no-glyphs.ttf");
    writeFileSync(path, new Uint8Array(64));
    const bytes = new Uint8Array(64);
    bytes.set([0, 1, 0, 0]);
    writeFileSync(path, bytes);
    const labelled = 'digraph G { a [label="WWWWWWWWWWWW"] }';
    const withBundled = await render({ ...request(), source: labelled });
    const withReplacement = await render({ ...request({}, path), source: labelled });
    expect(Array.from(withReplacement.bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);
    const drawn = countDarkPixels(decodePng(withBundled.bytes));
    const blank = countDarkPixels(decodePng(withReplacement.bytes));
    expect(drawn).toBeGreaterThan(blank + 200);
  });

  test("a copy of the bundled font gives the same PNG as the bundled font", async () => {
    const path = join(scratch, "copy.ttf");
    copyFileSync(BUNDLED_FONT, path);
    const same = await render(request({}, path));
    const bundled = await render(request());
    expect(Buffer.from(same.bytes).equals(Buffer.from(bundled.bytes))).toBe(true);
  });

  test("a TrueType collection rejects with E_CONFIG, because the stage takes one font file", async () => {
    const path = join(scratch, "collection.ttc");
    writeFileSync(path, new TextEncoder().encode("ttcf0000"));
    const err = await rejectionOf(render(request({}, path)));
    expect(err.code).toBe("E_CONFIG");
  });

  test("a missing bundled font rejects with E_STAGE_MISSING and names the path", async () => {
    const missing = join(scratch, "no-such-bundled.ttf");
    const err = await rejectionOf(renderPng(request(), missing));
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(err.message).toContain(missing);
  });

  test("a bundled font that is not a font rejects with E_STAGE_MISSING", async () => {
    const path = join(scratch, "bundled-text.ttf");
    writeFileSync(path, "not a font");
    const err = await rejectionOf(renderPng(request(), path));
    expect(err.code).toBe("E_STAGE_MISSING");
  });

  test("a configured rasterFont is read in place of the bundled path, even when the bundled path is missing", async () => {
    const path = join(scratch, "configured.ttf");
    copyFileSync(BUNDLED_FONT, path);
    const out = await renderPng(request({}, path), join(scratch, "no-such-bundled.ttf"));
    expect(Array.from(out.bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);
  });

  test("bold, italic and CJK labels give one warning each for the face and the glyphs", async () => {
    const out = await render({ ...request(), source: 'digraph G { a [label=<<B>x</B> <I>y</I>>]; b [label="日本"] }' });
    const warnings = out.warnings ?? [];
    const ours = warnings.filter((w) => !w.startsWith("graphviz"));
    expect(ours).toHaveLength(3);
    expect(warnings.join(" ")).toContain("bold");
    expect(warnings.join(" ")).toContain("italic");
    expect(warnings.join(" ")).toContain("no glyph");
  });

  test("a label that the font can draw gives no warning", async () => {
    const out = await render(request());
    expect(out.warnings).toEqual([]);
  });
});

describe("dot to png through the worker reads its files from assetsUrl", () => {
  const LABELLED = 'digraph G { a [label="WWWWWWWWWWWW"] }';

  function pngAt(assetsUrl: string) {
    return renderWithRegistry({ type: "dot", format: "png", source: LABELLED }, { assetsUrl }, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
  }

  test("the bundled font is the one in assetsUrl: a font with no glyphs draws no label", async () => {
    const blankUrl = makeAssetsFolder(scratch, "no-glyph", { font: noGlyphFont(), wasm: realFiles().wasm });
    const drawn = await pngAt(ASSETS);
    const blank = await pngAt(blankUrl);
    expect(Array.from(blank.bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);
    expect(countDarkPixels(decodePng(drawn.bytes))).toBeGreaterThan(countDarkPixels(decodePng(blank.bytes)) + 200);
  });

  test("a missing bundled font rejects with E_STAGE_MISSING and names the font file", async () => {
    const url = makeAssetsFolder(scratch, "no-font", { wasm: realFiles().wasm });
    const err = await rejectionOf(pngAt(url));
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(err.message).toContain("LiberationSerif-Regular.ttf");
  });

  test("a missing WASM file rejects with E_STAGE_MISSING and names the file", async () => {
    const url = makeAssetsFolder(scratch, "no-wasm", { font: realFiles().font });
    const err = await rejectionOf(pngAt(url));
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(err.message).toContain("index_bg.wasm");
  });

  test("a WASM file that cannot start rejects with E_STAGE_MISSING", async () => {
    const url = makeAssetsFolder(scratch, "cut-wasm", { font: realFiles().font, wasm: realFiles().wasm.subarray(0, 100) });
    const err = await rejectionOf(pngAt(url));
    expect(err.code).toBe("E_STAGE_MISSING");
  });

  test("a WASM file that imports a function the glue does not provide rejects with E_STAGE_MISSING", async () => {
    const url = makeAssetsFolder(scratch, "link-wasm", { font: realFiles().font, wasm: wasmImportingMissingFunction() });
    const err = await rejectionOf(pngAt(url));
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(err.message).toContain("index_bg.wasm");
  });

  test("a WASM file whose start function traps rejects with E_STAGE_MISSING", async () => {
    const url = makeAssetsFolder(scratch, "trap-wasm", { font: realFiles().font, wasm: wasmWhoseStartTraps() });
    const err = await rejectionOf(pngAt(url));
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(err.message).toContain("index_bg.wasm");
  });

  test("a WASM file with one extra custom section starts and renders", async () => {
    const url = makeAssetsFolder(scratch, "variant-wasm", { font: realFiles().font, wasm: wasmWithCustomSection() });
    const out = await pngAt(url);
    expect(Array.from(out.bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);
  });

  test("an assetsUrl that is not a file folder URL rejects with E_CONFIG before any worker starts", async () => {
    const err = await rejectionOf(pngAt("https://example.test/assets/"));
    expect(err.code).toBe("E_CONFIG");
  });
});
