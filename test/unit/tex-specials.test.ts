import { describe, expect, test } from "bun:test";
import { createSpecials, SPECIAL_UNIT_PER_PT } from "../../src/tex/specials.ts";

const at = { x: 10, y: 20.5, unit: 1 };

describe("tex specials", () => {
  test("the unit is the big point", () => {
    expect(SPECIAL_UNIT_PER_PT).toBe(72 / 72.27);
  });

  test("raw replaces the position and the newline placeholders", () => {
    const s = createSpecials();
    expect(s.special('dvisvgm:raw <g transform="translate({?x},{?y})">{?nl}', at)).toEqual({ svg: '<g transform="translate(10,20.5)">\n' });
    expect(s.special("dvisvgm: raw </g>", at)).toEqual({ svg: "</g>" });
    expect(s.special("  dvisvgm:raw <u/>", at)).toEqual({ svg: "<u/>" });
    expect(s.special("dvisvgm:raw {?x}{?x}", { x: 0.1 + 0.2, y: 0, unit: 1 })).toEqual({ svg: "0.30.3" });
    expect(s.special("dvisvgm:raw {?x}", { x: 1.23456789, y: 0, unit: 1 })).toEqual({ svg: "1.2346" });
  });

  test("bbox gives a box from width, height and depth in points", () => {
    const s = createSpecials();
    expect(s.special("dvisvgm:bbox 100.0 50.0", at)).toEqual({ box: [10, -29.5, 110, 20.5] });
    expect(s.special("dvisvgm:bbox 10 5 2", { x: 0, y: 0, unit: 0.5 })).toEqual({ box: [0, -2.5, 5, 1] });
    expect(s.special("dvisvgm:bbox 1.00006 1 0", { x: 0, y: 0, unit: 1 })).toEqual({ box: [0, -1, 1.0001, 0] });
  });

  test("bbox words and bad numbers give no box", () => {
    const s = createSpecials();
    for (const t of ["dvisvgm:bbox lock", "dvisvgm:bbox unlock", "dvisvgm:bbox fix 0 0 10 10", "dvisvgm:bbox new a", "dvisvgm:bbox 5", "dvisvgm:bbox", "dvisvgm:bbox a b", "dvisvgm:bbox 1 2 c"]) {
      expect(s.special(t, at)).toBeNull();
    }
  });

  test("color push and pop in the rgb, gray and cmyk models", () => {
    const s = createSpecials();
    expect(s.special("color push  rgb 1 0 0.5", at)).toEqual({ svg: '<g fill="rgb(255,0,128)">' });
    expect(s.special("color push gray 0.5", at)).toEqual({ svg: '<g fill="rgb(128,128,128)">' });
    expect(s.special("color push cmyk 0 1 1 0", at)).toEqual({ svg: '<g fill="rgb(255,0,0)">' });
    expect(s.special("color push cmyk 0.5 0 0 0.5", at)).toEqual({ svg: '<g fill="rgb(64,128,128)">' });
    expect(s.special("color pop", at)).toEqual({ svg: "</g>" });
  });

  test("a color special that is incomplete or unknown is listed as ignored", () => {
    const s = createSpecials();
    for (const t of ["color push rgb 1 0", "color push gray", "color push cmyk 1 1 1", "color push hsb 1 1 1", "color push rgb a b c", "color push gray x", "color push cmyk a b c d", "color set"]) {
      expect(s.special(t, at)).toBeNull();
    }
    expect(s.ignored()).toEqual(["color"]);
  });

  test("rawdef wraps in defs, rawset and rawput keep and place a fragment", () => {
    const s = createSpecials();
    expect(s.special('dvisvgm:rawdef <marker id="m"/>', at)).toEqual({ svg: '<defs><marker id="m"/></defs>' });
    expect(s.special("dvisvgm:rawset a", at)).toBeNull();
    expect(s.special('dvisvgm:raw <use x="{?x}"/>', at)).toBeNull();
    expect(s.special("dvisvgm:raw <b/>", at)).toBeNull();
    expect(s.special("dvisvgm:rawput a", at)).toBeNull();
    expect(s.special("dvisvgm:endrawset", at)).toBeNull();
    expect(s.special("dvisvgm:rawput a", { x: 3, y: 4, unit: 1 })).toEqual({ svg: '<use x="3"/><b/>' });
    expect(s.special("dvisvgm:rawput nothing", at)).toBeNull();
    expect(s.special("dvisvgm:rawput", at)).toBeNull();
    expect(s.special("dvisvgm:rawset", at)).toBeNull();
    expect(s.special("dvisvgm:raw <i/>", at)).toEqual({ svg: "<i/>" });
  });

  test("a second rawset inside a capture does not start another set", () => {
    const s = createSpecials();
    s.special("dvisvgm:rawset a", at);
    s.special("dvisvgm:rawset b", at);
    s.special("dvisvgm:raw X", at);
    s.special("dvisvgm:endrawset", at);
    expect(s.special("dvisvgm:rawput a", at)).toEqual({ svg: "X" });
    expect(s.special("dvisvgm:rawput b", at)).toBeNull();
  });

  test("an unknown command and a special of another tool are listed once, in order", () => {
    const s = createSpecials();
    expect(s.special("ps: gsave", at)).toBeNull();
    expect(s.special("papersize=10pt,10pt", at)).toBeNull();
    expect(s.special("dvisvgm:frobnicate 1", at)).toBeNull();
    expect(s.special("ps: grestore", at)).toBeNull();
    expect(s.special("dvisvgm:", at)).toBeNull();
    expect(s.ignored()).toEqual(["ps:", "papersize=10pt,10pt", "dvisvgm:frobnicate", "dvisvgm:"]);
  });

  test("the list of ignored words is a copy", () => {
    const s = createSpecials();
    s.special("ps: a", at);
    s.ignored().push("x");
    expect(s.ignored()).toEqual(["ps:"]);
  });

  test("transformed() is true between a raw group with a transform and its end", () => {
    const s = createSpecials();
    expect(s.transformed()).toBe(false);
    s.special("color push gray 0", at);
    expect(s.transformed()).toBe(false);
    s.special('dvisvgm:raw <g stroke="none" transform="translate({?x},{?y})">', at);
    expect(s.transformed()).toBe(true);
    s.special("dvisvgm:raw <g fill='#000'>", at);
    s.special("dvisvgm:raw </g>", at);
    expect(s.transformed()).toBe(true);
    s.special("dvisvgm:raw </g>", at);
    expect(s.transformed()).toBe(false);
    s.special("color pop", at);
    expect(s.transformed()).toBe(false);
    s.special("dvisvgm:raw </g>", at);
    expect(s.transformed()).toBe(false);
  });

  test("transformed() counts the groups of color push, so that the next end closes the color group", () => {
    const s = createSpecials();
    s.special('dvisvgm:raw <g transform="rotate(1)">', at);
    s.special("color push gray 0", at);
    s.special("dvisvgm:raw </g>", at);
    expect(s.transformed()).toBe(true);
  });

  test("transformed() counts a transform that a stored raw set puts on the page", () => {
    const s = createSpecials();
    s.special("dvisvgm:rawset a", at);
    s.special('dvisvgm:raw <g transform="rotate(1)">', at);
    expect(s.transformed()).toBe(false);
    s.special("dvisvgm:endrawset", at);
    s.special("dvisvgm:rawput a", at);
    expect(s.transformed()).toBe(true);
  });
});
