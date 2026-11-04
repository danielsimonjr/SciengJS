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
  createVariant: (name: string, inherit: string) => void;
  defineChars: (name: string, chars: Record<number, unknown>) => void;
}

/** The mhchem arrow glyph. The TeX mhchem extension names it with the variant -mhchem. */
const MHCHEM_ARROW = 0xe429;
/** The long right arrow. Its glyph in the normal variant is the arrow that MathJax draws for \longrightarrow. */
const LONG_RIGHT_ARROW = 0x27f6;

/**
 * Adds the variant -mhchem to a font instance. The mhchem font extension, which owns this variant,
 * is not installed, so the arrow glyph is the long right arrow of the normal variant.
 */
export function defineMhchemVariant(font: object): void {
  const f = font as VariantFont;
  f.createVariant("-mhchem", "normal");
  const arrow = f.variant["normal"]!.chars[LONG_RIGHT_ARROW];
  if (arrow === undefined) {
    throw new Error("the normal variant holds no long right arrow glyph");
  }
  f.defineChars("-mhchem", { [MHCHEM_ARROW]: arrow });
}
