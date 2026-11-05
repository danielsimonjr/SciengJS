import { describe, expect, test } from "bun:test";
import { decryptType1, readType1 } from "../../src/tex/type1.ts";
import { returned } from "../support/rejections.ts";
import { buildType1, charstring as cs, csNumber, t1Encrypt, type TestFont } from "../support/tex-fixtures.ts";

const ENCODING = { 65: "A", 66: "B", 67: "C", 68: "D", 69: "E", 70: "F", 71: "G", 72: "Aacute", 73: "acute", 74: "empty", 75: "K", 76: "L", 77: "N", 78: "O", 79: "P", 80: "Q", 81: "Agrave" };

const GLYPHS: TestFont["glyphs"] = {
  A: cs(0, 500, "hsbw", 100, "hmoveto", 200, "hlineto", 300, "vlineto", -200, "hlineto", "closepath", "endchar"),
  B: cs(
    10, 600, "hsbw", 20, 30, "rmoveto", 10, 20, "rlineto", 5, "vlineto", 1, 2, 3, 4, 5, 6, "rrcurveto", "closepath",
    100, "vmoveto", 10, 20, 30, 40, "vhcurveto", 5, 6, 7, 8, "hvcurveto", 0, "callsubr", "endchar",
  ),
  C: cs(0, 1132, "hsbw", 108, -108, "rmoveto", 1131, -1131, "rlineto", -107, 107, "rlineto", 100000, -100000, "rlineto", 107, -107, "rlineto", "endchar"),
  D: cs(
    1, 2, "hstem", 3, 4, "vstem", "dotsection", 0, 500, "hsbw", 10, 2, "div", 0, "rmoveto", 20, 4, "div", 0, "rlineto", "closepath", "endchar",
  ),
  E: cs(5, 7, 600, 0, "sbw", 10, 10, "rmoveto", 1, 0, "rlineto", "endchar"),
  F: cs(
    0, 500, "hsbw", 0, 0, "rmoveto", 0, 1, "callothersubr",
    50, 0, "rmoveto", 0, 2, "callothersubr", -50, 10, "rmoveto", 0, 2, "callothersubr", 20, 5, "rmoveto", 0, 2, "callothersubr",
    30, 0, "rmoveto", 0, 2, "callothersubr", 10, 0, "rmoveto", 0, 2, "callothersubr", 20, -5, "rmoveto", 0, 2, "callothersubr",
    30, -10, "rmoveto", 0, 2, "callothersubr", 50, 110, 0, 3, 0, "callothersubr", "pop", "pop", "setcurrentpoint", 10, "hlineto", "endchar",
  ),
  G: cs(0, 500, "hsbw", 0, 0, "rmoveto", 1, 1, 3, "callothersubr", "pop", "callsubr", "closepath", "endchar"),
  Aacute: cs(20, 500, "hsbw", 15, 30, 40, 65, 194, "seac"),
  acute: cs(0, 300, "hsbw", 10, "hmoveto", 5, "hlineto", "closepath", "endchar"),
  empty: cs(7, 321, "hsbw", "endchar"),
  K: cs(0, 500, "hsbw", 10, 10, "rmoveto", 10, 0, "rlineto", "closepath", 5, 0, "rlineto", "endchar"),
  L: cs(0, 500, "hsbw", 5, 8, "div", 0, "rmoveto", 1, 0, "rlineto", "endchar"),
};
GLYPHS.N = cs(0, 500, "hsbw", 98, 98, "hstem", 97, 97, "vstem", 10, 0, "rmoveto", 5, 0, "rlineto", "endchar");
GLYPHS.O = cs(0, 500, "hsbw", 96, 96, "dotsection", 10, 0, "rmoveto", 5, 0, "rlineto", "endchar");
GLYPHS.P = cs(0, 500, "hsbw", 0, 0, "rmoveto", 2, "callsubr", 100, 100, "rlineto", "endchar");
GLYPHS.Q = cs(0, 500, "hsbw", 0, 0, "rmoveto", 1, "callsubr", 5, "hlineto", "endchar");
GLYPHS.Agrave = cs(20, 500, "hsbw", 15, 30, 40, 65, 193, "seac");
GLYPHS.grave = cs(0, 300, "hsbw", 10, 0, "setcurrentpoint", 5, "hlineto", "endchar");
const SUBRS = { 0: cs(-20, "hlineto", "return"), 1: cs(10, "hlineto", "return"), 2: cs(10, "hlineto", "endchar") };

