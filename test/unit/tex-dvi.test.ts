import { describe, expect, test } from "bun:test";
import { dviToSvg } from "../../src/tex/dvi.ts";
import { returned } from "../support/rejections.ts";
import { buildTfm, buildType1, charstring as cs, DviBuilder } from "../support/tex-fixtures.ts";

const SQUARE = cs(0, 500, "hsbw", 100, "hmoveto", 200, "hlineto", 300, "vlineto", -200, "hlineto", "closepath", "endchar");
const TRI = cs(0, 250, "hsbw", 0, "hmoveto", 500, "hlineto", 500, "vlineto", "closepath", "endchar");
const TFM = buildTfm(10, { 65: 0.5, 66: 0.25, 200: 0.5, 67: 0.1 });
const PFB = buildType1({ encoding: { 65: "A", 66: "B", 200: "C" }, glyphs: { A: SQUARE, B: TRI, C: SQUARE } });
const files = (name: string) => (name === "tf" ? { tfm: TFM, pfb: PFB } : null);

const rects = (svg: string): [number, number][] => [...svg.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);

/** A page with the font tf at size 10 (units of one point). */
const page = () => new DviBuilder().pre().bop().font(0, "tf", 10);

describe("tex dvi: glyphs and rules", () => {
  test("a page of glyphs and rules becomes an exact SVG", () => {
    const dvi = page().right(1, 1).down(1, 10).set(65).set(66).setRule(2, 3).putRule(1, 1).eop().post().done();
    const r = dviToSvg(dvi, files);
    expect(r.svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="1 4 12.5 7" width="12.5pt" height="7pt">\n' +
        '<path transform="translate(1 10) scale(0.01 -0.01)" d="M 100 0 L 300 0 L 300 300 L 100 300 Z"/>\n' +
        '<path transform="translate(6 10) scale(0.01 -0.01)" d="M 0 0 L 500 0 L 500 500 Z"/>\n' +
        '<rect x="8.5" y="8" width="3" height="2"/>\n' +
        '<rect x="11.5" y="9" width="1" height="1"/>\n' +
        "</svg>\n",
    );
    expect(r).toMatchObject({ glyphs: 2, rules: 2, specials: 0, pages: 1, missing: [], fonts: ["tf"] });
  });

  test("the magnification scales every length", () => {
    const dvi = new DviBuilder().pre(2000).bop().font(0, "tf", 10).down(1, 10).set(65).eop().post().done();
    expect(dviToSvg(dvi, files).svg).toContain('translate(0 20) scale(0.02 -0.02)');
  });

  test("unitPerPt and the margin change the unit and the border", () => {
    const dvi = page().right(1, 10).down(1, 10).setRule(1, 1).eop().post().done();
    const r = dviToSvg(dvi, files, { unitPerPt: 2, margin: 0 });
    expect(r.svg).toContain('viewBox="20 18 2 2" width="2pt" height="2pt"');
    expect(r.svg).toContain('<rect x="20" y="18" width="2" height="2"/>');
  });

  test("a rule with no height or width draws nothing but still moves", () => {
    const dvi = page().setRule(0, 5).putRule(5, 0).setRule(-1, 5).putRule(3, -2).putRule(1, 1).eop().post().done();
    const r = dviToSvg(dvi, files);
    expect(r.rules).toBe(1);
    expect(rects(r.svg)).toEqual([[10, -1]]);
  });

  test("a page without marks has a unit box", () => {
    const r = dviToSvg(page().eop().post().done(), files);
    expect(r.svg).toContain('viewBox="-1 -1 3 3" width="3pt" height="3pt"');
  });

  test("a glyph with an empty outline adds nothing, and a missing outline is listed", () => {
    const empty = buildType1({ encoding: { 65: "A" }, glyphs: { A: cs(0, 500, "hsbw", "endchar") } });
    const r = dviToSvg(page().set(65).set(67).eop().post().done(), (n) => (n === "tf" ? { tfm: TFM, pfb: empty } : null));
    expect(r.glyphs).toBe(0);
    expect(r.missing).toEqual(["tf:67"]);
    expect(r.svg).not.toContain("<path");
  });

  test("a font with no PFB keeps its advances and lists each glyph; an unknown font lists its name", () => {
    const r = returned(() => dviToSvg(page().set(65).setRule(1, 1).font(1, "zz", 10).set(65).eop().post().done(), (n) => (n === "tf" ? { tfm: TFM, pfb: null } : null)));
    expect(r.missing).toEqual(["tf:65", "zz"]);
    expect(rects(r.svg)).toEqual([[5, -1]]);
  });
});

