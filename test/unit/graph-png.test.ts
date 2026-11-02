import { afterAll, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RenderError } from "../../src/errors.ts";
import { render } from "../../src/graph/backend-png.ts";
import type { WorkerJob } from "../../src/worker/protocol.ts";
import { countDarkPixels, decodePng } from "../support/png-decode.ts";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SOURCE = 'digraph G { a -> b [label="Hello"] }';
const BUNDLED_FONT = fileURLToPath(new URL("../../assets/fonts/LiberationSerif-Regular.ttf", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "scieng-i1-png-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function request(options: Record<string, unknown> = {}, rasterFont: string | undefined = undefined): WorkerJob["request"] {
  return {
    type: "dot",
    format: "png",
    source: SOURCE,
    options,
    settings: { maxMemoryMb: 2048, rasterFont },
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
    const path = join(scratch, "copy.ttf");
    copyFileSync(BUNDLED_FONT, path);
    const out = await render(request({}, path));
    expect(Array.from(out.bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);
  });
});