const font = (over: Partial<TestFont> = {}) => readType1(buildType1({ encoding: ENCODING, glyphs: GLYPHS, subrs: SUBRS, ...over }));

describe("tex type1 decryption", () => {
  test("the eexec cipher matches the vector of the algorithm (r=55665, c1=52845, c2=22719)", () => {
    const plain = [0, 0, 0, 0, ...Array.from("test", (c) => c.charCodeAt(0))];
    const cipher = t1Encrypt(plain, 55665, 0);
    expect(Array.from(cipher, (b) => b.toString(16).padStart(2, "0")).join("")).toBe("d9d66f632b6ff780");
    expect(Array.from(decryptType1(cipher, 55665, 4))).toEqual(Array.from("test", (c) => c.charCodeAt(0)));
    expect(Array.from(decryptType1(cipher, 55665, 0))).toEqual(plain);
    expect(decryptType1(cipher, 55665, 100)).toHaveLength(0);
  });

  test("the charstring cipher uses r=4330", () => {
    const c = t1Encrypt([1, 2, 3], 4330, 4);
    expect(Array.from(decryptType1(c, 4330, 4))).toEqual([1, 2, 3]);
    expect(Array.from(decryptType1(c, 55665, 4))).not.toEqual([1, 2, 3]);
  });
});

