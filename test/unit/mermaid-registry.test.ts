import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { capabilitiesWithRegistry } from "../../src/core.ts";
import { DEFAULT_REGISTRY } from "../../src/registry.ts";
import { ISOLATED_CONFIG_DEPS } from "../support/test-registry.ts";

describe("the default registry of the mermaid native layouts", () => {
  test("holds mermaid to svg and mermaid to png, and each module file exists", () => {
    for (const key of ["mermaid:svg", "mermaid:png"]) {
      const entry = DEFAULT_REGISTRY[key];
      expect(entry).toBeDefined();
      expect(existsSync(fileURLToPath(entry!.moduleUrl))).toBe(true);
    }
    expect(DEFAULT_REGISTRY["mermaid:svg"]!.backend).toBe("mermaid/native");
    expect(DEFAULT_REGISTRY["mermaid:png"]!.backend).toBe("mermaid/native+raster/resvg");
  });

  test("mermaid to svg and to png list the graph stage and are ready without a browser path", async () => {
    const caps = await capabilitiesWithRegistry({}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
    for (const format of ["svg", "png"] as const) {
      const cap = caps.find((c) => c.type === "mermaid" && c.format === format);
      expect(cap?.stage).toBe("graph");
      expect(cap?.ready).toBe(true);
    }
  });

  test("mermaid to pdf stays on the browser stage and is not ready", async () => {
    const caps = await capabilitiesWithRegistry({}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
    const pdf = caps.find((c) => c.type === "mermaid" && c.format === "pdf");
    expect(pdf?.stage).toBe("browser");
    expect(pdf?.ready).toBe(false);
  });
});
