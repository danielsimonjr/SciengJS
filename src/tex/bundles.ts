import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import type { NetworkPolicy } from "../config.ts";
import { RenderError } from "../errors.ts";
import list from "./bundles.json" with { type: "json" };
import type { BundleName } from "./detect.ts";

/** One bundle of the engine package: its name, the file name on the download server, the pinned sha256 and the size. */
export interface BundleEntry {
  name: BundleName;
  file: string;
  sha256: string;
  bytes: number;
}

/** The bundles of this build. `tools/tex/bundles.mjs` writes `bundles.json`, and CI fails when a built bundle differs from it. */
export const BUNDLES: readonly BundleEntry[] = list as BundleEntry[];

/** The configuration values that the bundle manager reads. */
export interface BundleSettings {
  /** The folder of the cache. The bundles go in its `tex-bundles` folder. */
  cacheDir: string;
  /** The base URL of the bundles. The download URL of a bundle is this value and the file name. */
  texBundleUrl: string;
  /** The network rule. A download needs `tex-bundles` in it. */
  allowNetwork: NetworkPolicy;
  /** The time limit of one download, in milliseconds. */
  timeoutMs: number;
}

/** The sub-folder of the cache folder for the bundles. */
export const CACHE_SUBFOLDER = "tex-bundles";

const MAGIC = "SCTB1\0\0\0";

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/** The path of a bundle in the cache. */
export function cachePath(entry: BundleEntry, settings: Pick<BundleSettings, "cacheDir">): string {
  return path.join(settings.cacheDir, CACHE_SUBFOLDER, entry.file);
}

/** The download URL of a bundle. A base URL with no end slash gets one. */
export function bundleUrl(entry: BundleEntry, settings: Pick<BundleSettings, "texBundleUrl">): string {
  const base = settings.texBundleUrl;
  return `${base.endsWith("/") ? base : `${base}/`}${entry.file}`;
}

/** Looks up a bundle of the list by name. A name that is not in the list is an internal error. */
export function findBundle(name: BundleName, bundles: readonly BundleEntry[] = BUNDLES): BundleEntry {
  const entry = bundles.find((b) => b.name === name);
  if (entry === undefined) throw new RenderError("E_INTERNAL", `the build has no TeX bundle named ${name}`);
  return entry;
}

/** Reads a file or rejects with `undefined` when it is not there. */
async function readIfThere(file: string): Promise<Uint8Array | undefined> {
  try {
    return new Uint8Array(await readFile(file));
  } catch (e) {
    if ((e as { code?: string }).code === "ENOENT") return undefined;
    throw e;
  }
}