describe("tex type1 font", () => {
  test("reads the header fields", () => {
    const f = font();
    expect(f.fontName).toBe("TestFont");
    expect(f.fontBBox).toEqual([-10, -20, 900, 800]);
    expect(f.fontMatrix).toEqual([0.001, 0, 0, 0.001, 0, 0]);
    expect(f.encoding[65]).toBe("A");
    expect(f.encoding[64]).toBeUndefined();
  });

  test("lines: hmoveto, hlineto, vlineto and closepath", () => {
    const g = font().glyph(65)!;
    expect(g.name).toBe("A");
    expect(g.advance).toBe(500);
    expect(g.d).toBe("M 100 0 L 300 0 L 300 300 L 100 300 Z");
    expect(g.bbox).toEqual([100, 0, 300, 300]);
  });

  test("moves, curves, a subr call and two subpaths", () => {
    const g = font().glyph(66)!;
    expect(g.advance).toBe(600);
    expect(g.d).toBe(
      "M 30 30 L 40 50 L 40 55 C 41 57 44 61 49 67 Z M 49 167 C 49 177 69 207 109 207 C 114 207 120 214 120 222 L 100 222 Z",
    );
    expect(g.bbox).toEqual([30, 30, 120, 222]);
  });

  test("every number encoding of the charstring", () => {
    const g = font().glyph(67)!;
    expect(g.advance).toBe(1132);
    expect(g.d).toBe("M 108 -108 L 1239 -1239 L 1132 -1132 L 101132 -101132 L 101239 -101239 Z");
    for (const v of [-1132, -1131, -108, -107, 0, 107, 108, 1131, 1132]) {
      const bytes = csNumber(v);
      expect(bytes.length).toBe(v >= -107 && v <= 107 ? 1 : v >= -1131 && v <= 1131 ? 2 : 5);
    }
  });

  test("hints are skipped and div divides", () => {
    const g = font().glyph(68)!;
    expect(g.d).toBe("M 5 0 L 10 0 Z");
  });

  test("sbw gives the side bearing, the advance and the start point", () => {
    const g = font().glyph(69)!;
    expect(g.advance).toBe(600);
    expect(g.d).toBe("M 15 17 L 16 17 Z");
  });

  test("flex draws two curves through the othersubrs", () => {
    const g = font().glyph(70)!;
    expect(g.d).toBe("M 0 0 C 0 10 20 15 50 15 C 60 15 80 10 110 0 L 120 0 Z");
    expect(g.bbox).toEqual([0, 0, 120, 15]);
  });

  test("hint replacement calls the subr that the othersubr 3 returns", () => {
    expect(font().glyph(71)!.d).toBe("M 0 0 L 10 0 Z");
  });

  test("seac draws the base and the accent at the offset", () => {
    const g = font().glyph(72)!;
    expect(g.name).toBe("Aacute");
    expect(g.advance).toBe(500);
    expect(g.d).toBe("M 100 0 L 300 0 L 300 300 L 100 300 Z M 45 40 L 50 40 Z");
  });

  test("a glyph without a path has an empty path and a zero box", () => {
    const g = font().glyph(74)!;
    expect(g.d).toBe("");
    expect(g.bbox).toEqual([0, 0, 0, 0]);
    expect(g.advance).toBe(321);
  });

  test("an unmapped code and a missing charstring give null, and the answer is cached", () => {
    const f = font();
    expect(f.glyph(1)).toBeNull();
    expect(f.glyph(65)).toBe(f.glyph(65));
    const g = readType1(buildType1({ encoding: { 65: "Z" }, glyphs: { A: GLYPHS.A! } }));
    expect(g.glyph(65)).toBeNull();
  });

  test("standard encoding names the codes", () => {
    const f = readType1(buildType1({ standard: true, glyphs: { A: GLYPHS.A!, acute: GLYPHS.acute!, Aacute: GLYPHS.Aacute!, space: cs(0, 250, "hsbw", "endchar") } }));
    expect(f.encoding[65]).toBe("A");
    expect(f.encoding[32]).toBe("space");
    expect(f.encoding[194]).toBe("acute");
    expect(f.encoding[225]).toBe("AE");
    expect(f.encoding[251]).toBe("germandbls");
    expect(f.encoding[0]).toBeUndefined();
    expect(f.glyph(32)!.advance).toBe(250);
  });

  test("lenIV 0 and lenIV -1 (no charstring encryption) read the same glyph", () => {
    expect(font({ lenIV: 0 }).glyph(65)!.d).toBe("M 100 0 L 300 0 L 300 300 L 100 300 Z");
    expect(font({ lenIV: -1 }).glyph(65)!.d).toBe("M 100 0 L 300 0 L 300 300 L 100 300 Z");
    expect(font({ lenIV: 1 }).glyph(66)!.advance).toBe(600);
  });

  test("stem and dotsection hints clear the stack", () => {
    expect(font().glyph(77)!.d).toBe("M 10 0 L 15 0 Z");
    expect(font().glyph(78)!.d).toBe("M 10 0 L 15 0 Z");
  });

  test("endchar inside a subr ends the glyph, and return goes on after the call", () => {
    expect(font().glyph(79)!.d).toBe("M 0 0 L 10 0 Z");
    expect(font().glyph(80)!.d).toBe("M 0 0 L 10 0 L 15 0 Z");
  });

  test("setcurrentpoint sets the point from the origin of the glyph", () => {
    expect(font().glyph(81)!.d).toBe("M 100 0 L 300 0 L 300 300 L 100 300 Z M 45 40 L 50 40 Z");
  });

  test("an entry that ends exactly at the end of the private part reads, one that runs past it is refused", () => {
    const f = returned(() => readType1(buildType1({ cut: "exact", encoding: { 65: "A" }, glyphs: { A: GLYPHS.A! } })));
    expect(f.glyph(65)!.advance).toBe(500);
    expect(() => readType1(buildType1({ cut: "short", encoding: { 65: "A" }, glyphs: { A: GLYPHS.A! } }))).toThrow("beyond the private part");
  });

  test("the scan for entries goes on after the bytes of an entry, not inside them", () => {
    const text = Array.from("/Z 1 RD x", (c) => c.charCodeAt(0));
    const f = readType1(buildType1({ lenIV: -1, encoding: { 65: "A", 66: "B", 90: "Z" }, glyphs: { A: [...text, 14], B: GLYPHS.A! } }));
    expect(f.glyph(90)).toBeNull();
    expect(f.glyph(66)!.advance).toBe(500);
  });

  test("a path that continues after closepath starts a new subpath at the current point", () => {
    expect(font().glyph(75)!.d).toBe("M 10 10 L 20 10 Z M 20 10 L 25 10 Z");
  });

  test("coordinates round to two decimals", () => {
    expect(font().glyph(76)!.d).toBe("M 0.63 0 L 1.63 0 Z");
  });

  test("a file with no FontMatrix and no FontBBox gets the defaults", () => {
    const f = readType1(buildType1({ bare: true, encoding: { 65: "A" }, glyphs: { A: GLYPHS.A! } }));
    expect(f.fontBBox).toEqual([0, 0, 0, 0]);
    expect(f.fontMatrix).toEqual([0.001, 0, 0, 0.001, 0, 0]);
  });

  test("a PFB without the end marker reads when its last segment ends at the end of the file", () => {
    expect(returned(() => readType1(buildType1({ noTrailer: true, encoding: { 65: "A" }, glyphs: { A: GLYPHS.A! } })).glyph(65))!.advance).toBe(500);
  });

  test("subrs may nest 20 deep and no deeper", () => {
    const chain = (n: number): Record<number, number[]> => {
      const subrs: Record<number, number[]> = {};
      for (let i = 0; i < n; i++) subrs[i] = i === n - 1 ? cs(10, "hlineto", "return") : cs(i + 1, "callsubr", "return");
      return subrs;
    };
    const glyph = cs(0, 500, "hsbw", 0, 0, "rmoveto", 0, "callsubr", "endchar");
    const make = (n: number) => readType1(buildType1({ encoding: { 65: "A" }, glyphs: { A: glyph }, subrs: chain(n) }));
    expect(returned(() => make(20).glyph(65))!.d).toBe("M 0 0 L 10 0 Z");
    expect(() => make(21).glyph(65)).toThrow("nesting too deep");
  });

  test("a PFA file reads like the PFB file", () => {
    expect(returned(() => font({ pfa: true }).glyph(66))!.d).toBe(font().glyph(66)!.d);
  });

  test("a font with no subrs reads", () => {
    const f = readType1(buildType1({ encoding: { 65: "A" }, glyphs: { A: GLYPHS.A! } }));
    expect(f.glyph(65)!.advance).toBe(500);
  });
});

