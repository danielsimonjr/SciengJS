import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadConfig, type ConfigDeps } from "../../src/config.ts";
import { RenderError } from "../../src/errors.ts";
import { ENGINE_VERSION } from "../../src/version.ts";

/** A fake file system: a map of path to text. A path that is not in the map reads as ENOENT. */
function fakeFs(files: Record<string, string>) {
  return async (path: string): Promise<string> => {
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

const FILE = "/home/u/.config/scieng/config.json";

describe("loadConfig assetsUrl", () => {
  test("the file key sets the folder; the environment and then the call option override it", async () => {
    const readFile = fakeFs({ [FILE]: JSON.stringify({ assetsUrl: "file:///f/assets/" }) });
    expect((await loadConfig({}, deps({ readFile }))).assetsUrl).toBe("file:///f/assets/");
    const env = { SCIENG_ASSETS_URL: "file:///e/assets/" };
    expect((await loadConfig({}, deps({ readFile, env }))).assetsUrl).toBe("file:///e/assets/");
    const option = { assetsUrl: "file:///o/assets/" };
    expect((await loadConfig(option, deps({ readFile, env }))).assetsUrl).toBe("file:///o/assets/");
  });

  test("a value without a trailing slash gets one", async () => {
    const cfg = await loadConfig({}, deps({ env: { SCIENG_ASSETS_URL: "file:///srv/assets" } }));
    expect(cfg.assetsUrl).toBe("file:///srv/assets/");
  });

  test("a value that is not a file folder URL rejects with E_CONFIG and names the key", async () => {
    const err = await rejectionOf(loadConfig({}, deps({ env: { SCIENG_ASSETS_URL: "https://example.test/assets/" } })));
    expect(err.code).toBe("E_CONFIG");
    expect(err.message).toContain("assetsUrl");
  });

  test("text that is not a URL rejects with E_CONFIG in each source", async () => {
    const fromEnv = await rejectionOf(loadConfig({}, deps({ env: { SCIENG_ASSETS_URL: "not a url" } })));
    expect(fromEnv.code).toBe("E_CONFIG");
    const fromOption = await rejectionOf(loadConfig({ assetsUrl: "relative/assets/" }, deps({})));
    expect(fromOption.code).toBe("E_CONFIG");
    const readFile = fakeFs({ [FILE]: JSON.stringify({ assetsUrl: 5 }) });
    const fromFile = await rejectionOf(loadConfig({}, deps({ readFile })));
    expect(fromFile.code).toBe("E_CONFIG");
  });
});

describe("the loader reads no package file at run time", () => {
  test("a copy of the loader in a folder with no package file loads, with the baked version", async () => {
    const root = mkdtempSync(join(tmpdir(), "scieng-loader-"));
    try {
      mkdirSync(join(root, "src"));
      for (const name of ["config.ts", "errors.ts", "version.ts", "assets.ts"]) {
        copyFileSync(fileURLToPath(new URL(`../../src/${name}`, import.meta.url)), join(root, "src", name));
      }
      const script = [
        `import { loadConfig } from ${JSON.stringify(pathToFileURL(join(root, "src", "config.ts")).href)};`,
        'const cfg = await loadConfig({}, { env: {}, platform: "linux", homedir: "/h" });',
        "console.log(JSON.stringify({ texBundleUrl: cfg.texBundleUrl, assetsUrl: cfg.assetsUrl }));",
      ].join("\n");
      const run = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 60000 });
      expect(run.status).toBe(0);
      const out = JSON.parse(run.stdout.trim().split("\n").pop() as string) as { texBundleUrl: string; assetsUrl: string };
      expect(out.texBundleUrl).toBe(`https://github.com/danielsimonjr/sciengjs/releases/download/v${ENGINE_VERSION}/`);
      expect(out.assetsUrl).toBe(pathToFileURL(join(realpathSync(root), "assets")).href + "/");
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });

  test("loadConfig reads only the config file, never a package.json path", async () => {
    const seen: string[] = [];
    const readFile = async (p: string): Promise<string> => {
      seen.push(p);
      const err = new Error(`ENOENT: ${p}`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    };
    await loadConfig({}, deps({ readFile }));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((p) => p.endsWith("package.json"))).toBe(false);
  });
});
