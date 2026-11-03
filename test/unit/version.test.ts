import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
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

describe("the line endings of the generated version file", () => {
  test("git stores and checks out src/version.ts with LF, so a CRLF checkout does not show it as modified", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const run = spawnSync("git", ["check-attr", "eol", "text", "--", "src/version.ts"], { cwd: root, encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("src/version.ts: eol: lf\nsrc/version.ts: text: set\n");
  });
});
