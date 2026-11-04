import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { capabilitiesWithRegistry } from "../../src/core.ts";
import { DEFAULT_REGISTRY } from "../../src/registry.ts";
import { ISOLATED_CONFIG_DEPS } from "../support/test-registry.ts";

describe("the default registry of the math stage", () => {
  test("holds math to svg, png and pdf, and each module file exists", () => {
    for (const key of ["math:svg", "math:png", "math:pdf"]) {
      const entry = DEFAULT_REGISTRY[key];
      expect(entry).toBeDefined();
      expect(existsSync(fileURLToPath(entry!.moduleUrl))).toBe(true);
    }
  });

  test("names the backend of each format", () => {
    expect(DEFAULT_REGISTRY["math:svg"]!.backend).toBe("math/mathjax");
    expect(DEFAULT_REGISTRY["math:png"]!.backend).toBe("math/mathjax+raster/resvg");
    expect(DEFAULT_REGISTRY["math:pdf"]!.backend).toBe("math/mathjax+browser/chromium");
  });

  test("capabilities reports math to svg and png as ready, and math to pdf as needing the browser", async () => {
    const caps = await capabilitiesWithRegistry({}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
    const svg = caps.find((c) => c.type === "math" && c.format === "svg");
    const png = caps.find((c) => c.type === "math" && c.format === "png");
    const pdf = caps.find((c) => c.type === "math" && c.format === "pdf");
    expect(svg?.ready).toBe(true);
    expect(svg?.stage).toBe("math");
    expect(png?.ready).toBe(true);
    expect(pdf?.stage).toBe("browser");
    expect(pdf?.ready).toBe(false);
  });
});
