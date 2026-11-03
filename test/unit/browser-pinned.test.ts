import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MERMAID_CDN_URL, MERMAID_FILE, MERMAID_VERSION, PINNED_ASSETS } from "../../src/browser/pinned.ts";

const ROOT = join(import.meta.dir, "..", "..");

test("the pinned Mermaid version is the exact devDependency of the repository", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { devDependencies: Record<string, string> };
  expect(pkg.devDependencies.mermaid).toBe(MERMAID_VERSION);
});

test("the pinned Mermaid URL names the pinned version and the file that the build copies", () => {
  expect(MERMAID_CDN_URL).toBe(`https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`);
  expect(MERMAID_FILE).toBe("mermaid.min.js");
  const entry = PINNED_ASSETS.find((a) => a.url === MERMAID_CDN_URL);
  expect(entry).toEqual({ url: MERMAID_CDN_URL, file: MERMAID_FILE, mime: "application/javascript" });
});

test("the Mermaid licence ships in assets/licenses and the notices name it", () => {
  const text = readFileSync(join(ROOT, "assets", "licenses", "MIT-mermaid.txt"), "utf8");
  expect(text).toContain("The MIT License (MIT)");
  expect(text).toContain("Knut Sveidqvist");
  const notices = readFileSync(join(ROOT, "THIRD_PARTY_NOTICES.md"), "utf8");
  expect(notices).toContain("assets/licenses/MIT-mermaid.txt");
  expect(existsSync(join(ROOT, "assets", "licenses", "MIT-mermaid.txt"))).toBe(true);
});

test("the build copies the pinned Mermaid file into assets and git ignores the copy", () => {
  const script = readFileSync(join(ROOT, "scripts", "prepare-build.mjs"), "utf8");
  expect(script).toContain("mermaid/dist/mermaid.min.js");
  expect(script).toContain("mermaid.min.js");
  const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
  expect(ignore).toContain("assets/mermaid.min.js");
});

test("the pinned SHA-256 equals the hash of the Mermaid build that the build copies", async () => {
  const { MERMAID_SHA256 } = await import("../../src/browser/pinned.ts");
  const { createHash } = await import("node:crypto");
  const { createRequire } = await import("node:module");
  const file = createRequire(import.meta.url).resolve("mermaid/dist/mermaid.min.js");
  expect(createHash("sha256").update(readFileSync(file)).digest("hex")).toBe(MERMAID_SHA256);
}, 30000);

test("a pinned Mermaid file with other bytes rejects with E_INTEGRITY before the browser starts", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { pathToFileURL } = await import("node:url");
  const { pinnedMermaid } = await import("../../src/mermaid/browser.ts");
  const folder = mkdtempSync(join(tmpdir(), "sciengjs-pinned-"));
  writeFileSync(join(folder, MERMAID_FILE), "window.mermaid = {};");
  expect(() => pinnedMermaid(pathToFileURL(folder).href + "/")).toThrow(expect.objectContaining({ code: "E_INTEGRITY" }));
});

test("the notices name every runtime dependency of the pinned Mermaid build, and the licence texts ship", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "node_modules", "mermaid", "package.json"), "utf8")) as { dependencies: Record<string, string> };
  const bundle = readFileSync(join(ROOT, "assets", "licenses", "mermaid-bundle.txt"), "utf8");
  for (const name of Object.keys(pkg.dependencies).filter((n) => !n.startsWith("@types/"))) {
    expect(bundle).toContain(`==== ${name}@`);
  }
  expect(bundle).toContain("Apache License");
  expect(bundle).toContain("==== dompurify@");
  const notices = readFileSync(join(ROOT, "THIRD_PARTY_NOTICES.md"), "utf8");
  expect(notices).toContain("assets/licenses/mermaid-bundle.txt");
  expect(notices).toContain("MPL-2.0 OR Apache-2.0");
});
