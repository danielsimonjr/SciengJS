// DVI to SVG. Each glyph becomes one <path> with the outline of its Type 1 font; each rule becomes a <rect>.
// The format of the DVI file: dvitype.web, part 3. Units: the SVG unit is the TeX point, unless the option
// unitPerPt gives another unit.
import { readTfm, type Tfm } from "./tfm.ts";
import { readType1, type Type1Font } from "./type1.ts";
import type { SpecialPosition, SpecialResult } from "./specials.ts";

/** The files of one font: the TFM, and the PFB when the font has outlines. */
export interface FontFiles {
  tfm: Uint8Array;
  pfb: Uint8Array | null;
}

/** The options of the DVI converter. */
export interface DviOptions {
  /** The page to draw, counted from 1. The default is 1. */
  page?: number;
  /** The border around the marks, in SVG units. The default is 1. */
  margin?: number;
  /** The size of one TeX point in SVG units. The default is 1. */
  unitPerPt?: number;
  /** Reads one `\special` at the current position. It can give SVG text for the page and a box for the bounds. */
  special?: (text: string, at: SpecialPosition) => SpecialResult | null;
}

/** The result of the DVI converter. */
export interface DviSvg {
  svg: string;
  /** The number of glyph paths on the drawn page. */
  glyphs: number;
  /** The number of rules on the drawn page. */
  rules: number;
  /** The number of `\special` commands in the file. */
  specials: number;
  /** The number of pages in the file. */
  pages: number;
  /** The fonts and glyphs (`font:code`) that have no file or no outline. */
  missing: string[];
  /** The fonts that the file names, by font name. */
  fonts: string[];
}

const r = (v: number): string => String(Math.round(v * 1000) / 1000);

interface LoadedFont {
  tfm: Tfm;
  t1: Type1Font | null;
}

interface DviFont {
  name: string;
  size: number;
  ld: LoadedFont | null;
}

/**
 * Converts a DVI file to SVG.
 * `fontFiles` gives the files of a font by name. It returns `null` for an unknown font.
 * A font with no PFB keeps its TFM advances, and each of its glyphs goes in the missing list.
 */
