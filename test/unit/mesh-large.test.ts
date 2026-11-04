import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../src/config.ts";
import { renderWithRegistry } from "../../src/core.ts";
import { DEFAULT_REGISTRY } from "../../src/registry.ts";
import { ISOLATED_CONFIG_DEPS } from "../support/test-registry.ts";
import { readGlb } from "../support/glb-reader.ts";

// The large STEP sample is not in git. CI downloads it from the URL in large.json and checks its SHA-256.
// Without the file, the test skips on a local run and fails in CI.
const MANIFEST = JSON.parse(readFileSync(fileURLToPath(new URL("../corpus/mesh/large.json", import.meta.url)), "utf8")) as {
  file: string;
  sha256: string;
  bytes: number;
  triangles: number;
};
const FILE = fileURLToPath(new URL(`../../${MANIFEST.file}`, import.meta.url));
const present = existsSync(FILE);
const inCi = process.env.CI === "true";

describe("the large STEP sample", () => {
  test("is present in CI", () => {
    if (!present && !inCi) {
      console.log(`skip: ${MANIFEST.file} is missing. Download it with the URL in test/corpus/mesh/large.json.`);
      return;
    }
    expect(present).toBe(true);
  });

  (present ? test : test.skip)(
    "renders to a valid glb inside the default timeout",
    async () => {
      const source = new Uint8Array(readFileSync(FILE));
      expect(source.length).toBe(MANIFEST.bytes);
      expect(createHash("sha256").update(source).digest("hex")).toBe(MANIFEST.sha256);

      const { timeoutMs } = await loadConfig({}, ISOLATED_CONFIG_DEPS);
      const start = performance.now();
      const result = await renderWithRegistry({ type: "step", source, format: "glb" }, {}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
      const ms = performance.now() - start;
      console.log(`large STEP to glb: ${ms.toFixed(0)} ms (default timeout ${timeoutMs} ms)`);

      expect(ms).toBeLessThan(timeoutMs);
      const glb = readGlb(result.bytes);
      const triangles = glb.primitives.reduce((sum, p) => sum + p.indices.length / 3, 0);
      expect(triangles).toBe(MANIFEST.triangles);
    },
    // The engine stops the render at the default timeout. The test waits a little longer, so that the engine error shows.
    120000,
  );
});
