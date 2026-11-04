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
 * Rejects a `\require` of a package that this build does not hold. MathJax never fetches a package,
 * so the check runs before the render and names the package. A package listed as held passes.
 */
export function checkRequires(source: string): void {
  for (const match of source.matchAll(REQUIRE)) {
    for (const raw of match[1]!.split(",")) {
      const name = raw.trim();
      if (name !== "" && !MATH_PACKAGES.includes(name)) {
        throw new RenderError("E_UNSUPPORTED", `the math stage does not hold the package ${name}`);
      }
    }
  }
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

/** Renders LaTeX math to a standalone SVG with the glyphs as paths. Rejects with E_INPUT or E_UNSUPPORTED. */
export async function mathToSvg(source: string, options: MathOptions): Promise<string> {
  checkRequires(source);
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
  const node = doc.convert(source, { display: options.display });
  if (inputError !== undefined) {
    throw new RenderError("E_INPUT", `TeX input error: ${inputError}`);
  }
  return standaloneSvg(adaptor.outerHTML(node));
}
