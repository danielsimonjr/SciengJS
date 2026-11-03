import { homedir as osHomedir } from "node:os";
import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";
import { RenderError } from "./errors.ts";
import { ENGINE_VERSION } from "./version.ts";
import { checkAssetsUrl } from "./assets.ts";

/** The network uses that a render may make. The design lists these three network values only. */
export type NetworkPolicy = "none" | "tex-bundles" | "tex-bundles,images";

/** The resolved configuration. Every field has one default, set in this file only. */
export interface SciengConfig {
  /** Path of Chromium or Chrome. Required by the browser stage only. */
  browser?: string;
  cacheDir: string;
  texBundleUrl: string;
  timeoutMs: number;
  maxSourceBytes: number;
  maxMemoryMb: number;
  allowNetwork: NetworkPolicy;
  /** The folder URL that holds the fonts folder and the resvg WASM file. */
  assetsUrl: string;
  /** Path of a TrueType or OpenType file that the raster stage uses in place of the bundled font. */
  rasterFont?: string;
}

/** The inputs of the loader. A caller injects them in a test. */
export interface ConfigDeps {
  env: Record<string, string | undefined>;
  platform: string;
  homedir: string;
  readFile: (filePath: string) => Promise<string>;
  engineVersion: string;
}

/** The assets folder of the package, resolved relative to this file. */
export const DEFAULT_ASSETS_URL = new URL("../assets/", import.meta.url).href;

const ENV = {
  configFile: "SCIENG_CONFIG",
  browser: "SCIENG_BROWSER",
  cacheDir: "SCIENG_CACHE_DIR",
  texBundleUrl: "SCIENG_TEX_BUNDLE_URL",
  timeoutMs: "SCIENG_TIMEOUT_MS",
  maxSourceBytes: "SCIENG_MAX_SOURCE_BYTES",
  maxMemoryMb: "SCIENG_MAX_MEMORY_MB",
  allowNetwork: "SCIENG_ALLOW_NETWORK",
  assetsUrl: "SCIENG_ASSETS_URL",
  rasterFont: "SCIENG_RASTER_FONT",
} as const;

const RELEASE_URL_BASE = "https://github.com/danielsimonjr/sciengjs/releases/download";
const NETWORK_POLICIES: readonly NetworkPolicy[] = ["none", "tex-bundles", "tex-bundles,images"];
const CONFIG_FILE_NAME = "config.json";
const APP_FOLDER = "scieng";

type ConfigKey = keyof SciengConfig;

/** The platform folder for configuration. A missing platform variable fails loudly. */
function configBaseDir(d: ConfigDeps): string {
  if (d.platform === "win32") return requireVar(d.env, "APPDATA", "Windows");
  if (d.platform === "darwin") return path.posix.join(d.homedir, "Library", "Application Support");
  return nonEmpty(d.env.XDG_CONFIG_HOME) ?? path.posix.join(d.homedir, ".config");
}

/** The platform folder for the cache. A missing platform variable fails loudly. */
function cacheBaseDir(d: ConfigDeps): string {
  if (d.platform === "win32") return requireVar(d.env, "LOCALAPPDATA", "Windows");
  if (d.platform === "darwin") return path.posix.join(d.homedir, "Library", "Caches");
  return nonEmpty(d.env.XDG_CACHE_HOME) ?? path.posix.join(d.homedir, ".cache");
}

function requireVar(env: Record<string, string | undefined>, name: string, platform: string): string {
  const value = nonEmpty(env[name]);
  if (value === undefined) {
    throw new RenderError("E_CONFIG", `${name} is not set; ${platform} needs it for the default folders`);
  }
  return value;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

/** The defaults that need no platform folder. This file is the only place that holds the defaults. */
function defaults(engineVersion: string): Required<Omit<SciengConfig, "browser" | "cacheDir" | "rasterFont">> {
  return {
    texBundleUrl: `${RELEASE_URL_BASE}/v${engineVersion}/`,
    timeoutMs: 60000,
    maxSourceBytes: 10485760,
    maxMemoryMb: 2048,
    allowNetwork: "tex-bundles",
    assetsUrl: DEFAULT_ASSETS_URL,
  };
}

function defaultConfigPath(d: ConfigDeps): string {
  const p = d.platform === "win32" ? path.win32 : path.posix;
  return p.join(configBaseDir(d), APP_FOLDER, CONFIG_FILE_NAME);
}

/** Checks one value against the type of the key. Returns the value, or throws E_CONFIG. */
function checkValue(key: ConfigKey, value: unknown, source: string): SciengConfig[ConfigKey] {
  const fail = (why: string): never => {
    throw new RenderError("E_CONFIG", `${source}: ${key} ${why}`);
  };
  switch (key) {
    case "browser":
    case "cacheDir":
    case "texBundleUrl":
    case "rasterFont":
      if (typeof value !== "string" || value === "") return fail("must be a non-empty string");
      return value;
    case "timeoutMs":
    case "maxSourceBytes":
    case "maxMemoryMb":
      if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        return fail("must be a positive integer");
      }
      return value;
    case "allowNetwork":
      if (typeof value !== "string" || !NETWORK_POLICIES.includes(value as NetworkPolicy)) {
        return fail(`must be one of ${NETWORK_POLICIES.join(", ")}`);
      }
      return value as NetworkPolicy;
    case "assetsUrl":
      return checkAssetsUrl(value, `${source}: ${key}`);
  }
}

