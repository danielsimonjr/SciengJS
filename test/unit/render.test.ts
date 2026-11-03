import { describe, expect, test } from "bun:test";
import { renderWithRegistry, capabilitiesWithRegistry } from "../../src/core.ts";
import { RenderError } from "../../src/errors.ts";
import type { RenderRequest } from "../../src/types.ts";
import { ISOLATED_CONFIG_DEPS, TEST_REGISTRY, FIXED_SVG } from "../support/test-registry.ts";

const enc = new TextEncoder();

function dotSvg(source: string): RenderRequest {
  return { type: "dot", source, format: "svg" };
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

describe("renderWithRegistry through the worker", () => {
  test("renders the fixed stub SVG and reports the backend", async () => {
    const result = await renderWithRegistry(dotSvg("digraph {}"), {}, TEST_REGISTRY, ISOLATED_CONFIG_DEPS);
    expect(new TextDecoder().decode(result.bytes)).toBe(FIXED_SVG);
    expect(result.mime).toBe("image/svg+xml");
    expect(result.backend).toBe("test/fixed");
    expect(result.warnings).toEqual([]);
  });

  test("a source that loops rejects with E_TIMEOUT inside timeoutMs plus one second", async () => {
    const timeoutMs = 500;
    const start = performance.now();
    const err = await rejectionOf(
      renderWithRegistry(dotSvg("loop"), { timeoutMs }, TEST_REGISTRY, ISOLATED_CONFIG_DEPS),
    );
    const elapsed = performance.now() - start;
    expect(err.code).toBe("E_TIMEOUT");
    expect(elapsed).toBeGreaterThanOrEqual(timeoutMs - 50);
    expect(elapsed).toBeLessThan(timeoutMs + 1000);
  });

  test("the render after a timeout still works", async () => {
    await rejectionOf(renderWithRegistry(dotSvg("loop"), { timeoutMs: 300 }, TEST_REGISTRY, ISOLATED_CONFIG_DEPS));
    const result = await renderWithRegistry(dotSvg("ok"), {}, TEST_REGISTRY, ISOLATED_CONFIG_DEPS);
    expect(new TextDecoder().decode(result.bytes)).toBe(FIXED_SVG);
  });

  test("a worker that exits rejects with E_INTERNAL and the next render still works", async () => {
    const crashing: RenderRequest = { type: "dot", source: "crash", format: "svg" };
    const err = await rejectionOf(renderWithRegistry(crashing, {}, TEST_REGISTRY, ISOLATED_CONFIG_DEPS));
    expect(err.code).toBe("E_INTERNAL");
    const result = await renderWithRegistry(dotSvg("ok"), {}, TEST_REGISTRY, ISOLATED_CONFIG_DEPS);
    expect(result.backend).toBe("test/fixed");
  });

  test("a backend that throws a plain error rejects with E_INTERNAL", async () => {
    const throwing: RenderRequest = { type: "dot", source: "throw", format: "svg" };
    const err = await rejectionOf(renderWithRegistry(throwing, {}, TEST_REGISTRY, ISOLATED_CONFIG_DEPS));
    expect(err.code).toBe("E_INTERNAL");
    expect(err.message).toContain("stub failure");
  });
});

describe("renderWithRegistry validation", () => {
  test("a pair that the design does not list rejects with E_UNSUPPORTED and never falls back", async () => {
    const err = await rejectionOf(
      renderWithRegistry({ type: "dot", source: "digraph {}", format: "md" }, {}, TEST_REGISTRY, ISOLATED_CONFIG_DEPS),
    );
    expect(err.code).toBe("E_UNSUPPORTED");
  });

  test("a listed pair with no registered backend rejects with E_UNSUPPORTED", async () => {
    const err = await rejectionOf(
      renderWithRegistry(dotSvg("digraph {}"), {}, {}, ISOLATED_CONFIG_DEPS),
    );
    expect(err.code).toBe("E_UNSUPPORTED");
    expect(err.message).toContain("dot");
  });

  test("an unknown input type rejects with E_INPUT", async () => {
    const req = { type: "word", source: "x", format: "svg" } as unknown as RenderRequest;
    const err = await rejectionOf(renderWithRegistry(req, {}, TEST_REGISTRY, ISOLATED_CONFIG_DEPS));
    expect(err.code).toBe("E_INPUT");
  });

  test("an unknown output format rejects with E_INPUT", async () => {
    const req = { type: "dot", source: "x", format: "gif" } as unknown as RenderRequest;
    const err = await rejectionOf(renderWithRegistry(req, {}, TEST_REGISTRY, ISOLATED_CONFIG_DEPS));
    expect(err.code).toBe("E_INPUT");
  });

  test("bytes for a text input rejects with E_INPUT", async () => {
    const req: RenderRequest = { type: "dot", source: enc.encode("digraph {}"), format: "svg" };
    const err = await rejectionOf(renderWithRegistry(req, {}, TEST_REGISTRY, ISOLATED_CONFIG_DEPS));
    expect(err.code).toBe("E_INPUT");
  });

  test("text for a binary input rejects with E_INPUT", async () => {
    const req: RenderRequest = { type: "step", source: "ISO-10303-21;", format: "glb" };
    const err = await rejectionOf(renderWithRegistry(req, {}, TEST_REGISTRY, ISOLATED_CONFIG_DEPS));
    expect(err.code).toBe("E_INPUT");
  });

  test("a source over maxSourceBytes rejects with E_LIMIT before any worker starts", async () => {
    const err = await rejectionOf(
      renderWithRegistry(dotSvg("12345678901"), { maxSourceBytes: 10 }, TEST_REGISTRY, ISOLATED_CONFIG_DEPS),
    );
    expect(err.code).toBe("E_LIMIT");
  });

  test("a source of exactly maxSourceBytes renders", async () => {
    const result = await renderWithRegistry(dotSvg("1234567890"), { maxSourceBytes: 10 }, TEST_REGISTRY, ISOLATED_CONFIG_DEPS);
    expect(result.backend).toBe("test/fixed");
  });

  test("a configuration error from the loader rejects with E_CONFIG", async () => {
    const deps = {
      ...ISOLATED_CONFIG_DEPS,
      readFile: async () => {
        const err = new Error("EACCES") as NodeJS.ErrnoException;
        err.code = "EACCES";
        throw err;
      },
    };
    const err = await rejectionOf(renderWithRegistry(dotSvg("x"), {}, TEST_REGISTRY, deps));
    expect(err.code).toBe("E_CONFIG");
  });
});

describe("capabilitiesWithRegistry", () => {
  test("reports a registered pair as ready and a listed pair without a backend as not ready", async () => {
    const caps = await capabilitiesWithRegistry({}, TEST_REGISTRY, ISOLATED_CONFIG_DEPS);
    const dotSvgCap = caps.find((c) => c.type === "dot" && c.format === "svg");
    const dotPdfCap = caps.find((c) => c.type === "dot" && c.format === "pdf");
    expect(dotSvgCap?.ready).toBe(true);
    expect(dotSvgCap?.stage).toBe("graph");
    expect(dotPdfCap?.ready).toBe(false);
    expect(dotPdfCap?.stage).toBe("browser");
  });

  test("a browser-stage pair stays not ready without a browser path", async () => {
    const registry = { "dot:pdf": { backend: "test/fixed", moduleUrl: TEST_REGISTRY["dot:svg"]!.moduleUrl } };
    const caps = await capabilitiesWithRegistry({}, registry, ISOLATED_CONFIG_DEPS);
    expect(caps.find((c) => c.type === "dot" && c.format === "pdf")?.ready).toBe(false);
    const withBrowser = await capabilitiesWithRegistry({ browser: "/opt/chrome" }, registry, ISOLATED_CONFIG_DEPS);
    expect(withBrowser.find((c) => c.type === "dot" && c.format === "pdf")?.ready).toBe(true);
  });
});

describe("renderWithRegistry settings pass-through", () => {
  test("the rasterFont of the configuration reaches the backend", async () => {
    const result = await renderWithRegistry(dotSvg("settings"), { rasterFont: "/f/x.ttf" }, TEST_REGISTRY, ISOLATED_CONFIG_DEPS);
    const settings = JSON.parse(new TextDecoder().decode(result.bytes)) as { rasterFont?: string; maxMemoryMb: number };
    expect(settings.rasterFont).toBe("/f/x.ttf");
    expect(settings.maxMemoryMb).toBe(2048);
  });

  test("SCIENG_RASTER_FONT reaches the backend, and no value reaches it as undefined", async () => {
    const withEnv = await renderWithRegistry(dotSvg("settings"), {}, TEST_REGISTRY, { ...ISOLATED_CONFIG_DEPS, env: { SCIENG_RASTER_FONT: "/f/env.ttf" } });
    expect(JSON.parse(new TextDecoder().decode(withEnv.bytes)).rasterFont).toBe("/f/env.ttf");
    const without = await renderWithRegistry(dotSvg("settings"), {}, TEST_REGISTRY, ISOLATED_CONFIG_DEPS);
    expect(JSON.parse(new TextDecoder().decode(without.bytes)).rasterFont).toBeUndefined();
  });
});
