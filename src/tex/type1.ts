// Type 1 font reader: PFB (or PFA) to SVG path data for each glyph.
// The format: Adobe Type 1 Font Format (1990), chapters 6 to 8 (charstrings,
// eexec encryption, flex and hint replacement through the othersubrs).
// The path is in font units with the y axis up.

const STANDARD: (string | undefined)[] = (() => {
  const e = new Array<string | undefined>(256);
  const put = (from: number, names: string): void => {
    names.split(" ").forEach((n, i) => {
      if (n !== ".") e[from + i] = n;
    });
  };
  put(32, "space exclam quotedbl numbersign dollar percent ampersand quoteright parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore quoteleft a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde");
  put(161, "exclamdown cent sterling fraction yen florin section currency quotesingle quotedblleft guillemotleft guilsinglleft guilsinglright fi fl . endash dagger daggerdbl periodcentered . paragraph bullet quotesinglbase quotedblbase quotedblright guillemotright ellipsis perthousand . questiondown . grave acute circumflex tilde macron breve dotaccent dieresis . ring cedilla . hungarumlaut ogonek caron emdash");
  put(225, "AE . ordfeminine . . . . Lslash Oslash OE ordmasculine . . . . . ae . . . dotlessi . . lslash oslash oe germandbls");
  return e;
})();

/** The outline and the metrics of one glyph. */
export interface Type1Glyph {
  /** The glyph name. */
  name: string;
  /** The advance width in font units. */
  advance: number;
  /** The SVG path data, in font units with the y axis up. Empty for a glyph with no outline. */
  d: string;
  /** The box `[minX, minY, maxX, maxY]` of the outline and its control points. */
  bbox: [number, number, number, number];
}

/** A Type 1 font after reading. */
export interface Type1Font {
  fontName: string;
  fontBBox: number[];
  fontMatrix: number[];
  /** The glyph name of each character code. */
  encoding: (string | undefined)[];
  /** The glyph of a character code, or `null` when the code has no glyph. */
  glyph(code: number): Type1Glyph | null;
}

const latin1 = (b: Uint8Array, from = 0, to = b.length): string => {
  let s = "";
  for (let i = from; i < to; i += 8192) s += String.fromCharCode(...b.subarray(i, Math.min(to, i + 8192)));
  return s;
};

/**
 * Decrypts Type 1 data with the cipher of the font format: `c1 = 52845`, `c2 = 22719`.
 * Use `r = 55665` for the eexec section and `r = 4330` for a charstring.
 * The function drops the first `skip` plain bytes, which are the random lead bytes.
 */
export function decryptType1(b: Uint8Array, r: number, skip: number): Uint8Array {
  const out = new Uint8Array(Math.max(0, b.length - skip));
  for (let i = 0; i < b.length; i++) {
    const c = b[i]!;
    const p = c ^ (r >> 8);
    r = ((c + r) * 52845 + 22719) & 0xffff;
    if (i >= skip) out[i - skip] = p;
  }
  return out;
}

/** Splits a PFB into the cleartext and the encrypted bytes; a PFA has hex digits after "eexec". */
function segments(pfb: Uint8Array): { clear: string; enc: Uint8Array } {
  if (pfb[0] !== 0x80) {
    const text = latin1(pfb);
    const k = text.indexOf("eexec");
    if (k < 0) throw new Error("type1: no eexec section");
    const hex = text.slice(k + 5).replace(/[^0-9a-fA-F]/g, "");
    const bin = new Uint8Array(hex.length >> 1);
    for (let i = 0; i < bin.length; i++) bin[i] = parseInt(hex.substr(2 * i, 2), 16);
    return { clear: text.slice(0, k + 5), enc: bin };
  }
  let p = 0;
  let clear = "";
  const parts: Uint8Array[] = [];
  while (p < pfb.length) {
    if (pfb[p] !== 0x80) throw new Error(`type1: bad PFB segment at byte ${p}`);
    const type = pfb[p + 1];
    if (type === 3) break;
    const n = pfb[p + 2]! | (pfb[p + 3]! << 8) | (pfb[p + 4]! << 16) | (pfb[p + 5]! << 24);
    if (p + 6 + n > pfb.length) throw new Error("type1: PFB segment beyond the file");
    const body = pfb.subarray(p + 6, p + 6 + n);
    if (type === 1) clear += latin1(body);
    else if (type === 2) parts.push(body);
    else throw new Error(`type1: PFB segment type ${type}`);
    p += 6 + n;
  }
  const enc = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const q of parts) {
    enc.set(q, o);
    o += q.length;
  }
  return { clear, enc };
}

/** Reads the binary entries "<n> RD <n bytes>" that follow each match of `head`. */
function binaryEntries(priv: Uint8Array, text: string, head: RegExp, max: number): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  head.lastIndex = 0;
  for (let m; (m = head.exec(text)) && out.size < max; ) {
    const n = Number(m[2]);
    const start = m.index + m[0].length;
    if (start + n > priv.length) throw new Error(`type1: entry ${m[1]} beyond the private part`);
    out.set(m[1]!, priv.subarray(start, start + n));
    head.lastIndex = start + n;
  }
  return out;
}

