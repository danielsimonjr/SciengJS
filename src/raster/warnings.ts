/** Tells whether the font holds a glyph for a code point. */
export type CoverageTest = (codePoint: number) => boolean;

function tableOf(view: DataView, tag: string): { offset: number; length: number } | undefined {
  if (view.byteLength < 12) {
    return undefined;
  }
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const entry = 12 + i * 16;
    if (entry + 16 > view.byteLength) {
      return undefined;
    }
    let name = "";
    for (let k = 0; k < 4; k++) {
      name += String.fromCharCode(view.getUint8(entry + k));
    }
    if (name === tag) {
      return { offset: view.getUint32(entry + 8), length: view.getUint32(entry + 12) };
    }
  }
  return undefined;
}

function format4(view: DataView, start: number): CoverageTest {
  const segments = view.getUint16(start + 6) / 2;
  const ends = start + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;
  return (cp) => {
    if (cp > 0xffff) {
      return false;
    }
    for (let s = 0; s < segments; s++) {
      if (cp > view.getUint16(ends + s * 2)) {
        continue;
      }
      const first = view.getUint16(starts + s * 2);
      if (cp < first) {
        return false;
      }
      const offset = view.getUint16(ranges + s * 2);
      let glyph: number;
      if (offset === 0) {
        glyph = (cp + view.getUint16(deltas + s * 2)) & 0xffff;
      } else {
        const at = ranges + s * 2 + offset + (cp - first) * 2;
        if (at + 2 > view.byteLength) {
          return false;
        }
        glyph = view.getUint16(at);
        if (glyph !== 0) {
          glyph = (glyph + view.getUint16(deltas + s * 2)) & 0xffff;
        }
      }
      return glyph !== 0;
    }
    return false;
  };
}

function format12(view: DataView, start: number): CoverageTest {
  const groups = view.getUint32(start + 12);
  return (cp) => {
    for (let g = 0; g < groups; g++) {
      const at = start + 16 + g * 12;
      if (at + 12 > view.byteLength) {
        return false;
      }
      if (cp >= view.getUint32(at) && cp <= view.getUint32(at + 4)) {
        return true;
      }
    }
    return false;
  };
}

/**
 * Reads the Unicode character map of a TrueType or OpenType font (formats 4 and 12).
 * Returns undefined when the font has no readable map, so the caller skips the check.
 */
export function fontCovers(font: Uint8Array): CoverageTest | undefined {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  try {
    const cmap = tableOf(view, "cmap");
    if (cmap === undefined) {
      return undefined;
    }
    const tests: CoverageTest[] = [];
    const count = view.getUint16(cmap.offset + 2);
    for (let i = 0; i < count; i++) {
      const record = cmap.offset + 4 + i * 8;
      const platform = view.getUint16(record);
      const encoding = view.getUint16(record + 2);
      const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
      if (!unicode) {
        continue;
      }
      const sub = cmap.offset + view.getUint32(record + 4);
      const format = view.getUint16(sub);
      if (format === 4) {
        tests.push(format4(view, sub));
      } else if (format === 12) {
        tests.push(format12(view, sub));
      }
    }
    if (tests.length === 0) {
      return undefined;
    }
    return (cp) => tests.some((test) => test(cp));
  } catch {
    return undefined;
  }
}

// A named entity of SVG (amp, lt, gt, quot, apos) stands for an ASCII character, which the check skips. Only a numeric reference can name a character that the font lacks.
function decodeEntities(text: string): string {
  return text.replace(/&#(x[0-9a-fA-F]+|[0-9]+);/g, (whole, body: string) => {
    const value = body.startsWith("x") ? parseInt(body.slice(1), 16) : parseInt(body, 10);
    return value <= 0x10ffff ? String.fromCodePoint(value) : whole;
  });
}

function isBold(weight: string): boolean {
  const value = weight.trim().toLowerCase();
  return value === "bold" || value === "bolder" || (/^[0-9]+$/.test(value) && Number(value) >= 600);
}

/** The code point text of an SVG fragment: the markup removed and the entities read. */
function textOf(markup: string): string {
  return decodeEntities(markup.replace(/<[^>]*>/g, ""));
}

/**
 * Lists what the raster font cannot draw in the text of an SVG. The font has one face, so bold and
 * italic text draw in that face. A character without a glyph draws no pixel. Each kind gives one warning.
 */
export function rasterWarnings(svg: string, font: Uint8Array): string[] {
  const covers = fontCovers(font);
  let bold = 0;
  let italic = 0;
  const missing = new Set<number>();
  for (const match of svg.matchAll(/<(?:text|tspan)\b([^>]*)>/g)) {
    const attributes = match[1];
    const weight = /\sfont-weight="([^"]*)"/.exec(attributes);
    if (weight !== null && isBold(weight[1])) {
      bold++;
    }
    const style = /\sfont-style="([^"]*)"/.exec(attributes);
    if (style !== null && (style[1] === "italic" || style[1] === "oblique")) {
      italic++;
    }
  }
  if (covers !== undefined) {
    for (const match of svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)) {
      for (const ch of textOf(match[1])) {
        const cp = ch.codePointAt(0) as number;
        if (cp > 0x20 && cp !== 0xa0 && !(cp >= 0x7f && cp < 0xa0) && !covers(cp)) {
          missing.add(cp);
        }
      }
    }
  }
  const warnings: string[] = [];
  if (covers === undefined && /<text\b/.test(svg)) {
    warnings.push("the raster font has no readable character map, so the render cannot check which characters it draws");
  }
  if (bold > 0) {
    warnings.push(`${bold} bold text element(s) draw in the one face of the raster font`);
  }
  if (italic > 0) {
    warnings.push(`${italic} italic text element(s) draw in the one face of the raster font`);
  }
  if (missing.size > 0) {
    const first = [...missing][0];
    const code = "U+" + first.toString(16).toUpperCase().padStart(4, "0");
    warnings.push(`${missing.size} character(s) have no glyph in the raster font and draw blank (first: ${code})`);
  }
  return warnings;
}