describe("tex type1 refusals", () => {
  const withGlyph = (code: number[], subrs?: Record<number, number[]>) =>
    readType1(buildType1({ encoding: { 65: "A", 66: "B", 67: "C" }, glyphs: { A: code, B: GLYPHS.A!, C: GLYPHS.A! }, ...(subrs ? { subrs } : {}) }));

  test("an unknown command", () => {
    expect(() => withGlyph(cs(0, 500, "hsbw")).glyph(65)).not.toThrow();
    expect(() => withGlyph([...cs(0, 500, "hsbw"), 15]).glyph(65)).toThrow("unknown command 15");
    expect(() => withGlyph([...cs(0, 500, "hsbw"), 12, 4]).glyph(65)).toThrow("unknown command 12 4");
  });

  test("a missing subr and a subr that calls itself", () => {
    expect(() => withGlyph(cs(0, 500, "hsbw", 5, "callsubr")).glyph(65)).toThrow("no subr 5");
    expect(() => withGlyph(cs(0, 500, "hsbw", 0, "callsubr"), { 0: cs(0, "callsubr") }).glyph(65)).toThrow("nesting too deep");
  });

  test("a flex that ends early", () => {
    expect(() => withGlyph(cs(0, 500, "hsbw", 0, 1, "callothersubr", 0, 0, 0, 3, 0, "callothersubr")).glyph(65)).toThrow("flex with");
  });

  test("a flex with six points is refused", () => {
    const points = Array.from({ length: 6 }, () => [1, 1, "rmoveto", 0, 2, "callothersubr"]).flat();
    expect(() => withGlyph(cs(0, 500, "hsbw", 0, 0, "rmoveto", 0, 1, "callothersubr", ...points, 0, 0, 0, 3, 0, "callothersubr")).glyph(65)).toThrow("flex with 6 points");
  });

  test("a seac with a part that the font lacks", () => {
    expect(() => withGlyph(cs(0, 500, "hsbw", 0, 0, 0, 67, 194, "seac")).glyph(65)).toThrow("seac parts");
  });

  test("a file without a FontName, an eexec section or a CharStrings dictionary", () => {
    const text = (s: string) => Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0)));
    expect(() => readType1(text("%!PS\n/Foo 1 def\n"))).toThrow("no eexec section");
    expect(() => readType1(text("%!PS\n/Foo 1 def\ncurrentfile eexec\n00"))).toThrow("no /FontName");
    const hex = (s: string) => Array.from(t1Encrypt(Array.from(s, (c) => c.charCodeAt(0)), 55665, 4), (b) => b.toString(16).padStart(2, "0")).join("");
    expect(() => readType1(text(`/FontName /X def\ncurrentfile eexec\n${hex("/Private 1 dict def")}`))).toThrow("no /CharStrings");
  });

  test("a damaged PFB", () => {
    const ok = buildType1({ encoding: { 65: "A" }, glyphs: { A: GLYPHS.A! } });
    const lost = ok.slice();
    lost[2] = 255; // the length of the first segment is now too large
    lost[3] = 255;
    expect(() => readType1(lost)).toThrow("beyond the file");
    const bad = ok.slice();
    const second = 6 + (ok[2]! | (ok[3]! << 8) | (ok[4]! << 16));
    bad[second + 1] = 5;
    expect(() => readType1(bad)).toThrow("PFB segment type 5");
    const mid = ok.slice();
    mid[second] = 0x41;
    expect(() => readType1(mid)).toThrow("bad PFB segment at byte");
  });
});
