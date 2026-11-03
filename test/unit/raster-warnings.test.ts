import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fontCovers, rasterWarnings } from "../../src/raster/warnings.ts";
import { dotToSvg } from "../../src/graph/dot.ts";

const FONT = new Uint8Array(readFileSync(fileURLToPath(new URL("../../assets/fonts/LiberationSerif-Regular.ttf", import.meta.url))));

function svgOf(...texts: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg">${texts.join("")}</svg>`;
}

/** Builds a font file that holds only a cmap table with one Unicode subtable. */
function fontWithCmap(subtable: number[], platform = 3, encoding = 1): Uint8Array {
  const u16 = (n: number) => [(n >> 8) & 255, n & 255];
  const u32 = (n: number) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const cmap = [...u16(0), ...u16(1), ...u16(platform), ...u16(encoding), ...u32(12), ...subtable];
  const directory = [0, 1, 0, 0, ...u16(1), ...u16(16), ...u16(0), ...u16(0), 99, 109, 97, 112, ...u32(0), ...u32(28), ...u32(cmap.length)];
  return new Uint8Array([...directory, ...cmap]);
}

/** A format 4 subtable with the given segments: [start, end, delta]. The last segment (0xFFFF) is added here. */
function format4(segments: [number, number, number][]): number[] {
  const u16 = (n: number) => [(n >> 8) & 255, n & 255];
  const all = [...segments, [0xffff, 0xffff, 1] as [number, number, number]];
  const n = all.length;
  const length = 16 + n * 8;
  return [
    ...u16(4), ...u16(length), ...u16(0), ...u16(n * 2), ...u16(0), ...u16(0), ...u16(0),
    ...all.flatMap((seg) => u16(seg[1])),
    ...u16(0),
    ...all.flatMap((seg) => u16(seg[0])),
    ...all.flatMap((seg) => u16(seg[2] & 0xffff)),
    ...all.flatMap(() => u16(0)),
  ];
}

describe("fontCovers with a built character map", () => {
  test("format 4: a segment whose delta maps to glyph 0 is not covered, one that maps to glyph 5 is covered", () => {
    const covers = fontCovers(fontWithCmap(format4([[0x41, 0x41, -0x41], [0x42, 0x44, 0x10]])));
    expect(covers?.(0x41)).toBe(false);
    expect(covers?.(0x42)).toBe(true);
    expect(covers?.(0x44)).toBe(true);
    expect(covers?.(0x45)).toBe(false);
    expect(covers?.(0x40)).toBe(false);
  });

  test("format 4: a code point above U+FFFF is not covered", () => {
    expect(fontCovers(fontWithCmap(format4([[0x41, 0x44, 1]])))?.(0x10041)).toBe(false);
  });

  test("format 4 holds a code point above U+0FFF", () => {
    const covers = fontCovers(fontWithCmap(format4([[0x2000, 0x2100, 1]])));
    expect(covers?.(0x20ac)).toBe(true);
  });

  test("format 12: a group covers its range and no more", () => {
    const u32 = (n: number) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
    const sub = [0, 12, 0, 0, ...u32(28), ...u32(0), ...u32(1), ...u32(0x1f600), ...u32(0x1f64f), ...u32(7)];
    const covers = fontCovers(fontWithCmap(sub, 3, 10));
    expect(covers?.(0x1f600)).toBe(true);
    expect(covers?.(0x1f64f)).toBe(true);
    expect(covers?.(0x1f650)).toBe(false);
    expect(covers?.(0x1f5ff)).toBe(false);
  });

  test("a subtable of another platform is not read", () => {
    expect(fontCovers(fontWithCmap(format4([[0x41, 0x44, 1]]), 1, 0))).toBeUndefined();
  });

  test("a platform 0 subtable is read", () => {
    expect(fontCovers(fontWithCmap(format4([[0x41, 0x44, 1]]), 0, 3))?.(0x41)).toBe(true);
  });

  test("a subtable of a format that the reader does not know gives undefined", () => {
    expect(fontCovers(fontWithCmap([0, 6, 0, 10, 0, 0, 0, 0, 0, 0]))).toBeUndefined();
  });
});

describe("fontCovers", () => {
  test("the bundled font holds Latin letters, digits and punctuation", () => {
    const covers = fontCovers(FONT);
    for (const ch of "Aa9.,;-") expect(covers?.(ch.codePointAt(0)!)).toBe(true);
    expect(covers?.(0x20ac)).toBe(true);
  });

  test("the bundled font holds Greek letters and has no glyph for a CJK ideograph or an emoji", () => {
    const covers = fontCovers(FONT);
    expect(covers?.(0x3b1)).toBe(true);
    expect(covers?.(0x65e5)).toBe(false);
    expect(covers?.(0x1f600)).toBe(false);
  });

  test("bytes without a cmap table give undefined, so the caller skips the check", () => {
    expect(fontCovers(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeUndefined();
  });
});

describe("rasterWarnings", () => {
  test("plain Latin text gives no warning", () => {
    expect(rasterWarnings(svgOf('<text font-family="Times,serif">Hello, World 42</text>'), FONT)).toEqual([]);
  });

  test("bold text gives one warning for any number of bold elements", () => {
    const w = rasterWarnings(svgOf('<text font-weight="bold">a</text>', '<text font-weight="700">b</text>', '<text font-weight="normal">c</text>'), FONT);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("bold");
    expect(w[0]).toContain("2");
  });

  test("a weight of 600 is bold and a weight of 500 is not", () => {
    expect(rasterWarnings(svgOf('<text font-weight="600">a</text>'), FONT)).toHaveLength(1);
    expect(rasterWarnings(svgOf('<text font-weight="500">a</text>'), FONT)).toEqual([]);
  });

  test("italic text gives one warning", () => {
    const w = rasterWarnings(svgOf('<text font-style="italic">a</text>', '<text font-style="oblique">b</text>'), FONT);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("italic");
    expect(w[0]).toContain("2");
  });

  test("a character without a glyph gives one warning with its code point, also from an entity", () => {
    const w = rasterWarnings(svgOf("<text>日本</text>", "<text>&#26085;&#x1F600;</text>"), FONT);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("U+65E5");
    expect(w[0]).toContain("3");
  });

  test("text inside a tspan counts, and markup does not", () => {
    const w = rasterWarnings(svgOf("<text>a<tspan>日</tspan></text>"), FONT);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("U+65E5");
  });

  test("the entities of XML read as their characters", () => {
    expect(rasterWarnings(svgOf("<text>&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos;</text>"), FONT)).toEqual([]);
  });

  test("a font without a readable character map gives one warning when the SVG has text, and none when it has none", () => {
    const junk = new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const w = rasterWarnings(svgOf("<text>a</text>"), junk);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("character map");
    expect(rasterWarnings(svgOf('<rect width="1" height="1"/>'), junk)).toEqual([]);
  });

  test("a graph with bold, italic and CJK labels gives the three warnings through the real graph stage", async () => {
    const dot = await dotToSvg('digraph { a [label=<<B>x</B> <I>y</I>>]; b [label="日本語"] }');
    const w = rasterWarnings(dot.svg, FONT);
    expect(w).toHaveLength(3);
  });
});