/** Converts an environment text to a value of the key. Numbers must be whole and positive. */
function fromEnvText(key: ConfigKey, text: string, envName: string): SciengConfig[ConfigKey] {
  if (key === "timeoutMs" || key === "maxSourceBytes" || key === "maxMemoryMb") {
    if (!/^\d+$/.test(text)) {
      throw new RenderError("E_CONFIG", `${envName} must be a whole number, got "${text}"`);
    }
    return checkValue(key, Number(text), envName);
  }
  return checkValue(key, text, envName);
}

const ENV_KEYS: Record<Exclude<ConfigKey, never>, string> = {
  browser: ENV.browser,
  cacheDir: ENV.cacheDir,
  texBundleUrl: ENV.texBundleUrl,
  timeoutMs: ENV.timeoutMs,
  maxSourceBytes: ENV.maxSourceBytes,
  maxMemoryMb: ENV.maxMemoryMb,
  allowNetwork: ENV.allowNetwork,
  assetsUrl: ENV.assetsUrl,
  rasterFont: ENV.rasterFont,
};

/** Reads the config file. A missing file is fine only at the default path. */
async function readConfigFile(
  filePath: string,
  explicit: boolean,
  d: ConfigDeps,
): Promise<Partial<Record<ConfigKey, unknown>>> {
  let text: string;
  try {
    text = await d.readFile(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" && !explicit) return {};
    throw new RenderError("E_CONFIG", `cannot read config file ${filePath}: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new RenderError("E_CONFIG", `config file ${filePath} is not valid JSON: ${(err as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new RenderError("E_CONFIG", `config file ${filePath} must hold a JSON object`);
  }
  const known = new Set<string>(Object.keys(ENV_KEYS));
  for (const key of Object.keys(parsed)) {
    if (!known.has(key)) throw new RenderError("E_CONFIG", `config file ${filePath} has an unknown key: ${key}`);
  }
  return parsed as Partial<Record<ConfigKey, unknown>>;
}

/**
 * Resolves the configuration. Precedence: call option, then environment, then file, then default.
 * Any unreadable or invalid source rejects with E_CONFIG. The loader never falls back to defaults for the source.
 */
export async function loadConfig(
  options: Partial<SciengConfig> = {},
  deps: Partial<ConfigDeps> = {},
): Promise<SciengConfig> {
  const d: ConfigDeps = {
    env: process.env,
    platform: process.platform,
    homedir: osHomedir(),
    readFile: (p) => fsReadFile(p, "utf8"),
    engineVersion: ENGINE_VERSION,
    ...deps,
  };
  const explicitPath = nonEmpty(d.env[ENV.configFile]);
  const filePath = explicitPath ?? defaultConfigPath(d);
  const fromFile = await readConfigFile(filePath, explicitPath !== undefined, d);
  const base = defaults(d.engineVersion);

  const resolved: Partial<Record<ConfigKey, unknown>> = { ...base };
  for (const key of Object.keys(ENV_KEYS) as ConfigKey[]) {
    const fileValue = fromFile[key];
    if (fileValue !== undefined) resolved[key] = checkValue(key, fileValue, filePath);
  }
  for (const key of Object.keys(ENV_KEYS) as ConfigKey[]) {
    const envName = ENV_KEYS[key];
    const text = nonEmpty(d.env[envName]);
    if (text !== undefined) resolved[key] = fromEnvText(key, text, envName);
  }
  for (const key of Object.keys(options) as ConfigKey[]) {
    const value = options[key];
    if (value !== undefined) resolved[key] = checkValue(key, value, "call option");
  }
  // The cache folder depends on the platform. Resolve it only when no source gave a value.
  if (resolved.cacheDir === undefined) {
    const p = d.platform === "win32" ? path.win32 : path.posix;
    resolved.cacheDir = p.join(cacheBaseDir(d), APP_FOLDER);
  }
  return resolved as unknown as SciengConfig;
}
