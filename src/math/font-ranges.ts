/**
 * Static imports of every dynamic font range of MathJax-Newcm, the default math font. Each import
 * registers one range with the font class. loadFontRanges() copies the ranges into a font instance,
 * so no range loads at run time and no network or file fetch happens.
 */
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/PUA.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/accents-b-i.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/accents.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/arabic.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/arrows.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/braille-d.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/braille.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/calligraphic.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/cherokee.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic-ss.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/devanagari.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/double-struck.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/fraktur.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/greek-ss.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/greek.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/hebrew.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-b.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-bi.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-i.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/latin.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/marrows.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/math.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-ex.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-l.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/mshapes.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics-ss.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-b.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-bi.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-ex.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-i.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-r.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/script.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/shapes.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols-b-i.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/variants.js";

/** The minimum a dynamic range record exposes to this module. */
interface DynamicRange {
  setup: (font: object) => void;
}

/** Copies every dynamic range of the font class into the font instance. Synchronous; no file read. */
export function loadFontRanges(font: object): void {
  const ranges = (font.constructor as unknown as { dynamicFiles: Record<string, DynamicRange> }).dynamicFiles;
  for (const range of Object.values(ranges)) {
    range.setup(font);
  }
}

/** The part of a MathJax font instance that the mhchem variant needs. */
interface VariantFont {
  variant: Record<string, { chars: Record<number, unknown> }>;
  delimiters: Record<number, { c?: number } | undefined>;
  createVariant: (name: string, inherit: string) => void;
  defineChars: (name: string, chars: Record<number, unknown>) => void;
}

/**
 * The private-use arrow code points of the TeX mhchem extension, each with the standard arrow that
 * the bundled font holds. The mhchem font extension, which owns the private-use glyphs, is not installed.
 */
export const MHCHEM_ALIASES: ReadonlyArray<readonly [pua: number, real: number]> = [
  [0xe408, 0x21cc], // \mhchemlongrightleftharpoons (<=>) -> right over left harpoons
  [0xe409, 0x21cc], // \mhchemlongRightleftharpoons (<=>>) -> right over left harpoons
  [0xe40a, 0x21cb], // \mhchemlongLeftrightharpoons (<<=>) -> left over right harpoons
  [0xe428, 0x27f5], // \mhchemlongleftarrow (<-) -> long left arrow
  [0xe429, 0x27f6], // \mhchemlongrightarrow (->) -> long right arrow
  [0xe42a, 0x27f7], // \mhchemlongleftrightarrow (<->) -> long left right arrow
  [0xe42b, 0x21c6], // \mhchemlongleftrightarrows (<-->) -> left arrow over right arrow
  [0xe42c, 0x2190], // \mhchemleftarrow -> left arrow
  [0xe42d, 0x2192], // \mhchemrightarrow -> right arrow
  [0xe42e, 0x2194], // \mhchemleftrightarrow -> left right arrow
];

/**
 * Adds the variant -mhchem to a font instance and gives each mhchem arrow code point the glyph of its
 * standard arrow. The alias goes into the -mhchem variant (plain arrows) and the normal variant
 * (labelled arrows such as `->[x]`, which MathJax draws in the normal variant). The stretchy delimiter
 * data of the standard arrow also goes to the code point, so a labelled arrow stretches.
 */
export function defineMhchemVariant(font: object): void {
  const f = font as VariantFont;
  f.createVariant("-mhchem", "normal");
  const chars: Record<number, unknown> = {};
  for (const [pua, real] of MHCHEM_ALIASES) {
    const glyph = f.variant["normal"]!.chars[real];
    if (glyph === undefined) {
      throw new Error(`the normal variant holds no glyph for U+${real.toString(16).toUpperCase()}`);
    }
    chars[pua] = glyph;
    const delimiter = f.delimiters[real];
    if (delimiter !== undefined && f.delimiters[pua] === undefined) {
      f.delimiters[pua] = { ...delimiter, c: delimiter.c ?? real };
    }
  }
  f.defineChars("normal", chars);
  f.defineChars("-mhchem", chars);
}
