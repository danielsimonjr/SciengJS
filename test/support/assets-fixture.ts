import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The bundled font of the repository. Tests copy its bytes or replace them. */
export const REAL_FONT_PATH = fileURLToPath(new URL("../../assets/fonts/LiberationSerif-Regular.ttf", import.meta.url));

/** The resvg WASM file of the locked dependency. The build copies the same file into assets/. */
export const REAL_WASM_PATH: string = createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm");

/** The bytes of the bundled font and of the locked WASM file. */
export function realFiles(): { font: Uint8Array; wasm: Uint8Array } {
  return { font: new Uint8Array(readFileSync(REAL_FONT_PATH)), wasm: new Uint8Array(readFileSync(REAL_WASM_PATH)) };
}

/** A font with a font signature and no tables. A label drawn with it shows no glyph. */
export function noGlyphFont(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0, 1, 0, 0]);
  return bytes;
}

/** The locked WASM module with one extra custom section. The module stays valid, and its bytes differ. */
export function wasmWithCustomSection(): Uint8Array {
  const real = realFiles().wasm;
  const name = new TextEncoder().encode("scieng-test");
  const payload = [0x78];
  // Section id 0, then the size, then the name length, the name and the payload.
  const body = [name.length, ...name, ...payload];
  const section = [0x00, body.length, ...body];
  const out = new Uint8Array(real.length + section.length);
  out.set(real, 0);
  out.set(section, real.length);
  return out;
}

/** Creates a temporary root for one test file. The caller removes it with removeScratch in afterAll. */
export function makeScratch(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Removes a temporary root. */
export function removeScratch(root: string): void {
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

/** Creates a folder under root with the given files, and returns its URL with a trailing slash. */
export function makeAssetsFolder(root: string, name: string, files: { font?: Uint8Array; wasm?: Uint8Array }): string {
  const folder = join(root, name);
  mkdirSync(join(folder, "fonts"), { recursive: true });
  if (files.font !== undefined) writeFileSync(join(folder, "fonts", "LiberationSerif-Regular.ttf"), files.font);
  if (files.wasm !== undefined) writeFileSync(join(folder, "index_bg.wasm"), files.wasm);
  return pathToFileURL(folder).href + "/";
}
