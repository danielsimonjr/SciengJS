import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { THREE_CDN_BASE, THREE_MODULES, THREE_VERSION } from "../../src/browser/pinned.ts";

const ROOT = join(import.meta.dir, "..", "..");

test("the pinned Three.js version is the exact devDependency of the repository", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { devDependencies: Record<string, string> };
  expect(pkg.devDependencies.three).toBe(THREE_VERSION);
});

test("the pinned Three.js URLs name the pinned version and the files of the package", () => {
  expect(THREE_CDN_BASE).toBe(`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/`);
  const urls = THREE_MODULES.map((m) => m.url);
  expect(urls).toEqual([
    `${THREE_CDN_BASE}build/three.module.js`,
    `${THREE_CDN_BASE}build/three.core.js`,
    `${THREE_CDN_BASE}examples/jsm/controls/OrbitControls.js`,
    `${THREE_CDN_BASE}examples/jsm/loaders/GLTFLoader.js`,
    `${THREE_CDN_BASE}examples/jsm/utils/BufferGeometryUtils.js`,
    `${THREE_CDN_BASE}examples/jsm/utils/SkeletonUtils.js`,
  ]);
  for (const m of THREE_MODULES) expect(m.mime).toBe("text/javascript");
});

test("each pinned Three.js SHA-256 equals the hash of the file in the installed package", () => {
  for (const m of THREE_MODULES) {
    const file = join(ROOT, "node_modules", "three", m.path);
    const hash = createHash("sha256").update(readFileSync(file));
    expect(hash.copy().digest("hex")).toBe(m.sha256);
    expect(m.sri).toBe(`sha256-${hash.digest("base64")}`);
  }
}, 30000);

test("each shipped file name is unique and has no path part", () => {
  const names = THREE_MODULES.map((m) => m.file);
  expect(new Set(names).size).toBe(names.length);
  for (const name of names) expect(name).toMatch(/^three\.[A-Za-z]+\.js$/);
});

test("the Three.js licence ships in assets/licenses and the notices name it", () => {
  const text = readFileSync(join(ROOT, "assets", "licenses", "MIT-three.txt"), "utf8");
  expect(text).toContain("The MIT License");
  expect(existsSync(join(ROOT, "assets", "licenses", "MIT-three.txt"))).toBe(true);
  const notices = readFileSync(join(ROOT, "THIRD_PARTY_NOTICES.md"), "utf8");
  expect(notices).toContain("## Three.js");
  expect(notices).toContain("assets/licenses/MIT-three.txt");
  expect(notices).toContain(THREE_VERSION);
});

test("the build copies every pinned Three.js file into assets and git ignores the copies", () => {
  const script = readFileSync(join(ROOT, "scripts", "prepare-build.mjs"), "utf8");
  for (const m of THREE_MODULES) {
    expect(script).toContain(m.path);
  }
  const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
  for (const m of THREE_MODULES) expect(ignore).toContain(`assets/${m.file}`);
});
