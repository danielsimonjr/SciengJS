import { capabilitiesWithRegistry, renderWithRegistry } from "./core.ts";
import { DEFAULT_REGISTRY } from "./registry.ts";
import type { SciengConfig } from "./config.ts";
import type { Capability, RenderRequest, RenderResult } from "./types.ts";

export { RenderError, RENDER_ERROR_CODES, type RenderErrorCode } from "./errors.ts";
export { loadConfig, type SciengConfig, type NetworkPolicy } from "./config.ts";
export {
  INPUT_TYPES,
  BINARY_INPUT_TYPES,
  OUTPUT_FORMATS,
  type InputType,
  type OutputFormat,
  type RenderOptions,
  type RenderRequest,
  type RenderResult,
  type RenderAsset,
  type Capability,
} from "./types.ts";

/** Renders one source to the requested format. Rejects with a RenderError. Never falls back to another format. */
export function render(req: RenderRequest, config?: Partial<SciengConfig>): Promise<RenderResult> {
  return renderWithRegistry(req, config ?? {}, DEFAULT_REGISTRY);
}

/** Reports each supported pair, its stage and whether that stage is ready on this machine. */
export function capabilities(config?: Partial<SciengConfig>): Promise<Capability[]> {
  return capabilitiesWithRegistry(config ?? {}, DEFAULT_REGISTRY);
}
