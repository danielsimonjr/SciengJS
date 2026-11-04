/** The remote image download of html to md: manual redirects, an address check on each hop, a time limit and a size limit. */
import { isIP } from "node:net";
import type { FetchedImage, FetchImage } from "./images.ts";

/** Resolves a host name to all of its addresses, as `dns.promises.lookup(host, { all: true })` does. */
export type LookupAll = (host: string) => Promise<readonly { address: string; family: number }[]>;

/** The inputs of one image fetcher. The engine passes the network functions; a test passes doubles. */
export interface ImageFetcherOptions {
  readonly fetch: typeof fetch;
  readonly lookup: LookupAll;
  /** The time limit of one download over all its redirects, in milliseconds. */
  readonly timeoutMs: number;
  /** The size limit of the body, in bytes. */
  readonly maxBytes: number;
}

/** The most redirects that one download follows. */
const MAX_REDIRECTS = 3;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

/**
 * True when the address is loopback, private, link-local or unspecified:
 * 0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, ::, ::1, fc00::/7, fe80::/10, and an IPv4-mapped address of these.
 * A text that is not an IP address also gives true.
 */
export function isPrivateAddress(address: string): boolean {
  let addr = address.trim();
  if (addr.length >= 2 && addr.startsWith("[") && addr.endsWith("]")) addr = addr.slice(1, -1);
  const kind = isIP(addr);
  if (kind === 0) return true;
  if (kind === 4) {
    const [a, b] = addr.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  const h = ipv6Hextets(addr);
  if (h === undefined) return true;
  if (h.slice(0, 7).every((x) => x === 0) && (h[7] === 0 || h[7] === 1)) return true;
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    return isPrivateAddress(`${h[6]! >> 8}.${h[6]! & 0xff}.${h[7]! >> 8}.${h[7]! & 0xff}`);
  }
  return (h[0]! & 0xfe00) === 0xfc00 || (h[0]! & 0xffc0) === 0xfe80;
}

/** The eight hextets of an IPv6 address that isIP accepts, or undefined for a form that this parser does not read. */
function ipv6Hextets(addr: string): number[] | undefined {
  let s = addr.split("%")[0]!;
  if (s.includes(".")) {
    const colon = s.lastIndexOf(":");
    const o = s.slice(colon + 1).split(".").map(Number);
    if (o.length !== 4 || o.some((x) => !(x >= 0 && x <= 255))) return undefined;
    s = `${s.slice(0, colon + 1)}${((o[0]! << 8) | o[1]!).toString(16)}:${((o[2]! << 8) | o[3]!).toString(16)}`;
  }
  const dc = s.indexOf("::");
  let groups: string[];
  if (dc === -1) {
    groups = s.split(":");
  } else {
    const left = dc === 0 ? [] : s.slice(0, dc).split(":");
    const right = s.slice(dc + 2) === "" ? [] : s.slice(dc + 2).split(":");
    groups = [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
  }
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return undefined;
  return groups.map((g) => parseInt(g, 16));
}

/** Checks the scheme and every address of the host. Throws when the URL must not be fetched. */
async function checkTarget(url: URL, lookup: LookupAll): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`only http and https images are fetched, not ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error(`the host ${host} is a private address`);
  }
  const addresses = isIP(host) !== 0 ? [{ address: host }] : await lookup(host);
  if (addresses.length === 0) throw new Error(`the host ${host} has no address`);
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw new Error(`the host ${host} resolves to the private address ${address}`);
  }
}

/** Reads the body as a stream and stops when it passes the size limit. */
async function readCapped(reply: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(reply.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await reply.body?.cancel();
    throw new Error(`the image is ${declared} bytes, over the limit of ${maxBytes}`);
  }
  if (reply.body === null) return new Uint8Array(0);
  const reader = reply.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`the image is over the limit of ${maxBytes} bytes`);
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/**
 * Makes the fetcher of remote images. Each hop of a redirect passes the scheme check and the address check.
 * The fetcher follows at most three redirects. The reply must be an image/* type inside the size limit.
 * The address check resolves the host before the request. The request resolves the host again, so a DNS answer
 * that changes between the two lookups is not detected.
 */
export function createImageFetcher(opts: ImageFetcherOptions): FetchImage {
  return async (raw: string): Promise<FetchedImage> => {
    const signal = AbortSignal.timeout(opts.timeoutMs);
    let url = new URL(raw);
    for (let hop = 0; ; hop += 1) {
      await checkTarget(url, opts.lookup);
      const reply = await opts.fetch(url.href, { redirect: "manual", signal });
      if (REDIRECT_STATUS.has(reply.status)) {
        await reply.body?.cancel();
        const location = reply.headers.get("location");
        if (location === null) throw new Error(`HTTP ${reply.status} with no location`);
        if (hop >= MAX_REDIRECTS) throw new Error(`more than ${MAX_REDIRECTS} redirects`);
        url = new URL(location, url);
        continue;
      }
      if (!reply.ok) {
        await reply.body?.cancel();
        throw new Error(`HTTP ${reply.status}`);
      }
      const mime = (reply.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      if (!mime.startsWith("image/")) {
        await reply.body?.cancel();
        throw new Error(`the reply is ${mime === "" ? "of no type" : mime}, not an image`);
      }
      return { bytes: await readCapped(reply, opts.maxBytes), mime };
    }
  };
}