describe("tex dvi: movement", () => {
  type Step = [(b: DviBuilder) => DviBuilder, number, number];
  const table: Step[] = [
    [(b) => b.right(1, 5), 5, 0], [(b) => b.right(2, 300), 305, 0], [(b) => b.right(3, -5), 300, 0], [(b) => b.right(4, 100), 400, 0],
    [(b) => b.w(1, 10), 410, 0], [(b) => b.w(0), 420, 0], [(b) => b.w(2, 20), 440, 0], [(b) => b.w(3, -40), 400, 0], [(b) => b.w(4, 100), 500, 0],
    [(b) => b.x(1, 1), 501, 0], [(b) => b.x(0), 502, 0], [(b) => b.x(2, 2), 504, 0], [(b) => b.x(3, 3), 507, 0], [(b) => b.x(4, 4), 511, 0],
    [(b) => b.down(1, 5), 511, 5], [(b) => b.down(2, 300), 511, 305], [(b) => b.down(3, -5), 511, 300], [(b) => b.down(4, 100), 511, 400],
    [(b) => b.y(1, 10), 511, 410], [(b) => b.y(0), 511, 420], [(b) => b.y(2, 20), 511, 440], [(b) => b.y(3, -40), 511, 400], [(b) => b.y(4, 100), 511, 500],
    [(b) => b.z(1, 1), 511, 501], [(b) => b.z(0), 511, 502], [(b) => b.z(2, 2), 511, 504], [(b) => b.z(3, 3), 511, 507], [(b) => b.z(4, 4), 511, 511],
  ];

  test("right, w, x, down, y and z in every width", () => {
    let b = page();
    for (const [op] of table) b = op(b).putRule(1, 1);
    const got = rects(dviToSvg(b.eop().post().done(), files).svg);
    expect(got).toEqual(table.map(([, h, v]) => [h, v - 1]));
  });

  test("a signed number takes the whole range of its width", () => {
    const b = page().right(1, 127).putRule(1, 1).right(1, -128).putRule(1, 1).right(2, 32767).putRule(1, 1).right(2, -32768).putRule(1, 1).right(3, -8388608).putRule(1, 1);
    expect(rects(dviToSvg(b.eop().post().done(), files).svg).map((r) => r[0])).toEqual([127, -1, 32766, -2, -8388610]);
  });

  test("a font is not selected after a new page and a push does not survive it", () => {
    const b = page().push().eop().bop().setRule(1, 1).eop().post();
    expect(rects(dviToSvg(b.done(), files, { page: 2 }).svg)).toEqual([[0, -1]]);
    const c = page().push().eop().bop().pop().eop().post();
    expect(() => dviToSvg(c.done(), files)).toThrow("empty stack");
    const regs = page().w(1, 4).x(1, 5).y(1, 6).z(1, 7).eop().bop().font(0, "tf", 10).w(0).x(0).y(0).z(0).putRule(1, 1).eop().post();
    expect(rects(dviToSvg(regs.done(), files, { page: 2 }).svg)).toEqual([[0, -1]]);
    const sixtyThree = new DviBuilder().pre().bop().font(63, "tf", 10).setRule(1, 1).set(66).eop().post();
    expect(returned(() => dviToSvg(sixtyThree.done(), files)).glyphs).toBe(1);
    const d = page().eop().bop().set(65);
    expect(() => dviToSvg(d.done(), files)).toThrow("char before a font");
  });

  test("push and pop save and restore the position and the registers", () => {
    const b = page().w(1, 7).x(1, 3).y(1, 2).z(1, 1).push().w(1, 100).x(1, 100).y(1, 100).z(1, 100).putRule(1, 1).pop().putRule(1, 1);
    const b2 = b.w(0).x(0).y(0).z(0).putRule(1, 1);
    expect(rects(dviToSvg(b2.eop().post().done(), files).svg)).toEqual([
      [210, 202],
      [10, 2],
      [20, 5],
    ]);
  });

  test("the registers and the position are zero at the start of each page", () => {
    const dvi = page().right(1, 9).w(1, 4).eop().bop().font(0, "tf", 10).fontNum(0).putRule(1, 1).eop().post().done();
    expect(rects(dviToSvg(dvi, files, { page: 2 }).svg)).toEqual([[0, -1]]);
  });
});

