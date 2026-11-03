import { describe, expect, test } from "bun:test";
import { loadConfig, type ConfigDeps } from "../../src/config.ts";
import { RenderError } from "../../src/errors.ts";

/** A fake file system: a map of path to text. A path that is not in the map reads as ENOENT. */
function fakeFs(files: Record<string, string>, failures: Record<string, string> = {}) {
  return async (path: string): Promise<string> => {
    if (path in failures) {
      const err = new Error(`${failures[path]}: ${path}`) as NodeJS.ErrnoException;
      err.code = failures[path];
      throw err;
    }
    if (path in files) return files[path] as string;
    const err = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  };
}

function deps(partial: Partial<ConfigDeps>): ConfigDeps {
  return {
    env: {},
    platform: "linux",
    homedir: "/home/u",
    readFile: fakeFs({}),
    engineVersion: "9.8.7",
    ...partial,
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<RenderError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RenderError) return err;
    throw err;
  }
  throw new Error("expected a RenderError, but the promise resolved");
}

describe("loadConfig defaults", () => {
  test("gives the defaults of the design on Linux with no environment and no file", async () => {
    const cfg = await loadConfig({}, deps({}));
    expect(cfg).toEqual({
      cacheDir: "/home/u/.cache/scieng",
      texBundleUrl: "https://github.com/danielsimonjr/sciengjs/releases/download/v9.8.7/",
      timeoutMs: 60000,
      maxSourceBytes: 10485760,
      maxMemoryMb: 2048,
      allowNetwork: "tex-bundles",
      assetsUrl: new URL("../../assets/", import.meta.url).href,
    });
    expect(cfg.browser).toBeUndefined();
  });

  test("follows XDG_CACHE_HOME on Linux", async () => {
    const cfg = await loadConfig({}, deps({ env: { XDG_CACHE_HOME: "/x/cache" } }));
    expect(cfg.cacheDir).toBe("/x/cache/scieng");
  });

  test("uses LOCALAPPDATA for the cache on Windows", async () => {
    const env = { APPDATA: "C:\\R\\Roaming", LOCALAPPDATA: "C:\\R\\Local" };
    const cfg = await loadConfig({}, deps({ env, platform: "win32", homedir: "C:\\R" }));
    expect(cfg.cacheDir).toBe("C:\\R\\Local\\scieng");
  });

  test("uses the Library folders on macOS", async () => {
    const cfg = await loadConfig({}, deps({ platform: "darwin", homedir: "/Users/u" }));
    expect(cfg.cacheDir).toBe("/Users/u/Library/Caches/scieng");
  });

  test("reads the default config path from the platform config folder", async () => {
    const seen: string[] = [];
    const readFile = async (path: string): Promise<string> => {
      seen.push(path);
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    };
    await loadConfig({}, deps({ readFile, platform: "darwin", homedir: "/Users/u" }));
    expect(seen).toEqual(["/Users/u/Library/Application Support/scieng/config.json"]);
  });

  test("a missing config file at the default path is not an error", async () => {
    const cfg = await loadConfig({}, deps({ readFile: fakeFs({}) }));
    expect(cfg.timeoutMs).toBe(60000);
  });
});

