import { RenderError } from "../errors.ts";

/** The default page width of a png, in CSS pixels. */
export const DEFAULT_WIDTH = 800;
/** The default page height of a png, in CSS pixels. */
export const DEFAULT_HEIGHT = 600;
/** The default device scale of a png. */
export const DEFAULT_SCALE = 1;
/** The largest width or height of a png, in CSS pixels. */
export const MAX_SIDE = 16384;
/** The largest device scale of a png. */
export const MAX_SCALE = 8;
/** The largest count of device pixels of a png: (width * scale) * (height * scale). */
export const MAX_DEVICE_PIXELS = 64 * 1024 * 1024;
/** The largest count of refused URLs that get one warning each. */
export const MAX_BLOCKED_WARNINGS = 50;
/** The largest count of URL characters in one warning. */
export const MAX_WARNING_URL_CHARS = 200;

/** The options of html to png. */
export interface PngOptions {
  width: number;
  height: number;
  scale: number;
}

function rejectUnknownKeys(options: Record<string, unknown>, allowed: readonly string[], pair: string): void {
  for (const key of Object.keys(options)) {
    if (!allowed.includes(key)) {
      throw new RenderError("E_INPUT", `${pair} takes no option ${key}`);
    }
  }
}

function positiveInteger(options: Record<string, unknown>, key: string, fallback: number): number {
  if (!(key in options)) return fallback;
  const value = options[key];
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  throw new RenderError("E_INPUT", `option ${key} must be a whole number greater than 0`);
}

function positiveNumber(options: Record<string, unknown>, key: string, fallback: number): number {
  if (!(key in options)) return fallback;
  const value = options[key];
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  throw new RenderError("E_INPUT", `option ${key} must be a finite number greater than 0`);
}

/**
 * Checks the options of html to png. An unknown key, a bad value, a side over MAX_SIDE, a scale over MAX_SCALE
 * or a device pixel count over MAX_DEVICE_PIXELS rejects with E_INPUT.
 */
export function parsePngOptions(options: Record<string, unknown>): PngOptions {
  rejectUnknownKeys(options, ["width", "height", "scale"], "html to png");
  const width = positiveInteger(options, "width", DEFAULT_WIDTH);
  const height = positiveInteger(options, "height", DEFAULT_HEIGHT);
  const scale = positiveNumber(options, "scale", DEFAULT_SCALE);
  if (width > MAX_SIDE || height > MAX_SIDE) {
    throw new RenderError("E_INPUT", `options width and height must not be more than ${MAX_SIDE}`);
  }
  if (scale > MAX_SCALE) {
    throw new RenderError("E_INPUT", `option scale must not be more than ${MAX_SCALE}`);
  }
  if (width * scale * (height * scale) > MAX_DEVICE_PIXELS) {
    throw new RenderError("E_INPUT", `the png must not have more than ${MAX_DEVICE_PIXELS} device pixels`);
  }
  return { width, height, scale };
}

/** Checks the options of html to pdf. The pdf takes no option. */
export function parsePdfOptions(options: Record<string, unknown>): void {
  rejectUnknownKeys(options, [], "html to pdf");
}

/** The HTML text of a source. A source that is bytes rejects with E_INPUT. */
export function htmlSource(source: string | Uint8Array): string {
  if (typeof source !== "string") {
    throw new RenderError("E_INPUT", "html takes text, not bytes");
  }
  return source;
}

/** The browser path of the settings. A missing path rejects with E_STAGE_MISSING. */
export function browserPathOf(browser: string | undefined): string {
  if (browser === undefined || browser === "") {
    throw new RenderError("E_STAGE_MISSING", "the browser stage needs SCIENG_BROWSER or the browser configuration key");
  }
  return browser;
}

/** Writes each control character, and U+2028 and U+2029, as a \uXXXX escape. */
function escapeControls(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * One warning for each request that the page made and the client refused, up to MAX_BLOCKED_WARNINGS. A URL is cut
 * to MAX_WARNING_URL_CHARS and its control characters are escaped. One last warning counts the requests over the cap.
 */
export function blockedWarnings(blocked: readonly string[]): string[] {
  const warnings = blocked.slice(0, MAX_BLOCKED_WARNINGS).map((url) => {
    const cut = url.length > MAX_WARNING_URL_CHARS ? `${url.slice(0, MAX_WARNING_URL_CHARS)}...` : url;
    return `the page requested ${escapeControls(cut)}; the browser stage refused the request`;
  });
  if (blocked.length > MAX_BLOCKED_WARNINGS) {
    warnings.push(`the browser stage refused ${blocked.length - MAX_BLOCKED_WARNINGS} more requests`);
  }
  return warnings;
}
