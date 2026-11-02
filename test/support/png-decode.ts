/**
 * A PNG decoder for the tests. It is a second reader of the PNG bytes that the engine writes: it checks the
 * signature and the chunks, inflates the image data and reverses the scanline filters. It reads 8-bit RGBA
 * images without interlace only, which is the format that the raster stage writes. Test support only.
 */
import { inflateSync } from "node:zlib";

export interface DecodedPng {
  width: number;
  height: number;
  /** Pixels in rows, four bytes each: red, green, blue, alpha. */
  rgba: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(bytes: Uint8Array): DecodedPng {
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (bytes[i] !== SIGNATURE[i]) throw new Error("not a PNG: the signature differs");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = -1;
  let height = -1;
  const idat: Uint8Array[] = [];
  let ended = false;
  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = new DataView(data.buffer, data.byteOffset, 13).getUint32(0);
      height = new DataView(data.buffer, data.byteOffset, 13).getUint32(4);
      const depth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      if (depth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(`unsupported PNG: depth ${depth}, colour type ${colorType}, interlace ${interlace}`);
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      ended = true;
    }
    offset += 12 + length;
  }
  if (width < 0 || !ended) throw new Error("PNG without IHDR or IEND");
  const total = idat.reduce((n, part) => n + part.byteLength, 0);
  const joined = new Uint8Array(total);
  let at = 0;
  for (const part of idat) {
    joined.set(part, at);
    at += part.byteLength;
  }
  const raw = inflateSync(joined);
  const stride = width * 4;
  if (raw.byteLength !== height * (stride + 1)) throw new Error("PNG image data has the wrong length");
  const rgba = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[y * (stride + 1) + 1 + x]!;
      const left = x >= 4 ? rgba[y * stride + x - 4]! : 0;
      const up = y > 0 ? rgba[(y - 1) * stride + x]! : 0;
      const upLeft = y > 0 && x >= 4 ? rgba[(y - 1) * stride + x - 4]! : 0;
      let value: number;
      if (filter === 0) value = rawByte;
      else if (filter === 1) value = rawByte + left;
      else if (filter === 2) value = rawByte + up;
      else if (filter === 3) value = rawByte + ((left + up) >> 1);
      else if (filter === 4) value = rawByte + paeth(left, up, upLeft);
      else throw new Error(`unknown PNG filter ${filter}`);
      rgba[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, rgba };
}

/** Counts the pixels whose alpha is above zero and whose colour is darker than the threshold (sum of red, green and blue). */
export function countDarkPixels(png: DecodedPng, threshold = 300): number {
  let n = 0;
  for (let i = 0; i < png.rgba.length; i += 4) {
    if (png.rgba[i + 3]! > 0 && png.rgba[i]! + png.rgba[i + 1]! + png.rgba[i + 2]! < threshold) n += 1;
  }
  return n;
}

/** Counts the pixels whose alpha is above zero, anywhere in the image. */
export function countOpaquePixels(png: DecodedPng): number {
  let n = 0;
  for (let i = 3; i < png.rgba.length; i += 4) {
    if (png.rgba[i]! > 0) n += 1;
  }
  return n;
}