describe("tex dvi: characters and fonts", () => {
  test("set and put in every width; put does not move", () => {
    const dvi = page().setN(200, 1).setN(200, 2).setN(200, 3).setN(200, 4).putN(200, 1).putN(200, 2).putN(200, 3).putN(200, 4).put(65).set(200).eop().post().done();
    const r = dviToSvg(dvi, files);
    const xs = [...r.svg.matchAll(/translate\((-?[\d.]+) /g)].map((m) => Number(m[1]));
    expect(xs).toEqual([0, 5, 10, 15, 20, 20, 20, 20, 20, 20]);
    expect(r.glyphs).toBe(10);
  });

  test("font selection by fnt_num, fnt1 and fnt2 to fnt4", () => {
    let b = new DviBuilder().pre().bop().font(0, "tf", 10).font(70, "tf", 20).set(66);
    b = b.fontNum(0).set(66).fontNumLong(70, 2).set(66).fontNumLong(0, 3).set(66).fontNumLong(70, 4).set(66).fontNumLong(0, 1).set(66);
    const r = dviToSvg(b.eop().post().done(), files);
    const scales = [...r.svg.matchAll(/scale\(([\d.]+) /g)].map((m) => Number(m[1]));
    expect(scales).toEqual([0.02, 0.01, 0.02, 0.01, 0.02, 0.01]);
  });

  test("a font defined twice keeps the first definition", () => {
    const b = new DviBuilder().pre().bop().font(0, "tf", 10).font(0, "tf", 99).set(66);
    expect(dviToSvg(b.eop().post().done(), files).svg).toContain("scale(0.01 -0.01)");
  });

  test("the width of a character is the TFM width times the font size", () => {
    const r = dviToSvg(page().set(65).putRule(1, 1).eop().post().done(), files);
    expect(rects(r.svg)).toEqual([[5, -1]]);
  });
});

describe("tex dvi: pages and specials", () => {
  const two = () =>
    page().set(65).eop().bop().font(0, "tf", 10).setRule(1, 1).special("hello").eop().post().done();

  test("the option page picks the page that is drawn", () => {
    const one = dviToSvg(two(), files);
    expect(one).toMatchObject({ glyphs: 1, rules: 0, pages: 2, specials: 1 });
    const second = dviToSvg(two(), files, { page: 2 });
    expect(second).toMatchObject({ glyphs: 0, rules: 1, pages: 2, specials: 1 });
  });

  test("the special callback gets the text and the position in SVG units; its svg and box join the page", () => {
    const calls: unknown[] = [];
    const dvi = page().right(1, 3).down(1, 4).special("dvisvgm:raw <x/>").special("nothing").eop().post().done();
    const r = dviToSvg(dvi, files, {
      unitPerPt: 2,
      special: (text, at) => {
        calls.push([text, at]);
        return text === "nothing" ? null : { svg: "<g/>", box: [0, 0, 50, 60] };
      },
    });
    const rounded = (calls as [string, { x: number; y: number; unit: number }][]).map(([t, a]) => [t, { x: Math.round(a.x * 1e6) / 1e6, y: Math.round(a.y * 1e6) / 1e6, unit: a.unit }]);
    expect(rounded).toEqual([
      ["dvisvgm:raw <x/>", { x: 6, y: 8, unit: 2 }],
      ["nothing", { x: 6, y: 8, unit: 2 }],
    ]);
    expect(r.svg).toContain("<g/>\n</svg>");
    expect(r.svg).toContain('viewBox="-1 -1 52 62"');
    expect(r.specials).toBe(2);
  });

  test("glyph and rule boxes do not join the bounds while the transformed option says true", () => {
    const dvi = page().right(1, 3).special("dvisvgm:bbox 10 5").set(65).setRule(2, 3).eop().post().done();
    let inside = true;
    const base = { special: (t: string) => (t.startsWith("dvisvgm:bbox") ? { box: [0, 0, 10, 5] } : null) };
    const all = dviToSvg(dvi, files, base);
    expect(all.svg).toContain('viewBox="-1 -4 13 10"');
    const kept = dviToSvg(dvi, files, { ...base, transformed: () => inside });
    expect(kept.svg).toContain('viewBox="-1 -1 12 7"');
    expect(kept.glyphs).toBe(1);
    expect(kept.svg).toContain("<path");
    expect(kept.svg).toContain("<rect");
    inside = false;
    expect(dviToSvg(dvi, files, { ...base, transformed: () => inside }).svg).toBe(all.svg);
  });

  test("without a callback a special only counts, and a special on another page is not offered", () => {
    expect(dviToSvg(page().special("a").special("b").eop().post().done(), files).specials).toBe(2);
    let called = 0;
    dviToSvg(two(), files, { special: () => (called++, null) });
    expect(called).toBe(0);
  });

  test("a nop is skipped", () => {
    expect(dviToSvg(page().nop().setRule(1, 1).eop().post().done(), files).rules).toBe(1);
  });
});

describe("tex dvi: refusals", () => {
  test("a file that is not a DVI file", () => {
    expect(() => dviToSvg(Uint8Array.from([1, 2, 3]), files)).toThrow("not a DVI file");
    expect(() => dviToSvg(Uint8Array.from([247, 3]), files)).toThrow("not a DVI file");
  });

  test("a file with no postamble", () => {
    expect(() => dviToSvg(page().set(65).done(), files)).toThrow("DVI ended without post");
  });

  test("an unknown opcode", () => {
    const b = page();
    b.bytes.push(250);
    expect(() => dviToSvg(b.done(), files)).toThrow(/DVI opcode 250 at byte \d+/);
  });

  test("a character before a font, and a character without a width", () => {
    expect(() => dviToSvg(new DviBuilder().pre().bop().set(65).done(), files)).toThrow("char before a font");
    expect(() => dviToSvg(page().set(99).done(), files)).toThrow("no width for char 99 in tf");
  });
});
