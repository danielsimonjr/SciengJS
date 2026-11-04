import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { capabilitiesWithRegistry, renderWithRegistry } from "../../src/core.ts";
import { DEFAULT_REGISTRY } from "../../src/registry.ts";
import { ISOLATED_CONFIG_DEPS } from "../support/test-registry.ts";
import { makeAssetsFolder, realFiles } from "../support/assets-fixture.ts";

// The PNG test reads the WASM from a scratch assets folder, as CI has no built assets/index_bg.wasm.
const scratch = mkdtempSync(join(tmpdir(), "scieng-i7-plot-"));
const ASSETS = makeAssetsFolder(scratch, "assets", realFiles());
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const FIGURE = JSON.stringify({ data: [{ type: "scatter", mode: "lines", x: [0, 1], y: [0, 1] }], layout: {} });

describe("the default registry of the plot stage", () => {
  test("holds plot to svg and plot to png, and each module file exists", () => {
    for (const key of ["plot:svg", "plot:png"]) {
      const entry = DEFAULT_REGISTRY[key];
      expect(entry).toBeDefined();
      expect(existsSync(fileURLToPath(entry!.moduleUrl))).toBe(true);
    }
    expect(DEFAULT_REGISTRY["plot:svg"]!.backend).toBe("plot/svg");
    expect(DEFAULT_REGISTRY["plot:png"]!.backend).toBe("plot/svg+raster/resvg");
  });

  test("capabilities reports plot to svg and png as ready on the plot stage", async () => {
    const caps = await capabilitiesWithRegistry({}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
    for (const format of ["svg", "png"]) {
      const cap = caps.find((c) => c.type === "plot" && c.format === format);
      expect(cap?.ready).toBe(true);
      expect(cap?.stage).toBe("plot");
    }
  });

  test("render returns the standalone svg of a figure", async () => {
    const result = await renderWithRegistry({ type: "plot", source: FIGURE, format: "svg" }, {}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
    expect(result.mime).toBe("image/svg+xml");
    expect(result.backend).toBe("plot/svg");
    expect(new TextDecoder().decode(result.bytes).startsWith("<svg")).toBe(true);
  });

  test("render returns a png of a figure with the scale option", async () => {
    const result = await renderWithRegistry(
      { type: "plot", source: FIGURE, format: "png", options: { scale: 1 } },
      { assetsUrl: ASSETS },
      DEFAULT_REGISTRY,
      ISOLATED_CONFIG_DEPS,
    );
    expect(result.mime).toBe("image/png");
    expect(result.bytes[0]).toBe(0x89);
  });

  test("plot to svg rejects an option that it does not take", async () => {
    await expect(
      renderWithRegistry({ type: "plot", source: FIGURE, format: "svg", options: { scale: 2 } }, {}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS),
    ).rejects.toMatchObject({ code: "E_INPUT" });
  });
});
