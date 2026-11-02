import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoBunGlobal, makePlantedTree, removeTree, scanForBunGlobal } from "../support/bun-scan.ts";

const SRC = fileURLToPath(new URL("../../src", import.meta.url));

describe("no Bun global in src/", () => {
  test("src/ holds no Bun global, comments included", () => {
    expect(scanForBunGlobal(SRC)).toEqual([]);
    expect(() => assertNoBunGlobal(SRC)).not.toThrow();
  });

  test("a planted hit fails the check", () => {
    const root = makePlantedTree({
      "src/clean.ts": "export const ok = 1;\n",
      "src/deep/planted.ts": "export const f = () => Bun.file('x');\n// Bun.sleep in a comment\n",
    });
    try {
      const hits = scanForBunGlobal(join(root, "src"));
      expect(hits.map((h) => `${h.file}:${h.line}`)).toEqual([
        join("deep", "planted.ts") + ":1",
        join("deep", "planted.ts") + ":2",
      ]);
      expect(() => assertNoBunGlobal(join(root, "src"))).toThrow("the Bun global is not allowed");
    } finally {
      removeTree(root);
    }
  });

  test("a name that only ends in Bun does not count as the global", () => {
    const root = makePlantedTree({ "src/names.ts": "const MyBun.x = 1;\nconst notBun = 2;\n" });
    try {
      expect(scanForBunGlobal(join(root, "src"))).toEqual([]);
    } finally {
      removeTree(root);
    }
  });
});
