import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { BUNDLES, bundleUrl, cachePath, findBundle, loadBundleBytes, loadBundles, unpackBundle, type BundleEntry, type BundleSettings } from "../../src/tex/bundles.ts";
import { rejectionOf, rejection } from "../support/rejections.ts";

/** Packs files the way `tools/tex/bundles.mjs` does. The test holds its own copy, so it checks the format as well. */
function pack(files: Record<string, string>): Buffer {
  const names = Object.keys(files).map((n) => Buffer.from(n)).sort(Buffer.compare);
  const parts: Buffer[] = [];
  const u32 = (n: number): Buffer => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  };
  parts.push(u32(names.length));
  for (const nb of names) {
    const data = Buffer.from(files[nb.toString()]!);
    const len = Buffer.alloc(2);
    len.writeUInt16LE(nb.length);
    parts.push(len, nb, u32(data.length), data);
  }
  return Buffer.concat([Buffer.from("SCTB1\0\0\0", "latin1"), deflateRawSync(Buffer.concat(parts), { level: 9 })]);
}

const work = mkdtempSync(path.join(tmpdir(), "scieng-bundles-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const good = pack({ "a.sty": "alpha", "b.tfm": "beta" });
const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
const entry: BundleEntry = { name: "diagrams", file: "test-bundle.sctb", sha256: sha(good), bytes: good.length };

let n = 0;
let serve = "";
let cacheDir = "";
function settings(over: Partial<BundleSettings> = {}): BundleSettings {
  return { cacheDir, texBundleUrl: pathToFileURL(serve).href + "/", allowNetwork: "tex-bundles", timeoutMs: 5000, ...over };
}
beforeEach(() => {
  n += 1;
  serve = path.join(work, `serve${n}`);
  cacheDir = path.join(work, `cache${n}`);
  mkdirSync(serve, { recursive: true });
  writeFileSync(path.join(serve, entry.file), good);
});

function exists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

describe("bundle manager", () => {
  test("a good copy from a file: URL loads and goes to the cache", async () => {
    const bytes = await loadBundleBytes(entry, settings());
    expect(sha(bytes)).toBe(entry.sha256);
    expect(sha(readFileSync(cachePath(entry, settings())))).toBe(entry.sha256);
    expect(readdirSync(path.dirname(cachePath(entry, settings())))).toEqual([entry.file]);
  });

  test("a cached copy loads with the network off", async () => {
    await loadBundleBytes(entry, settings());
    rmSync(serve, { recursive: true });
    const bytes = await loadBundleBytes(entry, settings({ allowNetwork: "none" }));
    expect(sha(bytes)).toBe(entry.sha256);
  });

  test("a tampered copy rejects with E_INTEGRITY and leaves no file in the cache", async () => {
    const bad = Buffer.from(good);
    bad[bad.length - 1] = bad[bad.length - 1]! ^ 0xff;
    writeFileSync(path.join(serve, entry.file), bad);
    const err = await rejectionOf(loadBundleBytes(entry, settings()));
    expect(err.code).toBe("E_INTEGRITY");
    expect(err.message).toContain("diagrams");
    expect(exists(cachePath(entry, settings()))).toBe(false);
    expect(readdirSync(path.dirname(cachePath(entry, settings())))).toEqual([]);
  });

  test("a copy of the wrong size rejects with E_INTEGRITY and leaves no file", async () => {
    writeFileSync(path.join(serve, entry.file), Buffer.concat([good, Buffer.from("x")]));
    const err = await rejectionOf(loadBundleBytes(entry, settings()));
    expect(err.code).toBe("E_INTEGRITY");
    expect(exists(cachePath(entry, settings()))).toBe(false);
  });

  test("a cached copy whose bytes changed is deleted and fetched again", async () => {
    await loadBundleBytes(entry, settings());
    const target = cachePath(entry, settings());
    writeFileSync(target, "changed on disk");
    const bytes = await loadBundleBytes(entry, settings());
    expect(sha(bytes)).toBe(entry.sha256);
    expect(sha(readFileSync(target))).toBe(entry.sha256);
  });

  test("a changed cached copy with the network off is deleted and rejects with E_STAGE_MISSING", async () => {
    await loadBundleBytes(entry, settings());
    const target = cachePath(entry, settings());
    writeFileSync(target, "changed on disk");
    const err = await rejectionOf(loadBundleBytes(entry, settings({ allowNetwork: "none" })));
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(exists(target)).toBe(false);
  });

  test("a bundle that is not cached, with the network off, rejects with E_STAGE_MISSING and names the bundle and the URL", async () => {
    const s = settings({ allowNetwork: "none" });
    const err = await rejectionOf(loadBundleBytes(entry, s));
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(err.message).toContain("diagrams");
    expect(err.message).toContain(bundleUrl(entry, s));
    expect(exists(cachePath(entry, s))).toBe(false);
  });

  test("a missing file at the URL rejects with E_STAGE_MISSING", async () => {
    rmSync(path.join(serve, entry.file));
    const err = await rejectionOf(loadBundleBytes(entry, settings()));
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(err.message).toContain(entry.file);
  });

  test("a base URL with no end slash gets one, and a text that is no URL is E_CONFIG", async () => {
    expect(bundleUrl(entry, { texBundleUrl: "https://example.test/x" })).toBe("https://example.test/x/test-bundle.sctb");
    expect(bundleUrl(entry, { texBundleUrl: "https://example.test/x/" })).toBe("https://example.test/x/test-bundle.sctb");
    const err = await rejectionOf(loadBundleBytes(entry, settings({ texBundleUrl: "not a url" })));
    expect(err.code).toBe("E_CONFIG");
  });

  test("an unsupported protocol rejects with E_STAGE_MISSING", async () => {
    const err = await rejectionOf(loadBundleBytes(entry, settings({ texBundleUrl: "ftp://example.test/" })));
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(err.message).toContain("ftp:");
  });

  test("loadBundles unpacks the files of each named bundle once", async () => {
    const out = await loadBundles(["diagrams", "diagrams"], settings(), [entry]);
    expect([...out.keys()]).toEqual(["diagrams"]);
    const files = out.get("diagrams")!;
    expect(new TextDecoder().decode(files.get("a.sty"))).toBe("alpha");
    expect(new TextDecoder().decode(files.get("b.tfm"))).toBe("beta");
  });

  test("an unknown bundle name is E_INTERNAL", () => {
    expect(rejection(() => findBundle("core", [entry])).code).toBe("E_INTERNAL");
  });
});

describe("SCTB1 container", () => {
  test("unpack reads what pack wrote, in sorted order", () => {
    const files = unpackBundle(pack({ "z.tex": "1", "a.tex": "22", "m.tex": "" }));
    expect([...files.keys()]).toEqual(["a.tex", "m.tex", "z.tex"]);
    expect(files.get("a.tex")!.length).toBe(2);
    expect(files.get("m.tex")!.length).toBe(0);
  });

  test("a wrong magic or a broken body rejects with E_INTEGRITY", () => {
    expect(rejection(() => unpackBundle(new Uint8Array([1, 2, 3]))).code).toBe("E_INTEGRITY");
    const broken = Buffer.concat([Buffer.from("SCTB1\0\0\0", "latin1"), Buffer.from([0xff, 0xff, 0xff])]);
    expect(rejection(() => unpackBundle(broken)).code).toBe("E_INTEGRITY");
  });
});

describe("bundle list of the build", () => {
  test("holds the four bundles with a sha256, a size and a file name", () => {
    expect(BUNDLES.map((b) => b.name)).toEqual(["core", "diagrams", "science", "math"]);
    for (const b of BUNDLES) {
      expect(b.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(b.bytes).toBeGreaterThan(1000);
      expect(b.file).toBe(`scieng-tex-${b.name}.sctb`);
    }
  });
});
