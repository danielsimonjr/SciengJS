import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { capabilitiesWithRegistry } from "../../src/core.ts";
import { DEFAULT_REGISTRY } from "../../src/registry.ts";
import { ISOLATED_CONFIG_DEPS } from "../support/test-registry.ts";

describe("the default registry of the graph stage", () => {
  test("holds dot to svg and dot to png, and each module file exists", () => {
    for (const key of ["dot:svg", "dot:png"]) {
      const entry = DEFAULT_REGISTRY[key];
      expect(entry).toBeDefined();
      expect(existsSync(fileURLToPath(entry!.moduleUrl))).toBe(true);
    }
    expect(DEFAULT_REGISTRY["dot:svg"]!.backend).toBe("graph/viz");
  });

  test("capabilities reports dot to svg as ready on this machine", async () => {
    const caps = await capabilitiesWithRegistry({}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
    const svg = caps.find((c) => c.type === "dot" && c.format === "svg");
    expect(svg?.ready).toBe(true);
    expect(svg?.stage).toBe("graph");
  });
});