/** Downloads the bytes of a bundle from an `http:`, `https:` or `file:` URL. */
async function download(url: string, settings: BundleSettings, entry: BundleEntry): Promise<Uint8Array> {
  const fail = (why: string): RenderError =>
    new RenderError("E_STAGE_MISSING", `the TeX bundle ${entry.name} is not available at ${url}: ${why}`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RenderError("E_CONFIG", `texBundleUrl gives the URL ${url} for the TeX bundle ${entry.name}, and it is not a URL`);
  }
  if (parsed.protocol === "file:") {
    try {
      return new Uint8Array(await readFile(fileURLToPath(parsed)));
    } catch (e) {
      throw fail(e instanceof Error ? e.message : String(e));
    }
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw fail(`the protocol ${parsed.protocol} is not supported`);
  try {
    const res = await fetch(parsed, { redirect: "follow", signal: AbortSignal.timeout(settings.timeoutMs) });
    if (!res.ok) throw fail(`the server answered ${res.status}`);
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > entry.bytes) throw new RenderError("E_INTEGRITY", `the TeX bundle ${entry.name} from ${url} is ${length} bytes, and the pin says ${entry.bytes}`);
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    if (e instanceof RenderError) throw e;
    throw fail(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Returns the verified bytes of a bundle. The order is the cache, then the download.
 * A cached file is hashed on every load. A cached file with a wrong hash is deleted, and the load goes on to the download.
 * A download is allowed only when `allowNetwork` has `tex-bundles`. It goes to a temporary file in the cache folder,
 * its hash and size are checked, and only then does a rename put it in place. A wrong hash deletes the temporary file and
 * rejects with `E_INTEGRITY`, so a wrong file never stays in the cache. A bundle that is not cached, with the download not allowed,
 * rejects with `E_STAGE_MISSING`.
 */
export async function loadBundleBytes(entry: BundleEntry, settings: BundleSettings): Promise<Uint8Array> {
  const target = cachePath(entry, settings);
  const cached = await readIfThere(target);
  if (cached !== undefined) {
    if (sha256(cached) === entry.sha256) return cached;
    await rm(target, { force: true });
  }
  const url = bundleUrl(entry, settings);
  if (settings.allowNetwork === "none") {
    throw new RenderError(
      "E_STAGE_MISSING",
      `the TeX bundle ${entry.name} is not in the cache (${target}), and the configuration does not allow the download of ${url}. Set allowNetwork to tex-bundles, or put the file ${entry.file} in the cache folder.`,
    );
  }
  const bytes = await download(url, settings, entry);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temp, bytes);
  try {
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
      await rm(temp, { force: true });
      throw new RenderError(
        "E_INTEGRITY",
        `the TeX bundle ${entry.name} from ${url} does not match its pin (sha256 ${entry.sha256}, ${entry.bytes} bytes). The download is deleted.`,
      );
    }
    await rename(temp, target);
  } catch (e) {
    await rm(temp, { force: true });
    throw e;
  }
  return bytes;
}

/** Unpacks an SCTB1 container (see `tools/tex/bundles.mjs`) to a map from the tree name to the file bytes. */
export function unpackBundle(bytes: Uint8Array): Map<string, Uint8Array> {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  if (buf.length < 8 || buf.toString("latin1", 0, 8) !== MAGIC) throw new RenderError("E_INTEGRITY", "a TeX bundle is not an SCTB1 container");
  let body: Buffer;
  try {
    body = inflateRawSync(buf.subarray(8));
  } catch (e) {
    throw new RenderError("E_INTEGRITY", `a TeX bundle does not inflate: ${e instanceof Error ? e.message : String(e)}`);
  }
  const out = new Map<string, Uint8Array>();
  let at = 4;
  const count = body.readUInt32LE(0);
  for (let i = 0; i < count; i++) {
    const nameLength = body.readUInt16LE(at);
    at += 2;
    const name = body.toString("utf8", at, at + nameLength);
    at += nameLength;
    const size = body.readUInt32LE(at);
    at += 4;
    out.set(name, new Uint8Array(body.buffer, body.byteOffset + at, size));
    at += size;
  }
  return out;
}

/** The files of the core bundle in this process, by the pinned hash and the loader. A rejected load is not kept. */
let coreFiles: { sha256: string; load: unknown; files: Promise<ReadonlyMap<string, Uint8Array>> } | undefined;

const loadCoreFiles = async (settings: BundleSettings): Promise<ReadonlyMap<string, Uint8Array>> =>
  unpackBundle(await loadBundleBytes(findBundle("core"), settings));

/**
 * Returns the files of the core bundle. The parent process loads, checks and unpacks the bundle once. Each render
 * worker then gets a copy of the files, so a fresh worker does not read, hash and inflate the bundle again. A load
 * that rejects is not kept, so a later render tries again. `load` is a parameter so that tests replace it.
 */
export function texCoreFiles(
  settings: BundleSettings,
  load: (settings: BundleSettings) => Promise<ReadonlyMap<string, Uint8Array>> = loadCoreFiles,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const sha256 = findBundle("core").sha256;
  if (coreFiles?.sha256 === sha256 && coreFiles.load === load) return coreFiles.files;
  const files = load(settings);
  coreFiles = { sha256, load, files };
  files.catch(() => {
    if (coreFiles?.files === files) coreFiles = undefined;
  });
  return files;
}

/** Loads the named bundles and returns the files of each, in the order of the names. A name twice loads once. */
export async function loadBundles(
  names: readonly BundleName[],
  settings: BundleSettings,
  bundles: readonly BundleEntry[] = BUNDLES,
): Promise<Map<BundleName, Map<string, Uint8Array>>> {
  const out = new Map<BundleName, Map<string, Uint8Array>>();
  for (const name of names) {
    if (out.has(name)) continue;
    out.set(name, unpackBundle(await loadBundleBytes(findBundle(name, bundles), settings)));
  }
  return out;
}
