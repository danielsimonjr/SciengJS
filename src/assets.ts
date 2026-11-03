import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RenderError } from "./errors.ts";

/** Relative path of the bundled Liberation Serif font inside the assets folder. */
export const BUNDLED_FONT_FILE = "fonts/LiberationSerif-Regular.ttf";

/** File name of the bundled resvg WebAssembly module inside the assets folder. */
export const RESVG_WASM_FILE = "index_bg.wasm";

/** Validates a raw assets-folder URL syntactically and returns its href with a trailing slash. */
export function checkAssetsUrl(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new RenderError(
      "E_CONFIG",
      label + " must be a string holding a file: URL, but got " + typeof value,
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RenderError(
      "E_CONFIG",
      label + " is not a valid URL: " + JSON.stringify(value),
    );
  }
  if (url.protocol !== "file:") {
    throw new RenderError(
      "E_CONFIG",
      label + " must be a file: URL, but got protocol " + url.protocol,
    );
  }
  return url.href.endsWith("/") ? url.href : url.href + "/";
}

/** Resolves a relative file under the assets folder URL to an OS path. */
export function assetFile(assetsUrl: string, file: string): string {
  return fileURLToPath(new URL(file, checkAssetsUrl(assetsUrl, "assetsUrl")));
}

/** Resolves the OS path of the bundled font inside the assets folder. */
export function bundledFontPathIn(assetsUrl: string): string {
  return assetFile(assetsUrl, BUNDLED_FONT_FILE);
}

/** Reads an asset file from the assets folder and returns its bytes. */
export function readAsset(assetsUrl: string, file: string): Uint8Array {
  const path = assetFile(assetsUrl, file);
  try {
    return readFileSync(path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RenderError(
      "E_STAGE_MISSING",
      file + " cannot be read: " + path + ": " + message,
    );
  }
}
