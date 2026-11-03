import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const NOTICES = readFileSync(join(ROOT, "THIRD_PARTY_NOTICES.md"), "utf8");

describe("third-party notices", () => {
  test("the MIT licence of the @viz-js/viz wrapper ships in assets/licenses", () => {
    const text = readFileSync(join(ROOT, "assets", "licenses", "MIT-viz-js.txt"), "utf8");
    expect(text).toContain("Copyright (c) Michael Daines");
    expect(text).toContain("Permission is hereby granted, free of charge");
    expect(NOTICES).toContain("assets/licenses/MIT-viz-js.txt");
  });

  test("each assets/ path that the notices name exists", () => {
    const paths = [...NOTICES.matchAll(/`(assets\/[^`]+)`/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(existsSync(join(ROOT, p))).toBe(true);
  });
});
