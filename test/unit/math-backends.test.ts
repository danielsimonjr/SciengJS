import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderIsolated } from "../support/test-registry.ts";
import { rejectionOf } from "../support/rejections.ts";
import { countDarkPixels, decodePng } from "../support/png-decode.ts";
import { makeAssetsFolder, realFiles } from "../support/assets-fixture.ts";
import { render as renderSvg } from "../../src/math/backend-svg.ts";
import { render as renderPng } from "../../src/math/backend-png.ts";
import { render as renderPdf } from "../../src/math/backend-pdf.ts";
import { mathToSvg } from "../../src/math/index.ts";
import type { WorkerJob } from "../../src/worker/protocol.ts";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SOURCE = "\\frac{a+b}{c-d}";
const CE_SOURCE = "\\ce{H2O + CO2 -> H2CO3}";
const BROWSER = process.env.SCIENG_BROWSER ?? "";
const haveBrowser = BROWSER !== "" && existsSync(BROWSER);
const NONE = { allowNetwork: "none" as const };
const scratch = mkdtempSync(join(tmpdir(), "scieng-i6-math-"));
const ASSETS = makeAssetsFolder(scratch, "assets", realFiles());
const ASSETS_DIR = fileURLToPath(new URL("../../assets/", import.meta.url));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function job(format: "svg" | "png" | "pdf", options: Record<string, unknown> = {}): WorkerJob["request"] {
  return {
    type: "math",
    format,
    source: SOURCE,
    options,
    settings: { maxMemoryMb: 2048, rasterFont: undefined, assetsUrl: ASSETS_DIR, browser: haveBrowser ? BROWSER : undefined, timeoutMs: 60000, allowNetwork: "tex-bundles" },
  };
}

describe("math to svg through the registry", () => {
  test("renders a standalone svg with no text element and no font reference", async () => {
    const result = await renderIsolated({ type: "math", source: SOURCE, format: "svg" }, NONE);
    expect(result.mime).toBe("image/svg+xml");
    expect(result.backend).toBe("math/mathjax");
    const svg = new TextDecoder().decode(result.bytes);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toMatch(/<text[\s>]/);
    expect(svg).not.toMatch(/font-family/i);
  });

  test("renders the \\ce sample with the mhchem package and no font reference", async () => {
    const result = await renderIsolated({ type: "math", source: CE_SOURCE, format: "svg" }, NONE);
    const svg = new TextDecoder().decode(result.bytes);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toMatch(/<text[\s>]/);
    expect(svg).not.toMatch(/font-family/i);
  });

  test("the backend rejects an option, because the svg output takes none", async () => {
    const err = await rejectionOf(renderSvg(job("svg", { scale: 2 })));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toBe("math to svg takes no options; got scale");
  });

  test("the backend accepts an empty option bag", async () => {
    const out = await renderSvg(job("svg", {}));
    expect(new TextDecoder().decode(out.bytes).startsWith("<svg")).toBe(true);
  });
});

describe("math to png through the registry", () => {
  test("renders a PNG with the PNG signature and visible pixels", async () => {
    const result = await renderIsolated({ type: "math", source: SOURCE, format: "png" }, { ...NONE, assetsUrl: ASSETS });
    expect(result.mime).toBe("image/png");
    expect(result.backend).toBe("math/mathjax+raster/resvg");
    expect([...result.bytes.slice(0, 8)]).toEqual(PNG_SIGNATURE);
    expect(countDarkPixels(decodePng(result.bytes))).toBeGreaterThan(0);
  });

  for (const source of ["a<b", "a\\&b", "\\ce{A <=> B}", "\\ce{A <-> B}"]) {
    test(`renders ${source} to a PNG: the svg is well-formed xml for resvg`, async () => {
      const result = await renderIsolated({ type: "math", source, format: "png" }, { ...NONE, assetsUrl: ASSETS });
      expect([...result.bytes.slice(0, 8)]).toEqual(PNG_SIGNATURE);
      expect(countDarkPixels(decodePng(result.bytes))).toBeGreaterThan(0);
    });
  }

  test("the backend rejects an option other than scale", async () => {
    const err = await rejectionOf(renderPng(job("png", { width: 10 })));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toBe("math to png takes no option width");
  });

  test("the backend rejects a scale that is not a positive number", async () => {
    const err = await rejectionOf(renderPng(job("png", { scale: 0 })));
    expect(err.code).toBe("E_INPUT");
  });
});

describe("math to pdf through the registry", () => {
  test("the backend rejects an option, because the pdf output takes none", async () => {
    const err = await rejectionOf(renderPdf(job("pdf", { scale: 2 })));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toBe("math to pdf takes no options; got scale");
  });

  test.skipIf(!haveBrowser)("renders a pdf with the pdf signature", async () => {
    const result = await renderIsolated({ type: "math", source: SOURCE, format: "pdf" }, { allowNetwork: "none", browser: BROWSER });
    expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe("%PDF-");
  }, 60000);
});

describe("input errors of the math stage", () => {
  test("an undefined macro rejects with E_INPUT", async () => {
    const err = await rejectionOf(renderIsolated({ type: "math", source: "\\notamacro{x}", format: "svg" }, NONE));
    expect(err.code).toBe("E_INPUT");
  });

  test("a package that the build does not hold rejects with E_UNSUPPORTED", async () => {
    const err = await rejectionOf(renderIsolated({ type: "math", source: "\\require{physics} x", format: "svg" }, NONE));
    expect(err.code).toBe("E_UNSUPPORTED");
  });
});

describe("the ./math subpath", () => {
  test("exports mathToSvg from the math module", async () => {
    const svg = await mathToSvg("x^2", { display: false });
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