describe("loadConfig precedence: call option > environment > file > default", () => {
  test("the file overrides the default and the environment overrides the file", async () => {
    const file = JSON.stringify({ timeoutMs: 1000, maxMemoryMb: 512 });
    const readFile = fakeFs({ "/home/u/.config/scieng/config.json": file });
    const cfg = await loadConfig({}, deps({ readFile, env: { SCIENG_TIMEOUT_MS: "2000" } }));
    expect(cfg.timeoutMs).toBe(2000);
    expect(cfg.maxMemoryMb).toBe(512);
  });

  test("a call option overrides the environment and the file", async () => {
    const readFile = fakeFs({
      "/home/u/.config/scieng/config.json": JSON.stringify({ timeoutMs: 1000 }),
    });
    const cfg = await loadConfig({ timeoutMs: 3000 }, deps({ readFile, env: { SCIENG_TIMEOUT_MS: "2000" } }));
    expect(cfg.timeoutMs).toBe(3000);
  });

  test("reads every environment variable of the design", async () => {
    const env = {
      SCIENG_BROWSER: "/opt/chrome",
      SCIENG_CACHE_DIR: "/c",
      SCIENG_TEX_BUNDLE_URL: "https://example.test/tex/",
      SCIENG_TIMEOUT_MS: "5",
      SCIENG_MAX_SOURCE_BYTES: "6",
      SCIENG_MAX_MEMORY_MB: "7",
      SCIENG_ALLOW_NETWORK: "tex-bundles,images",
      SCIENG_ASSETS_URL: "file:///srv/assets/",
    };
    const cfg = await loadConfig({}, deps({ env }));
    expect(cfg).toEqual({
      browser: "/opt/chrome",
      cacheDir: "/c",
      texBundleUrl: "https://example.test/tex/",
      timeoutMs: 5,
      maxSourceBytes: 6,
      maxMemoryMb: 7,
      allowNetwork: "tex-bundles,images",
      assetsUrl: "file:///srv/assets/",
    });
  });

  test("an empty environment variable counts as unset", async () => {
    const cfg = await loadConfig({}, deps({ env: { SCIENG_TIMEOUT_MS: "" } }));
    expect(cfg.timeoutMs).toBe(60000);
  });

  test("an empty SCIENG_CONFIG counts as unset and reads the default path", async () => {
    const cfg = await loadConfig({}, deps({ env: { SCIENG_CONFIG: "" } }));
    expect(cfg.timeoutMs).toBe(60000);
  });

  test("SCIENG_CONFIG selects the file that the loader reads", async () => {
    const readFile = fakeFs({ "/custom/cfg.json": JSON.stringify({ maxMemoryMb: 64 }) });
    const cfg = await loadConfig({}, deps({ readFile, env: { SCIENG_CONFIG: "/custom/cfg.json" } }));
    expect(cfg.maxMemoryMb).toBe(64);
  });
});

describe("loadConfig rasterFont", () => {
  const FILE = "/home/u/.config/scieng/config.json";

  test("the key has no default", async () => {
    const cfg = await loadConfig({}, deps({}));
    expect(cfg.rasterFont).toBeUndefined();
    expect("rasterFont" in cfg).toBe(false);
  });

  test("SCIENG_RASTER_FONT sets the key", async () => {
    const cfg = await loadConfig({}, deps({ env: { SCIENG_RASTER_FONT: "/f/env.ttf" } }));
    expect(cfg.rasterFont).toBe("/f/env.ttf");
  });

  test("the file key sets the key", async () => {
    const readFile = fakeFs({ [FILE]: JSON.stringify({ rasterFont: "/f/file.ttf" }) });
    const cfg = await loadConfig({}, deps({ readFile }));
    expect(cfg.rasterFont).toBe("/f/file.ttf");
  });

  test("the call option beats the environment, and the environment beats the file", async () => {
    const readFile = fakeFs({ [FILE]: JSON.stringify({ rasterFont: "/f/file.ttf" }) });
    const env = { SCIENG_RASTER_FONT: "/f/env.ttf" };
    expect((await loadConfig({}, deps({ readFile, env }))).rasterFont).toBe("/f/env.ttf");
    expect((await loadConfig({ rasterFont: "/f/opt.ttf" }, deps({ readFile, env }))).rasterFont).toBe("/f/opt.ttf");
  });

  test("an empty or non-string value in the file rejects with E_CONFIG and names the key", async () => {
    for (const value of ["", 5, null, ["a"]]) {
      const readFile = fakeFs({ [FILE]: JSON.stringify({ rasterFont: value }) });
      const err = await rejectionOf(loadConfig({}, deps({ readFile })));
      expect(err.code).toBe("E_CONFIG");
      expect(err.message).toContain("rasterFont");
    }
  });

  test("an empty call option value rejects with E_CONFIG", async () => {
    const err = await rejectionOf(loadConfig({ rasterFont: "" }, deps({})));
    expect(err.code).toBe("E_CONFIG");
  });

  test("an empty SCIENG_RASTER_FONT counts as unset", async () => {
    const cfg = await loadConfig({}, deps({ env: { SCIENG_RASTER_FONT: "" } }));
    expect(cfg.rasterFont).toBeUndefined();
  });
});