const r2 = (v: number): string => String(Math.round(v * 100) / 100);

/**
 * Reads a Type 1 font from the bytes of a PFB or PFA file. The function decrypts the private part at once.
 * It runs the charstring of a glyph on the first request for it and keeps the result.
 */
export function readType1(pfb: Uint8Array): Type1Font {
  const { clear, enc } = segments(pfb);
  const priv = decryptType1(enc, 55665, 4);
  const text = latin1(priv);
  const fontName = /\/FontName\s*\/(\S+)/.exec(clear)?.[1];
  if (!fontName) throw new Error("type1: no /FontName");
  const nums = (re: RegExp): number[] | null => {
    const m = re.exec(clear);
    return m ? m[1]!.trim().split(/\s+/).map(Number) : null;
  };
  const fontBBox = nums(/\/FontBBox\s*[{[]([^}\]]*)[}\]]/) ?? [0, 0, 0, 0];
  const fontMatrix = nums(/\/FontMatrix\s*\[([^\]]*)\]/) ?? [0.001, 0, 0, 0.001, 0, 0];
  let encoding: (string | undefined)[];
  if (/\/Encoding\s+StandardEncoding\s+def/.test(clear)) encoding = STANDARD.slice();
  else {
    encoding = new Array<string | undefined>(256);
    for (const m of clear.matchAll(/dup\s+(\d+)\s*\/(\S+)\s+put/g)) encoding[Number(m[1])] = m[2];
  }
  const lenIV = Number(/\/lenIV\s+(-?\d+)/.exec(text)?.[1] ?? 4);
  const subrStart = text.search(/\/Subrs\s+\d+\s+array/);
  const csStart = text.search(/\/CharStrings\s+\d+\s+dict/);
  if (csStart < 0) throw new Error("type1: no /CharStrings");
  const subrs = new Map<number, Uint8Array>();
  if (subrStart >= 0) {
    const head = /dup\s+(\d+)\s+(\d+)\s+(?:RD|-\|) /g;
    head.lastIndex = subrStart;
    const count = Number(/\/Subrs\s+(\d+)/.exec(text.slice(subrStart))![1]);
    for (const [k, v] of binaryEntries(priv, text, head, count)) subrs.set(Number(k), v);
  }
  const head = /\/([^\s/]+)\s+(\d+)\s+(?:RD|-\|) /g;
  head.lastIndex = csStart;
  const csCount = Number(/\/CharStrings\s+(\d+)/.exec(text.slice(csStart))![1]);
  const charStrings = binaryEntries(priv, text, head, csCount);
  const plain = (b: Uint8Array): Uint8Array => (lenIV < 0 ? b : decryptType1(b, 4330, lenIV));

  const cache = new Map<number, Type1Glyph | null>();

  function run(name: string): Type1Glyph | null {
    const cs = charStrings.get(name);
    if (!cs) return null;
    const d: string[] = [];
    let x = 0;
    let y = 0;
    let open = false;
    let pendingMove = false;
    let advance = 0;
    let sbx = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const pt = (px: number, py: number): string => {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
      return `${r2(px)} ${r2(py)}`;
    };
    const close = (): void => {
      if (open) {
        d.push("Z");
        open = false;
      }
    };
    const moveTo = (nx: number, ny: number): void => {
      close();
      x = nx;
      y = ny;
      pendingMove = true;
    };
    const start = (): void => {
      if (pendingMove || !open) {
        d.push(`M ${pt(x, y)}`);
        pendingMove = false;
        open = true;
      }
    };
    const lineTo = (nx: number, ny: number): void => {
      start();
      x = nx;
      y = ny;
      d.push(`L ${pt(x, y)}`);
    };
    const curveTo = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void => {
      start();
      d.push(`C ${pt(x1, y1)} ${pt(x2, y2)} ${pt(x3, y3)}`);
      x = x3;
      y = y3;
    };
    let flex: [number, number][] | null = null;
    const ps: number[] = [];

    const exec = (code: Uint8Array, ox: number, oy: number, depth: number, st: number[]): "end" | "done" | "return" => {
      if (depth > 20) throw new Error(`type1 ${name}: subr nesting too deep`);
      const b = plain(code);
      for (let i = 0; i < b.length; ) {
        const v = b[i++]!;
        if (v >= 32) {
          if (v <= 246) st.push(v - 139);
          else if (v <= 250) st.push((v - 247) * 256 + b[i++]! + 108);
          else if (v <= 254) st.push(-(v - 251) * 256 - b[i++]! - 108);
          else {
            st.push((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!);
            i += 4;
          }
          continue;
        }
        const rmove = (dx: number, dy: number): void => {
          if (flex) {
            // the flex points run from the point before the flex; the current point stays there until the flex ends
            const last = flex[flex.length - 1] ?? [x, y];
            flex.push([last[0] + dx, last[1] + dy]);
          } else moveTo(x + dx, y + dy);
        };
        switch (v) {
          case 13: // hsbw
            sbx = st[0]!;
            advance = st[1]!;
            x = ox + st[0]!;
            y = oy;
            st.length = 0;
            break;
          case 21:
            rmove(st[0]!, st[1]!);
            st.length = 0;
            break;
          case 22:
            rmove(st[0]!, 0);
            st.length = 0;
            break;
          case 4:
            rmove(0, st[0]!);
            st.length = 0;
            break;
          case 5:
            lineTo(x + st[0]!, y + st[1]!);
            st.length = 0;
            break;
          case 6:
            lineTo(x + st[0]!, y);
            st.length = 0;
            break;
          case 7:
            lineTo(x, y + st[0]!);
            st.length = 0;
            break;
          case 8: {
            const [a, b2, c, e, f, g] = st as [number, number, number, number, number, number];
            curveTo(x + a, y + b2, x + a + c, y + b2 + e, x + a + c + f, y + b2 + e + g);
            st.length = 0;
            break;
          }
          case 30: {
            const [a, b2, c, e] = st as [number, number, number, number];
            curveTo(x, y + a, x + b2, y + a + c, x + b2 + e, y + a + c);
            st.length = 0;
            break;
          }
          case 31: {
            const [a, b2, c, e] = st as [number, number, number, number];
            curveTo(x + a, y, x + a + b2, y + c, x + a + b2, y + c + e);
            st.length = 0;
            break;
          }
          case 9:
            close();
            st.length = 0;
            break;
          case 14:
            close();
            st.length = 0;
            return "end";
          case 1:
          case 3: // hstem, vstem
            st.length = 0;
            break;
          case 10: {
            const n = st.pop()!;
            const s = subrs.get(n);
            if (!s) throw new Error(`type1 ${name}: no subr ${n}`);
            if (exec(s, ox, oy, depth + 1, st) === "end") return "end";
            break;
          }
          case 11:
            return "return";
          case 12: {
            const w = b[i++];
            switch (w) {
              case 0:
              case 1:
              case 2: // dotsection, vstem3, hstem3
                st.length = 0;
                break;
              case 7: // sbw
                sbx = st[0]!;
                advance = st[2]!;
                x = ox + st[0]!;
                y = oy + st[1]!;
                st.length = 0;
                break;
              case 12: {
                // div
                const q = st.pop()!;
                const p2 = st.pop()!;
                st.push(p2 / q);
                break;
              }
              case 16: {
                // callothersubr
                const other = st.pop()!;
                const n = st.pop()!;
                const args = st.splice(st.length - n, n);
                if (other === 1) flex = [];
                else if (other === 0) {
                  if (!flex || flex.length < 7) throw new Error(`type1 ${name}: flex with ${flex?.length ?? 0} points`);
                  const p = flex;
                  flex = null;
                  curveTo(p[1]![0], p[1]![1], p[2]![0], p[2]![1], p[3]![0], p[3]![1]);
                  curveTo(p[4]![0], p[4]![1], p[5]![0], p[5]![1], p[6]![0], p[6]![1]);
                  ps.push(args[2]!, args[1]!);
                } else if (other === 2) {
                  // flex point marker
                } else for (let k = args.length - 1; k >= 0; k--) ps.push(args[k]!); // 3 (hint replacement) and others
                break;
              }
              case 17: // pop
                st.push(ps.pop()!);
                break;
              case 33: // setcurrentpoint
                x = ox + st[0]!;
                y = oy + st[1]!;
                st.length = 0;
                break;
              case 6: {
                // seac
                const [asb, adx, ady, bchar, achar] = st as [number, number, number, number, number];
                st.length = 0;
                const bn = STANDARD[bchar];
                const an = STANDARD[achar];
                const bs = bn === undefined ? undefined : charStrings.get(bn);
                const as = an === undefined ? undefined : charStrings.get(an);
                if (!bs || !as) throw new Error(`type1 ${name}: seac parts ${bn} ${an} missing`);
                const keep = { advance, sbx };
                exec(bs, ox, oy, depth + 1, []);
                close();
                exec(as, ox + adx - asb + keep.sbx, oy + ady, depth + 1, []);
                close();
                advance = keep.advance;
                sbx = keep.sbx;
                return "end";
              }
              default:
                throw new Error(`type1 ${name}: unknown command 12 ${w}`);
            }
            break;
          }
          default:
            throw new Error(`type1 ${name}: unknown command ${v}`);
        }
      }
      return "done";
    };
    exec(cs, 0, 0, 0, []);
    close();
    const empty = d.length === 0;
    return { name, advance, d: d.join(" "), bbox: empty ? [0, 0, 0, 0] : [minX, minY, maxX, maxY] };
  }

  return {
    fontName,
    fontBBox,
    fontMatrix,
    encoding,
    glyph(code: number): Type1Glyph | null {
      const hit = cache.get(code);
      if (hit !== undefined) return hit;
      const name = encoding[code];
      const g = name === undefined ? null : run(name);
      cache.set(code, g);
      return g;
    },
  };
}
