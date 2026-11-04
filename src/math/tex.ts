import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import "@mathjax/src/js/input/tex/base/BaseConfiguration.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js";
import "@mathjax/src/js/input/tex/color/ColorConfiguration.js";
import "@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js";
import { RenderError } from "../errors.ts";
import { defineMhchemVariant, loadFontRanges } from "./font-ranges.ts";

/** The TeX packages that this build holds. Each one is imported above; no other package loads. */
export const MATH_PACKAGES: readonly string[] = ["base", "ams", "boldsymbol", "color", "mhchem"];

/** Pixels per MathJax ex unit. MathJax reports sizes in ex; the SVG attributes state pixels. */
const EX_PX = 8;

/** Options of one math render. */
export interface MathOptions {
  /** True for display style (a block), false for inline. */
  display: boolean;
}

/** Matches one `\require{...}` command and captures its package list. */
const REQUIRE = /\\require\s*\{([^}]*)\}/g;

/**
 * Removes each `\require{...}` command from the source and returns the rest. The build loads every
 * held package before the render and holds no require package, so a `\require` of held packages is a
 * no-op. A `\require` of a package that this build does not hold rejects with E_UNSUPPORTED and names
 * the package. MathJax never fetches a package.
 */
export function stripRequires(source: string): string {
  for (const match of source.matchAll(REQUIRE)) {
    for (const raw of match[1]!.split(",")) {
      const name = raw.trim();
      if (name !== "" && !MATH_PACKAGES.includes(name)) {
        throw new RenderError("E_UNSUPPORTED", `the math stage does not hold the package ${name}`);
      }
    }
  }
  return source.replace(REQUIRE, "");
}

/** The five named XML entities, by name. */
const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decodes the numeric and the five named XML entities of a text. */
function decodeXml(text: string): string {
  return text.replace(
    /&(?:#x([0-9A-Fa-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/g,
    (whole: string, hex?: string, dec?: string, name?: string) => {
      if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
      if (dec !== undefined) return String.fromCodePoint(parseInt(dec, 10));
      return XML_ENTITIES[name!] ?? whole;
    },
  );
}

/**
 * Rejects an SVG that draws a character as system-font text. MathJax writes a `<text>` element with a
 * `font-family` when the math font holds no glyph for a character. Such output depends on the fonts of
 * the viewer, and the PNG stage has no font. The error names each such character and its code point.
 */
export function rejectFontFallback(svg: string): void {
  if (!svg.includes("<text") && !svg.includes("font-family")) return;
  const chars = new Set<string>();
  for (const match of svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)) {
    for (const ch of decodeXml(match[1]!)) chars.add(ch);
  }
  if (chars.size === 0) {
    throw new RenderError("E_UNSUPPORTED", "the math svg uses a system font");
  }
  const names = [...chars].map((ch) => `${ch} (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`);
  throw new RenderError("E_UNSUPPORTED", `the math font holds no glyph for ${names.join(", ")}`);
}

/** Converts a MathJax size string such as "2.5ex" to pixels, rounded to 3 decimals. */
export function exToPx(value: string): string {
  const match = /^(-?[\d.]+)ex$/.exec(value);
  if (match === null) {
    throw new RenderError("E_INTERNAL", `unexpected MathJax size: ${value}`);
  }
  return String(Math.round(Number(match[1]) * EX_PX * 1000) / 1000);
}

/**
 * Keeps the `<svg>` element of a MathJax container and sets the standalone attributes:
 * the SVG namespace, the sizes in px and the viewBox. Only the SVG element leaves this function,
 * so the assistive MathML of the container is removed.
 */
export function standaloneSvg(container: string): string {
  const start = container.indexOf("<svg");
  const end = container.lastIndexOf("</svg>");
  if (start === -1 || end === -1) {
    throw new RenderError("E_INTERNAL", "MathJax produced no svg element");
  }
  const element = container.slice(start, end + "</svg>".length);
  const open = /^<svg([^>]*)>/.exec(element);
  if (open === null) {
    throw new RenderError("E_INTERNAL", "MathJax produced a malformed svg element");
  }
  const attrs = open[1]!;
  const width = /\swidth="([^"]+)"/.exec(attrs)?.[1];
  const height = /\sheight="([^"]+)"/.exec(attrs)?.[1];
  const viewBox = /\sviewBox="([^"]+)"/.exec(attrs)?.[1];
  if (width === undefined || height === undefined || viewBox === undefined) {
    throw new RenderError("E_INTERNAL", "MathJax svg has no width, height or viewBox");
  }
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${exToPx(width)}px" height="${exToPx(height)}px" viewBox="${viewBox}"`;
  return head + element.slice(open[0].length - 1);
}

/**
 * Renders LaTeX math to a standalone SVG with the glyphs as paths. The XML serializer escapes `<`, `>`,
 * `&` and `"` in the attribute values, so the TeX source in the data-latex attributes keeps the SVG
 * well-formed. Rejects with E_INPUT or E_UNSUPPORTED.
 */
export async function mathToSvg(source: string, options: MathOptions): Promise<string> {
  const tex = stripRequires(source);
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  let inputError: string | undefined;
  const input = new TeX({
    packages: [...MATH_PACKAGES],
    formatError: (jax: { formatError: (err: Error) => unknown }, err: Error) => {
      inputError ??= err.message;
      return jax.formatError(err);
    },
  });
  const output = new SVG({ fontCache: "none" });
  loadFontRanges(output.font);
  defineMhchemVariant(output.font);
  const doc = mathjax.document("", { InputJax: input, OutputJax: output });
  const node = doc.convert(tex,{ display: options.display });
  if (inputError !== undefined) {
    throw new RenderError("E_INPUT", `TeX input error: ${inputError}`);
  }
  const svg = standaloneSvg(adaptor.serializeXML(node));
  rejectFontFallback(svg);
  return svg;
}
