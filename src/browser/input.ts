import { RenderError } from "../errors.ts";

/** The default page width of a png, in CSS pixels. */
export const DEFAULT_WIDTH = 800;
/** The default page height of a png, in CSS pixels. */
export const DEFAULT_HEIGHT = 600;
/** The default device scale of a png. */
export const DEFAULT_SCALE = 1;

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

/** Checks the options of html to png. An unknown key or a bad value rejects with E_INPUT. */
export function parsePngOptions(options: Record<string, unknown>): PngOptions {
  rejectUnknownKeys(options, ["width", "height", "scale"], "html to png");
  return {
    width: positiveInteger(options, "width", DEFAULT_WIDTH),
    height: positiveInteger(options, "height", DEFAULT_HEIGHT),
    scale: positiveNumber(options, "scale", DEFAULT_SCALE),
  };
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

/** One warning for each request that the page made and the client refused. */
export function blockedWarnings(blocked: readonly string[]): string[] {
  return blocked.map((url) => `the page requested ${url}; the browser stage refused the request`);
}
