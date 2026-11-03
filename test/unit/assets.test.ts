import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { assetFile, BUNDLED_FONT_FILE, bundledFontPathIn, checkAssetsUrl, readAsset, RESVG_WASM_FILE } from "../../src/assets.ts";
import { DEFAULT_ASSETS_URL } from "../../src/config.ts";
import { RenderError } from "../../src/errors.ts";
import { makeAssetsFolder, makeScratch, removeScratch } from "../support/assets-fixture.ts";

const scratch = makeScratch("scieng-assets-");
afterAll(() => removeScratch(scratch));

function errorOf(call: () => unknown): RenderError {
  try {
    call();
  } catch (err) {
    if (err instanceof RenderError) return err;
    throw err;
  }
  throw new Error("expected a RenderError, but the call returned");
}

describe("checkAssetsUrl", () => {
  test("keeps a folder URL that already ends with a slash", () => {
    expect(checkAssetsUrl("file:///srv/assets/", "assetsUrl")).toBe("file:///srv/assets/");
  });

  test("adds the trailing slash that a folder URL needs", () => {
    expect(checkAssetsUrl("file:///srv/assets", "assetsUrl")).toBe("file:///srv/assets/");
  });

  test("rejects a URL that is not a file URL, and names the label", () => {
    const err = errorOf(() => checkAssetsUrl("https://example.test/assets/", "call option: assetsUrl"));
    expect(err.code).toBe("E_CONFIG");
    expect(err.message).toContain("call option: assetsUrl");
    expect(err.message).toContain("must be a file: URL");
  });

  test("rejects text that is not a URL, and names the label", () => {
    for (const value of ["", "not a url", "C:\\srv\\assets\\"]) {
      const err = errorOf(() => checkAssetsUrl(value, "assetsUrl"));
      expect(err.code).toBe("E_CONFIG");
      expect(err.message).toContain("assetsUrl");
    }
  });

  test("rejects a value that is not a string, and says so", () => {
    const err = errorOf(() => checkAssetsUrl(5, "assetsUrl"));
    expect(err.code).toBe("E_CONFIG");
    expect(err.message).toContain("must be a string");
    expect(err.message).toContain("assetsUrl");
  });

  test("rejects a query or a fragment in the folder URL, and says so", () => {
    for (const value of ["file:///srv/assets?revision=1", "file:///srv/assets#part", "file:///srv/assets?"]) {
      const err = errorOf(() => checkAssetsUrl(value, "assetsUrl"));
      expect(err.code).toBe("E_CONFIG");
      expect(err.message).toContain("no query and no fragment");
      expect(err.message).toContain("assetsUrl");
    }
  });

  test("rejects an encoded slash or an encoded backslash in the path, and says so", () => {
    for (const value of ["file:///srv/assets%2Fprivate/", "file:///srv/assets%5Cprivate/", "file:///srv/ASSETS%2fprivate/"]) {
      const err = errorOf(() => checkAssetsUrl(value, "assetsUrl"));
      expect(err.code).toBe("E_CONFIG");
      expect(err.message).toContain("encoded slash or backslash");
    }
  });
});

describe("readAsset", () => {
  test("returns the exact bytes of the file under the folder", () => {
    const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 250]);
    const url = makeAssetsFolder(scratch, "exact", { wasm: bytes });
    expect(Array.from(readAsset(url, RESVG_WASM_FILE))).toEqual(Array.from(bytes));
  });

  test("a missing file rejects with E_STAGE_MISSING and names the path", () => {
    const url = makeAssetsFolder(scratch, "empty", {});
    const err = errorOf(() => readAsset(url, RESVG_WASM_FILE));
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(err.message).toContain(RESVG_WASM_FILE);
    expect(err.message).toContain("ENOENT");
  });
});

describe("assetFile", () => {
  test("names the file path under the folder", () => {
    const url = makeAssetsFolder(scratch, "named", {});
    expect(assetFile(url, BUNDLED_FONT_FILE)).toBe(join(scratch, "named", "fonts", "LiberationSerif-Regular.ttf"));
  });

  test("a folder URL without a slash still resolves the file inside the folder", () => {
    expect(assetFile(pathToFileURL(scratch).href, RESVG_WASM_FILE)).toBe(join(scratch, RESVG_WASM_FILE));
  });

  test("rejects a folder URL that is not a file URL with E_CONFIG", () => {
    expect(errorOf(() => assetFile("https://example.test/assets/", BUNDLED_FONT_FILE)).code).toBe("E_CONFIG");
  });

  test("a folder URL that this system cannot open as a folder rejects with E_CONFIG", () => {
    // A POSIX path is not absolute on Windows. A host name is not allowed on POSIX.
    const value = process.platform === "win32" ? "file:///srv/assets/" : "file://server/assets/";
    const err = errorOf(() => assetFile(value, RESVG_WASM_FILE));
    expect(err.code).toBe("E_CONFIG");
    expect(err.message).toContain("assetsUrl");
  });
});

describe("bundledFontPathIn", () => {
  test("names the font file under the folder", () => {
    const url = makeAssetsFolder(scratch, "font-named", {});
    expect(bundledFontPathIn(url)).toBe(join(scratch, "font-named", "fonts", "LiberationSerif-Regular.ttf"));
  });
});

describe("the default assets folder", () => {
  test("holds the bundled font under DEFAULT_ASSETS_URL", () => {
    expect(existsSync(bundledFontPathIn(DEFAULT_ASSETS_URL))).toBe(true);
  });
});