export function dviToSvg(dvi: Uint8Array, fontFiles: (name: string) => FontFiles | null, opt: DviOptions = {}): DviSvg {
  let p = 0;
  const u = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + dvi[p++]!;
    return v;
  };
  const s = (n: number): number => {
    const v = u(n);
    const lim = 2 ** (8 * n - 1);
    return v >= lim ? v - 2 * lim : v;
  };
  if (dvi[0] !== 247 || dvi[1] !== 2) throw new Error("not a DVI file");
  p = 2;
  const num = u(4);
  const den = u(4);
  const mag = u(4);
  p += 1 + dvi[14]!;
  // the SVG unit: the TeX point, or another unit with opt.unitPerPt (72/72.27 gives the big point)
  const toPt = (num / den) * (mag / 1000) * (72.27 / 254000) * (opt.unitPerPt ?? 1);
  const fonts = new Map<number, DviFont>();
  const loaded = new Map<string, LoadedFont | null>();
  const missing = new Set<string>();
  const out: string[] = [];
  let glyphs = 0;
  let rules = 0;
  let specials = 0;
  let page = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const box = (x0: number, y0: number, x1: number, y1: number): void => {
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  };
  const want = opt.page ?? 1;
  let h = 0;
  let v = 0;
  let w = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  let f: DviFont | undefined;
  const stack: number[][] = [];

  const fontDef = (k: number): void => {
    u(4); // checksum
    const sz = u(4);
    u(4); // design size
    const a = u(1);
    const l = u(1);
    let name = "";
    for (let i = 0; i < a + l; i++) name += String.fromCharCode(dvi[p++]!);
    if (fonts.has(k)) return;
    let ld = loaded.get(name);
    if (ld === undefined) {
      const files = fontFiles(name);
      if (!files) {
        missing.add(name);
        ld = null;
      } else ld = { tfm: readTfm(files.tfm), t1: files.pfb ? readType1(files.pfb) : null };
      loaded.set(name, ld);
    }
    fonts.set(k, { name, size: sz, ld });
  };
  const drawChar = (c: number): number => {
    const fnt = f;
    if (!fnt) throw new Error("char before a font");
    let adv = 0;
    if (fnt.ld) {
      const wd = fnt.ld.tfm.widths.get(c);
      if (wd === undefined) throw new Error(`no width for char ${c} in ${fnt.name}`);
      adv = wd * fnt.size; // TFM width times the font size, in DVI units
    }
    if (page === want && fnt.ld) {
      const g = fnt.ld.t1?.glyph(c);
      if (!g) missing.add(`${fnt.name}:${c}`);
      else if (g.d) {
        const k = (fnt.size * toPt) / 1000;
        const X = h * toPt;
        const Y = v * toPt;
        const ks = Number(k.toFixed(6));
        out.push(`<path transform="translate(${r(X)} ${r(Y)}) scale(${ks} ${-ks})" d="${g.d}"/>`);
        box(X + g.bbox[0] * k, Y - g.bbox[3] * k, X + g.bbox[2] * k, Y - g.bbox[1] * k);
        glyphs++;
      }
    }
    return adv;
  };
  const drawRule = (a: number, b: number): void => {
    if (page === want && a > 0 && b > 0) {
      const X = h * toPt;
      const Y = (v - a) * toPt;
      out.push(`<rect x="${r(X)}" y="${r(Y)}" width="${r(b * toPt)}" height="${r(a * toPt)}"/>`);
      box(X, Y, X + b * toPt, Y + a * toPt);
      rules++;
    }
  };

  for (;;) {
    if (p >= dvi.length) throw new Error("DVI ended without post");
    const o = dvi[p++]!;
    if (o < 128) {
      h += drawChar(o);
      continue;
    }
    if (o >= 171 && o <= 234) {
      f = fonts.get(o - 171);
      continue;
    }
    switch (o) {
      case 128:
      case 129:
      case 130:
      case 131:
        h += drawChar(u(o - 127));
        break;
      case 133:
      case 134:
      case 135:
      case 136:
        drawChar(u(o - 132));
        break;
      case 132: {
        const a = s(4);
        const b = s(4);
        drawRule(a, b);
        h += b;
        break;
      }
      case 137: {
        const a = s(4);
        const b = s(4);
        drawRule(a, b);
        break;
      }
      case 138:
        break;
      case 139:
        p += 44;
        page++;
        h = v = w = x = y = z = 0;
        stack.length = 0;
        f = undefined;
        break;
      case 140:
        break;
      case 141:
        stack.push([h, v, w, x, y, z]);
        break;
      case 142: {
        const top = stack.pop();
        if (!top) throw new Error("DVI pop with an empty stack");
        [h, v, w, x, y, z] = top as [number, number, number, number, number, number];
        break;
      }
      case 143:
      case 144:
      case 145:
      case 146:
        h += s(o - 142);
        break;
      case 147:
        h += w;
        break;
      case 148:
      case 149:
      case 150:
      case 151:
        w = s(o - 147);
        h += w;
        break;
      case 152:
        h += x;
        break;
      case 153:
      case 154:
      case 155:
      case 156:
        x = s(o - 152);
        h += x;
        break;
      case 157:
      case 158:
      case 159:
      case 160:
        v += s(o - 156);
        break;
      case 161:
        v += y;
        break;
      case 162:
      case 163:
      case 164:
      case 165:
        y = s(o - 161);
        v += y;
        break;
      case 166:
        v += z;
        break;
      case 167:
      case 168:
      case 169:
      case 170:
        z = s(o - 166);
        v += z;
        break;
      case 235:
      case 236:
      case 237:
      case 238:
        f = fonts.get(u(o - 234));
        break;
      case 239:
      case 240:
      case 241:
      case 242: {
        const k = u(o - 238);
        let text = "";
        for (let i = 0; i < k; i++) text += String.fromCharCode(dvi[p + i]!);
        p += k;
        specials++;
        // opt.special reads one \special at the current position (in SVG units) and can
        // give SVG text for the page and a box [x0, y0, x1, y1] for the bounds
        const res = page === want && opt.special ? opt.special(text, { x: h * toPt, y: v * toPt, unit: opt.unitPerPt ?? 1 }) : null;
        if (res?.svg) out.push(res.svg);
        if (res?.box) box(res.box[0]!, res.box[1]!, res.box[2]!, res.box[3]!);
        break;
      }
      case 243:
      case 244:
      case 245:
      case 246:
        fontDef(u(o - 242));
        break;
      case 248: {
        const m = opt.margin ?? 1;
        if (!Number.isFinite(minX)) {
          minX = minY = 0;
          maxX = maxY = 1;
        }
        const vb = [minX - m, minY - m, maxX - minX + 2 * m, maxY - minY + 2 * m].map(r).join(" ");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${r(maxX - minX + 2 * m)}pt" height="${r(maxY - minY + 2 * m)}pt">\n${out.join("\n")}\n</svg>\n`;
        return { svg, glyphs, rules, specials, pages: page, missing: [...missing], fonts: [...loaded.keys()] };
      }
      default:
        throw new Error(`DVI opcode ${o} at byte ${p - 1}`);
    }
  }
}
