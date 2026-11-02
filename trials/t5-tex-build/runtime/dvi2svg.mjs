// DVI to SVG of the trial. Each glyph becomes one <path> with the outline of
// its Type 1 font; each rule becomes a <rect>. The format of the DVI file:
// dvitype.web, part 3. Units: the SVG unit is the TeX point.
import { readTfm } from './tfm.mjs';
import { readType1 } from './type1.mjs';

const r = (v) => String(Math.round(v * 1000) / 1000);

/**
 * @param {Uint8Array} dvi
 * @param {(name:string)=>{tfm:Uint8Array, pfb:Uint8Array|null}|null} fontFiles gives the files of a font;
 *   a font with no PFB keeps its TFM advances, and each of its glyphs goes in the missing list
 * @param {{page?:number, margin?:number}} [opt]
 */
export function dviToSvg(dvi, fontFiles, opt = {}) {
  let p = 0;
  const u = (n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + dvi[p++]; return v; };
  const s = (n) => { let v = u(n); const lim = 2 ** (8 * n - 1); return v >= lim ? v - 2 * lim : v; };
  if (dvi[0] !== 247 || dvi[1] !== 2) throw new Error('not a DVI file');
  p = 2;
  const num = u(4), den = u(4), mag = u(4);
  p += 1 + dvi[14];
  const toPt = (num / den) * (mag / 1000) * (72.27 / 254000);
  const fonts = new Map();
  const loaded = new Map();
  const missing = new Set();
  const out = [];
  let glyphs = 0, rules = 0, specials = 0, page = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const box = (x0, y0, x1, y1) => { minX = Math.min(minX, x0); minY = Math.min(minY, y0); maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1); };
  const want = opt.page ?? 1;
  let h = 0, v = 0, w = 0, x = 0, y = 0, z = 0, f = null;
  const stack = [];

  const fontDef = (k) => {
    const c = u(4), sz = u(4), ds = u(4);
    const a = u(1), l = u(1);
    let name = '';
    for (let i = 0; i < a + l; i++) name += String.fromCharCode(dvi[p++]);
    if (fonts.has(k)) return;
    let ld = loaded.get(name);
    if (!ld) {
      const files = fontFiles(name);
      if (!files) { missing.add(name); ld = null; }
      else ld = { tfm: readTfm(files.tfm), t1: files.pfb ? readType1(files.pfb) : null };
      loaded.set(name, ld);
    }
    fonts.set(k, { name, size: sz, checksum: c, design: ds, ld });
  };
  const charWidth = (fnt, c) => {
    const wd = fnt.ld?.tfm.widths.get(c);
    if (wd === undefined) throw new Error(`no width for char ${c} in ${fnt.name}`);
    return wd * fnt.size; // TFM width times the font size, in DVI units
  };
  const drawChar = (c) => {
    const fnt = f;
    if (!fnt) throw new Error('char before a font');
    const adv = fnt.ld ? charWidth(fnt, c) : 0;
    if (page === want && fnt.ld) {
      const g = fnt.ld.t1?.glyph(c);
      if (!g) missing.add(`${fnt.name}:${c}`);
      else if (g.d) {
        const k = (fnt.size * toPt) / 1000;
        const X = h * toPt, Y = v * toPt;
        const ks = Number(k.toFixed(6));
        out.push(`<path transform="translate(${r(X)} ${r(Y)}) scale(${ks} ${-ks})" d="${g.d}"/>`);
        box(X + g.bbox[0] * k, Y - g.bbox[3] * k, X + g.bbox[2] * k, Y - g.bbox[1] * k);
        glyphs++;
      }
    }
    return adv;
  };
  const drawRule = (a, b) => {
    if (page === want && a > 0 && b > 0) {
      const X = h * toPt, Y = (v - a) * toPt;
      out.push(`<rect x="${r(X)}" y="${r(Y)}" width="${r(b * toPt)}" height="${r(a * toPt)}"/>`);
      box(X, Y, X + b * toPt, Y + a * toPt);
      rules++;
    }
  };

  for (;;) {
    if (p >= dvi.length) throw new Error('DVI ended without post');
    const o = dvi[p++];
    if (o < 128) { h += drawChar(o); continue; }
    if (o >= 171 && o <= 234) { f = fonts.get(o - 171); continue; }
    switch (o) {
      case 128: case 129: case 130: case 131: { const c = u(o - 127); h += drawChar(c); break; }
      case 133: case 134: case 135: case 136: { const c = u(o - 132); drawChar(c); break; }
      case 132: { const a = s(4), b = s(4); drawRule(a, b); h += b; break; }
      case 137: { const a = s(4), b = s(4); drawRule(a, b); break; }
      case 138: break;
      case 139: p += 44; page++; h = v = w = x = y = z = 0; stack.length = 0; f = null; break;
      case 140: break;
      case 141: stack.push([h, v, w, x, y, z]); break;
      case 142: [h, v, w, x, y, z] = stack.pop(); break;
      case 143: case 144: case 145: case 146: h += s(o - 142); break;
      case 147: h += w; break;
      case 148: case 149: case 150: case 151: w = s(o - 147); h += w; break;
      case 152: h += x; break;
      case 153: case 154: case 155: case 156: x = s(o - 152); h += x; break;
      case 157: case 158: case 159: case 160: v += s(o - 156); break;
      case 161: v += y; break;
      case 162: case 163: case 164: case 165: y = s(o - 161); v += y; break;
      case 166: v += z; break;
      case 167: case 168: case 169: case 170: z = s(o - 166); v += z; break;
      case 235: case 236: case 237: case 238: f = fonts.get(u(o - 234)); break;
      case 239: case 240: case 241: case 242: { const k = u(o - 238); p += k; specials++; break; }
      case 243: case 244: case 245: case 246: fontDef(u(o - 242)); break;
      case 248: {
        const m = opt.margin ?? 1;
        if (!Number.isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
        const vb = [minX - m, minY - m, maxX - minX + 2 * m, maxY - minY + 2 * m].map(r).join(' ');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${r(maxX - minX + 2 * m)}pt" height="${r(maxY - minY + 2 * m)}pt">\n${out.join('\n')}\n</svg>\n`;
        return { svg, glyphs, rules, specials, pages: page, missing: [...missing], fonts: [...loaded.keys()] };
      }
      default: throw new Error(`DVI opcode ${o} at byte ${p - 1}`);
    }
  }
}
