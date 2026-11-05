/** The data of a TFM file that the DVI converter uses. */
export interface Tfm {
  /** The design size in points. */
  designSize: number;
  /** The checksum word of the font. */
  checksum: number;
  /** The width of each character that exists, in design-size units. */
  widths: Map<number, number>;
}

/**
 * Reads the character widths and the design size of a TFM file.
 * The format is the one of `tftopl.web`. A width is a fix_word, which is a multiple of 2^-20.
 * A header that does not fit the file, or a width index outside the table, throws an error.
 */
export function readTfm(bytes: Uint8Array): Tfm {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 24) throw new Error("bad TFM header");
  const half = (i: number): number => d.getUint16(2 * i, false);
  const lf = half(0);
  const lh = half(1);
  const bc = half(2);
  const ec = half(3);
  const nw = half(4);
  if (lf * 4 > bytes.length || bc > ec + 1 || ec > 255) throw new Error("bad TFM header");
  const word = (i: number): number => d.getUint32(4 * i, false);
  const fix = (i: number): number => d.getInt32(4 * i, false) / 2 ** 20;
  const charBase = 6 + lh;
  const widthBase = charBase + (ec - bc + 1);
  const widths = new Map<number, number>();
  for (let c = bc; c <= ec; c++) {
    const widthIndex = word(charBase + c - bc) >>> 24;
    if (widthIndex === 0) continue;
    if (widthIndex >= nw) throw new Error("bad width index");
    widths.set(c, fix(widthBase + widthIndex));
  }
  return { designSize: fix(7), checksum: word(6), widths };
}
