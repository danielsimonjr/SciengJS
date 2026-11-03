import { fileURLToPath, pathToFileURL } from "node:url";
import type { ConfigDeps, SciengConfig } from "../../src/config.ts";
import { renderWithRegistry } from "../../src/core.ts";
import { DEFAULT_REGISTRY, type Registry } from "../../src/registry.ts";
import type { RenderRequest, RenderResult } from "../../src/types.ts";

export { FIXED_SVG } from "./stubs/stub-dot.ts";

/** A registry of test-only backends. Production code never reads this file. */
export const TEST_REGISTRY: Registry = {
  "dot:svg": {
    backend: "test/fixed",
    moduleUrl: pathToFileURL(fileURLToPath(new URL("./stubs/stub-dot.ts", import.meta.url))).href,
  },
};

/** Config deps that read no file and no environment, so no test sees the user's configuration. */
export const ISOLATED_CONFIG_DEPS: Partial<ConfigDeps> = {
  env: {},
  platform: "linux",
  homedir: "/nonexistent-home",
  engineVersion: "0.0.0",
  readFile: async (filePath: string) => {
    const err = new Error(`ENOENT: ${filePath}`) as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  },
};

/** Renders with the built-in registry and the isolated configuration, so that no test reads the host configuration file. */
export function renderIsolated(req: RenderRequest, config: Partial<SciengConfig> = {}): Promise<RenderResult> {
  return renderWithRegistry(req, config, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
}