describe("loadConfig failures", () => {
  test("an unreadable config file rejects with E_CONFIG and never falls back to defaults", async () => {
    const readFile = fakeFs({}, { "/home/u/.config/scieng/config.json": "EACCES" });
    const err = await rejectionOf(loadConfig({}, deps({ readFile })));
    expect(err.code).toBe("E_CONFIG");
    expect(err.message).toContain("/home/u/.config/scieng/config.json");
  });

  test("a config path that is a folder rejects with E_CONFIG", async () => {
    const readFile = fakeFs({}, { "/custom/dir": "EISDIR" });
    const err = await rejectionOf(loadConfig({}, deps({ readFile, env: { SCIENG_CONFIG: "/custom/dir" } })));
    expect(err.code).toBe("E_CONFIG");
  });

  test("an explicit SCIENG_CONFIG path that does not exist rejects with E_CONFIG", async () => {
    const err = await rejectionOf(loadConfig({}, deps({ env: { SCIENG_CONFIG: "/nowhere/cfg.json" } })));
    expect(err.code).toBe("E_CONFIG");
    expect(err.message).toContain("/nowhere/cfg.json");
  });

  test("a file that is not JSON rejects with E_CONFIG", async () => {
    const readFile = fakeFs({ "/home/u/.config/scieng/config.json": "{ timeoutMs: " });
    const err = await rejectionOf(loadConfig({}, deps({ readFile })));
    expect(err.code).toBe("E_CONFIG");
  });

  test("an unknown key in the file rejects with E_CONFIG", async () => {
    const readFile = fakeFs({ "/home/u/.config/scieng/config.json": JSON.stringify({ timeout: 5 }) });
    const err = await rejectionOf(loadConfig({}, deps({ readFile })));
    expect(err.code).toBe("E_CONFIG");
    expect(err.message).toContain("timeout");
  });

  test("a non-number in a numeric environment variable rejects with E_CONFIG", async () => {
    const err = await rejectionOf(loadConfig({}, deps({ env: { SCIENG_TIMEOUT_MS: "soon" } })));
    expect(err.code).toBe("E_CONFIG");
    expect(err.message).toContain("SCIENG_TIMEOUT_MS");
  });

  test("a zero limit rejects with E_CONFIG", async () => {
    const err = await rejectionOf(loadConfig({ maxSourceBytes: 0 }, deps({})));
    expect(err.code).toBe("E_CONFIG");
  });

  test("an allowNetwork value outside the design rejects with E_CONFIG", async () => {
    const err = await rejectionOf(loadConfig({}, deps({ env: { SCIENG_ALLOW_NETWORK: "everything" } })));
    expect(err.code).toBe("E_CONFIG");
  });

  test("allowNetwork none is accepted", async () => {
    const cfg = await loadConfig({}, deps({ env: { SCIENG_ALLOW_NETWORK: "none" } }));
    expect(cfg.allowNetwork).toBe("none");
  });
});

describe("platform defaults are resolved only when needed", () => {
  test("Windows without LOCALAPPDATA loads when cacheDir is set", async () => {
    const env = { APPDATA: "C:\\R\\Roaming", SCIENG_CACHE_DIR: "D:\\cache" };
    const cfg = await loadConfig({}, deps({ env, platform: "win32", homedir: "C:\\R" }));
    expect(cfg.cacheDir).toBe("D:\\cache");
  });

  test("Windows without LOCALAPPDATA fails when the cache default is needed", async () => {
    const env = { APPDATA: "C:\\R\\Roaming" };
    const err = await rejectionOf(loadConfig({}, deps({ env, platform: "win32", homedir: "C:\\R" })));
    expect(err.code).toBe("E_CONFIG");
    expect(err.message).toContain("LOCALAPPDATA");
  });
});
