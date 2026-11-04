import { loadConfig, type ConfigDeps, type SciengConfig } from "./config.ts";
import { RenderError } from "./errors.ts";
import { PAIRS, findPair } from "./pairs.ts";
import { registryKey, type Registry } from "./registry.ts";
import { runInWorker } from "./worker/run.ts";
import { BINARY_INPUT_TYPES, INPUT_TYPES, OUTPUT_FORMATS, type Capability, type OutputFormat, type RenderOptions, type RenderRequest, type RenderResult } from "./types.ts";

/** The MIME type of each output format. */
const MIME: Record<OutputFormat, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  pdf: "application/pdf",
  html: "text/html; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  glb: "model/gltf-binary",
  stl: "model/stl",
};

const encoder = new TextEncoder();

/**
 * Renders one request. The registry and the config dependencies are parameters so that tests
 * inject them. The public `render` passes the built-in registry.
 */
export async function renderWithRegistry(
  req: RenderRequest,
  options: Partial<SciengConfig>,
  registry: Registry,
  configDeps?: Partial<ConfigDeps>,
): Promise<RenderResult> {
  const cfg = await loadConfig(options, configDeps);

  if (!(INPUT_TYPES as readonly string[]).includes(req.type)) {
    throw new RenderError("E_INPUT", `unknown input type: ${String(req.type)}`);
  }
  if (!(OUTPUT_FORMATS as readonly string[]).includes(req.format)) {
    throw new RenderError("E_INPUT", `unknown output format: ${String(req.format)}`);
  }
  const pair = findPair(req.type, req.format);
  if (pair === undefined) {
    throw new RenderError("E_UNSUPPORTED", `${req.type} to ${req.format} is not a supported pair`);
  }

  const isBinary = (BINARY_INPUT_TYPES as readonly string[]).includes(req.type);
  if (isBinary && typeof req.source === "string") {
    throw new RenderError("E_INPUT", `${req.type} takes bytes, not text`);
  }
  if (!isBinary && typeof req.source !== "string") {
    throw new RenderError("E_INPUT", `${req.type} takes text, not bytes`);
  }

  const sourceBytes = typeof req.source === "string" ? encoder.encode(req.source).byteLength : req.source.byteLength;
  if (sourceBytes > cfg.maxSourceBytes) {
    throw new RenderError("E_LIMIT", `source is ${sourceBytes} bytes; the limit is ${cfg.maxSourceBytes}`);
  }

  const entry = registry[registryKey(req.type, req.format)];
  if (entry === undefined) {
    throw new RenderError("E_UNSUPPORTED", `no ${req.type} to ${req.format} backend is built in this release`);
  }
  if (pair.stage === "browser" && cfg.browser === undefined) {
    throw new RenderError("E_STAGE_MISSING", "the browser stage needs SCIENG_BROWSER or the browser configuration key");
  }

  const out = await runInWorker(
    {
      moduleUrl: entry.moduleUrl,
      backend: entry.backend,
      request: {
        type: req.type,
        format: req.format,
        source: req.source,
        options: (req.options ?? {}) as RenderOptions,
        settings: {
          maxMemoryMb: cfg.maxMemoryMb,
          rasterFont: cfg.rasterFont,
          assetsUrl: cfg.assetsUrl,
          browser: cfg.browser,
          timeoutMs: cfg.timeoutMs,
          allowNetwork: cfg.allowNetwork,
        },
      },
    },
    { timeoutMs: cfg.timeoutMs, maxMemoryMb: cfg.maxMemoryMb },
  );

  return {
    bytes: out.bytes,
    mime: MIME[req.format],
    backend: out.backend ?? entry.backend,
    warnings: out.warnings ?? [],
    ...(out.assets !== undefined && out.assets.length > 0 ? { assets: out.assets } : {}),
  };
}

/** Reports every pair of the design with its stage and its readiness on this machine. */
export async function capabilitiesWithRegistry(
  options: Partial<SciengConfig>,
  registry: Registry,
  configDeps?: Partial<ConfigDeps>,
): Promise<Capability[]> {
  const cfg = await loadConfig(options, configDeps);
  return PAIRS.map((pair) => {
    const registered = registry[registryKey(pair.type, pair.format)] !== undefined;
    const browserReady = pair.stage !== "browser" || cfg.browser !== undefined;
    const ready = registered && browserReady;
    const cap: Capability = { type: pair.type, format: pair.format, stage: pair.stage, ready };
    if (pair.note !== undefined) cap.note = pair.note;
    if (!registered) cap.reason = "no backend is built in this release";
    else if (!browserReady) cap.reason = "no browser path is configured (SCIENG_BROWSER)";
    return cap;
  });
}
