// The backend settings of a test render. A test gives only the values that it changes.
import { DEFAULT_ASSETS_URL } from "../../src/config.ts";
import type { BackendSettings } from "../../src/worker/protocol.ts";

/** The settings of the default configuration, with the given values in place of the defaults. */
export function testSettings(overrides: Partial<BackendSettings> = {}): BackendSettings {
  return {
    maxMemoryMb: 2048,
    rasterFont: undefined,
    assetsUrl: DEFAULT_ASSETS_URL,
    browser: undefined,
    timeoutMs: 60000,
    allowNetwork: "tex-bundles",
    imageTimeoutMs: 15000,
    maxImageBytes: 10485760,
    maxCadNodes: 10000,
    maxCadFacets: 2000000,
    ...overrides,
  };
}
