import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ENGINE_VERSION } from "../../src/version.ts";

describe("the baked engine version", () => {
  test("equals the version of package.json, so a stale baked value fails the suite", () => {
    const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")) as {
      version: string;
    };
    expect(ENGINE_VERSION).toBe(manifest.version);
  });
});
