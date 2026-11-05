/**
 * Byte builders for the tests of the TeX stage: a TFM, a Type 1 font in PFB form (with the eexec and charstring
 * encryption), and a DVI file. The builders follow the published formats, so a test holds no binary file.
 */

const latin1 = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0) & 255);

/** The Type 1 encryption of Adobe Type 1 Font Format, chapter 7. `lead` is the number of random lead bytes. */
export function t1Encrypt(plain: Uint8Array | number[], r: number, lead: number): Uint8Array {
  const input = [...new Array<number>(lead).fill(0), ...plain];
  const out = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const c = input[i]! ^ (r >> 8);
    out[i] = c;
    r = ((c + r) * 52845 + 22719) & 0xffff;
  }
  return out;
}

/** One Type 1 charstring number. */
export function csNumber(v: number): number[] {
  if (v >= -107 && v <= 107) return [v + 139];
  if (v >= 108 && v <= 1131) {
    const w = v - 108;
    return [247 + (w >> 8), w & 255];
  }
  if (v >= -1131 && v <= -108) {
    const w = -v - 108;
    return [251 + (w >> 8), w & 255];
  }
  return [255, (v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const OPS: Record<string, number[]> = {
  hstem: [1], vstem: [3], vmoveto: [4], rlineto: [5], hlineto: [6], vlineto: [7], rrcurveto: [8], closepath: [9],
  callsubr: [10], return: [11], hsbw: [13], endchar: [14], rmoveto: [21], hmoveto: [22], vhcurveto: [30], hvcurveto: [31],
  dotsection: [12, 0], seac: [12, 6], sbw: [12, 7], div: [12, 12], callothersubr: [12, 16], pop: [12, 17], setcurrentpoint: [12, 33],
};

/** Assembles a charstring from numbers and operator names. */
export function charstring(...items: (number | string)[]): number[] {
  const out: number[] = [];
  for (const it of items) {
    if (typeof it === "number") out.push(...csNumber(it));
    else {
      const op = OPS[it];
      if (op === undefined) throw new Error(`unknown charstring operator ${it}`);
      out.push(...op);
    }
  }
  return out;
}

/** The inputs of one test font. */
export interface TestFont {
  name?: string;
  /** The code to glyph name map of the Encoding array. */
  encoding?: Record<number, string>;
  /** Use `/Encoding StandardEncoding def`. */
  standard?: boolean;
  /** The charstrings by glyph name (plain, before encryption). */
  glyphs: Record<string, number[]>;
  /** The subrs by number (plain, before encryption). */
  subrs?: Record<number, number[]>;
  lenIV?: number;
  fontBBox?: string;
  /** Leave out the FontMatrix and FontBBox lines. */
  bare?: boolean;
  /** End the private part right after the last charstring (`exact`), or one byte before the end of it (`short`). */
  cut?: "exact" | "short";
  /** Leave the end marker (the segment of type 3) out of the PFB. */
  noTrailer?: boolean;
  /** A PFA (hex) file instead of a PFB. */
  pfa?: boolean;
}

/** Builds a Type 1 font as a PFB (or PFA) byte array. */
export function buildType1(f: TestFont): Uint8Array {
  const lenIV = f.lenIV ?? 4;
  const encLine = f.standard
    ? "/Encoding StandardEncoding def\n"
    : "/Encoding 256 array\n0 1 255 {1 index exch /.notdef put} for\n" +
      Object.entries(f.encoding ?? {}).map(([c, n]) => `dup ${c} /${n} put\n`).join("") +
      "readonly def\n";
  const clear =
    "%!PS-AdobeFont-1.0: Test 1.0\n" +
    `/FontName /${f.name ?? "TestFont"} def\n` +
    (f.bare ? "" : "/FontMatrix [0.001 0 0 0.001 0 0] readonly def\n") +
    (f.bare ? "" : `/FontBBox {${f.fontBBox ?? "-10 -20 900 800"}} readonly def\n`) +
    encLine +
    "currentdict end\ncurrentfile eexec\n";
  const enc = (b: number[]): number[] => (lenIV < 0 ? b : [...t1Encrypt(b, 4330, lenIV)]);
  const priv: number[] = [];
  const text = (s: string): void => void priv.push(...latin1(s));
  text("dup /Private 8 dict dup begin\n/RD {string currentfile exch readstring pop} executeonly def\n");
  text("/ND {noaccess def} executeonly def\n/NP {noaccess put} executeonly def\n");
  if (f.lenIV !== undefined) text(`/lenIV ${f.lenIV} def\n`);
  const subrs = f.subrs ?? {};
  const subrKeys = Object.keys(subrs).map(Number);
  if (subrKeys.length > 0) {
    text(`/Subrs ${Math.max(...subrKeys) + 1} array\n`);
    for (const k of subrKeys) {
      const b = enc(subrs[k]!);
      text(`dup ${k} ${b.length} RD `);
      priv.push(...b);
      text(" NP\n");
    }
    text("ND\n");
  }
  const names = Object.keys(f.glyphs);
  let lastEnd = 0;
  text(`2 index /CharStrings ${names.length} dict dup begin\n`);
  for (const n of names) {
    const b = enc(f.glyphs[n]!);
    text(`/${n} ${b.length} RD `);
    priv.push(...b);
    lastEnd = priv.length;
    text(" ND\n");
  }
  if (f.cut !== undefined) priv.length = lastEnd - (f.cut === "short" ? 1 : 0);
  else text("end\nend\nreadonly put\nnoaccess put\ndup /FontName get exch definefont pop\nmark currentfile closefile\n");
  const encrypted = t1Encrypt(priv, 55665, 4);
  if (f.pfa) {
    const hex = Array.from(encrypted, (b) => b.toString(16).padStart(2, "0")).join("");
    return Uint8Array.from(latin1(clear + hex + "\n"));
  }
  const seg = (type: number, body: number[] | Uint8Array): number[] => [
    0x80, type, body.length & 255, (body.length >> 8) & 255, (body.length >> 16) & 255, (body.length >>> 24) & 255, ...body,
  ];
  return Uint8Array.from([...seg(1, latin1(clear)), ...seg(2, encrypted), ...seg(1, latin1("0000\ncleartomark\n")), ...(f.noTrailer ? [] : [0x80, 3])]);
}

/** Builds a TFM with the given design size (points) and widths (design units) by character code. */
export function buildTfm(designSize: number, widths: Record<number, number>): Uint8Array {
  const codes = Object.keys(widths).map(Number).sort((a, b) => a - b);
  const bc = codes[0]!;
  const ec = codes[codes.length - 1]!;
  const distinct = [...new Set(codes.map((c) => widths[c]!))];
  const nw = distinct.length + 1;
  const lh = 2;
  const lf = 6 + lh + (ec - bc + 1) + nw;
  const out = new Uint8Array(lf * 4);
  const dv = new DataView(out.buffer);
  [lf, lh, bc, ec, nw, 1, 1, 0, 0, 0, 0, 0].forEach((v, i) => dv.setUint16(2 * i, v, false));
  dv.setUint32(24, 0xdeadbeef, false); // header[0], the checksum
  dv.setInt32(28, Math.round(designSize * 2 ** 20), false); // header[1], the design size
  const charBase = 6 + lh;
  const widthBase = charBase + (ec - bc + 1);
  for (const c of codes) dv.setUint32(4 * (charBase + c - bc), (distinct.indexOf(widths[c]!) + 1) << 24, false);
  distinct.forEach((w, i) => dv.setInt32(4 * (widthBase + 1 + i), Math.round(w * 2 ** 20), false));
  return out;
}

/** A DVI writer for the operators that a test needs. */
export class DviBuilder {
  readonly bytes: number[] = [];
  private u(n: number, v: number): this {
    for (let i = n - 1; i >= 0; i--) this.bytes.push(Math.floor(v / 2 ** (8 * i)) & 255);
    return this;
  }
  private s(n: number, v: number): this {
    return this.u(n, v < 0 ? v + 2 ** (8 * n) : v);
  }
  /** `pre`: the default unit is one point (num/den times 72.27/254000 is 1); `mag` is the magnification. */
  pre(mag = 1000, comment = "test"): this {
    this.bytes.push(247, 2);
    this.u(4, 25400000).u(4, 7227).u(4, mag).u(1, comment.length);
    this.bytes.push(...latin1(comment));
    return this;
  }
  bop(): this {
    this.bytes.push(139);
    for (let i = 0; i < 10; i++) this.u(4, i === 0 ? 1 : 0);
    return this.u(4, 0xffffffff);
  }
  eop(): this { this.bytes.push(140); return this; }
  post(): this { this.bytes.push(248); return this; }
  /** `fnt_def1` and `fnt_num` for font number k. `size` is in sp. */
  font(k: number, name: string, size: number): this {
    this.bytes.push(243);
    this.u(1, k).u(4, 0).u(4, size).u(4, size).u(1, 0).u(1, name.length);
    this.bytes.push(...latin1(name));
    return this.fontNum(k);
  }
  fontNum(k: number): this {
    if (k < 64) this.bytes.push(171 + k);
    else {
      this.bytes.push(235);
      this.u(1, k);
    }
    return this;
  }
  fontNumLong(k: number, n: 1 | 2 | 3 | 4): this { this.bytes.push(234 + n); return this.u(n, k); }
  set(c: number): this { if (c < 128) this.bytes.push(c); else this.bytes.push(128, c); return this; }
  setN(c: number, n: 1 | 2 | 3 | 4): this { this.bytes.push(127 + n); return this.u(n, c); }
  put(c: number): this { this.bytes.push(133); return this.u(1, c); }
  putN(c: number, n: 1 | 2 | 3 | 4): this { this.bytes.push(132 + n); return this.u(n, c); }
  setRule(a: number, b: number): this { this.bytes.push(132); return this.s(4, a).s(4, b); }
  putRule(a: number, b: number): this { this.bytes.push(137); return this.s(4, a).s(4, b); }
  push(): this { this.bytes.push(141); return this; }
  pop(): this { this.bytes.push(142); return this; }
  right(n: 1 | 2 | 3 | 4, v: number): this { this.bytes.push(142 + n); return this.s(n, v); }
  w(n: 0 | 1 | 2 | 3 | 4, v = 0): this { this.bytes.push(147 + n); return n === 0 ? this : this.s(n, v); }
  x(n: 0 | 1 | 2 | 3 | 4, v = 0): this { this.bytes.push(152 + n); return n === 0 ? this : this.s(n, v); }
  down(n: 1 | 2 | 3 | 4, v: number): this { this.bytes.push(156 + n); return this.s(n, v); }
  y(n: 0 | 1 | 2 | 3 | 4, v = 0): this { this.bytes.push(161 + n); return n === 0 ? this : this.s(n, v); }
  z(n: 0 | 1 | 2 | 3 | 4, v = 0): this { this.bytes.push(166 + n); return n === 0 ? this : this.s(n, v); }
  special(text: string): this {
    this.bytes.push(239);
    this.u(1, text.length);
    this.bytes.push(...latin1(text));
    return this;
  }
  nop(): this { this.bytes.push(138); return this; }
  done(): Uint8Array { return Uint8Array.from(this.bytes); }
}
