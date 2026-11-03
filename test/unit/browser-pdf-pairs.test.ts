import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { capabilitiesWithRegistry } from "../../src/core.ts";
import { PAIRS } from "../../src/pairs.ts";
import { DEFAULT_REGISTRY } from "../../src/registry.ts";
import { ISOLATED_CONFIG_DEPS } from "../support/test-registry.ts";

test("every pdf pair names the browser stage, because pdf needs the browser", () => {
  const pdfPairs = PAIRS.filter((p) => p.format === "pdf");
  expect(pdfPairs.length).toBeGreaterThan(0);
  for (const pair of pdfPairs) expect({ type: pair.type, stage: pair.stage }).toEqual({ type: pair.type, stage: "browser" });
});

test("dot to pdf and mermaid to pdf are built in, and their module files exist", () => {
  for (const key of ["dot:pdf", "mermaid:pdf"]) {
    const entry = DEFAULT_REGISTRY[key];
    expect(entry).toBeDefined();
    expect(existsSync(fileURLToPath(entry!.moduleUrl))).toBe(true);
  }
  expect(DEFAULT_REGISTRY["dot:pdf"]!.backend).toBe("graph/viz+browser/chromium");
  expect(DEFAULT_REGISTRY["mermaid:pdf"]!.backend).toBe("mermaid/browser/chromium");
});

test("every pdf pair that has a backend is reported not ready without a browser path", async () => {
  const caps = await capabilitiesWithRegistry({}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
  for (const type of ["dot", "mermaid", "html"] as const) {
    const cap = caps.find((c) => c.type === type && c.format === "pdf");
    expect(cap?.stage).toBe("browser");
    expect(cap?.ready).toBe(false);
    expect(cap?.reason).toContain("SCIENG_BROWSER");
  }
});
