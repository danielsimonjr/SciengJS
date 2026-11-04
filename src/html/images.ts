
/** The media type of a fetched image, with its bytes. */
export interface FetchedImage {
  bytes: Uint8Array;
  mime: string;
}

/** Fetches one remote image. The engine passes the network fetch; a test passes a double. */
export type FetchImage = (url: string) => Promise<FetchedImage>;

/** Decodes a data: URL. Returns undefined when the text is not a data: URL with a comma. */
export function decodeDataUrl(url: string): FetchedImage | undefined {
  if (!url.startsWith("data:")) return undefined;
  const commaIndex = url.indexOf(",");
  if (commaIndex === -1) return undefined;
  let header = url.slice(5, commaIndex).trim();
  const payload = url.slice(commaIndex + 1);
  let isBase64 = false;
  const base64Flag = /;base64$/i.exec(header);
  if (base64Flag !== null) {
    isBase64 = true;
    header = header.slice(0, base64Flag.index);
  }
  const mediaType = header === "" ? "text/plain;charset=US-ASCII" : header;
  const mime = (mediaType.split(";")[0] ?? "").trim().toLowerCase() || "text/plain";
  if (isBase64) {
    return { bytes: new Uint8Array(Buffer.from(payload, "base64")), mime };
  }
  return { bytes: percentDecodeBytes(payload), mime };
}

/** Percent-decodes the text to bytes. A sequence that is not two hex digits stays as its bytes. */
function percentDecodeBytes(payload: string): Uint8Array {
  const raw = Buffer.from(payload, "utf8");
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const byte = raw[i]!;
    const hex = raw.subarray(i + 1, i + 3).toString("latin1");
    if (byte === 0x25 && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      out.push(parseInt(hex, 16));
      i += 2;
    } else {
      out.push(byte);
    }
  }
  return Uint8Array.from(out);
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
};

/** The file extension of a media type. An unknown media type gives "bin". */
export function extensionForMime(mime: string): string {
  return EXTENSIONS[mime.toLowerCase()] ?? "bin";
}
