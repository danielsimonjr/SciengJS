// TFM reader of the trial: the character widths and the design size.
// Format: tftopl.web, "Font metric data". Widths are fix_words (2^-20 design units).

export function readTfm(bytes) {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const h = (i) => d.getUint16(2 * i, false);
  const [lf, lh, bc, ec, nw] = [h(0), h(1), h(2), h(3), h(4)];
  if (lf * 4 > bytes.length || bc > ec + 1 || ec > 255) throw new Error('bad TFM header');
  const word = (i) => d.getUint32(4 * i, false);
  const fix = (i) => d.getInt32(4 * i, false) / 2 ** 20;
  const designSize = fix(6 + 1); // header[1], in points
  const charBase = 6 + lh;
  const widthBase = charBase + (ec - bc + 1);
  const widths = new Map();
  for (let c = bc; c <= ec; c++) {
    const ci = word(charBase + c - bc);
    const wi = ci >>> 24;
    if (wi === 0) continue; // the character does not exist
    if (wi >= nw) throw new Error('bad width index');
    widths.set(c, fix(widthBase + wi)); // in design-size units
  }
  return { designSize, checksum: word(6), widths };
}
