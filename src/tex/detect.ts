import { RenderError } from "../errors.ts";

/**
 * Package detection of the TeX stage.
 *
 * The method follows the templater of the Upmath renderer (parpalak/i.upmath.me, MIT licence,
 * copyright Roman Parpalak): the scan looks for known environments and commands in the source
 * and names the package that each one needs. This module adds package lines, TikZ libraries,
 * the comment and verbatim blanking, the bundle tables and the rejection of packages that no
 * bundle holds. It copies no code of the templater.
 *
 * The scan is not a security boundary. TeX runs on a virtual file tree that holds only the
 * bundles, so a package that the scan misses fails inside TeX.
 */

/** The name of a TeX bundle. */
export type BundleName = "core" | "diagrams" | "science" | "math";

/** The result of a scan. */
export interface Detection {
  /** The bundles that the source needs, sorted, with `core` first. */
  bundles: BundleName[];
  /** The packages that the source names or implies, sorted, each one once. */
  packages: string[];
}

/** The allowed package names of each bundle. */
const BUNDLE_PACKAGES: Record<BundleName, readonly string[]> = {
  core: [
    "tikz", "pgf", "xcolor", "color", "circuitikz", "standalone", "graphicx", "xkeyval",
    "etoolbox", "ifthen", "array", "calc", "fontenc", "inputenc", "textcomp", "xspace",
  ],
  diagrams: ["tikz-cd", "tikz-3dplot", "smartdiagram"],
  science: ["chemfig", "simplekv", "mhchem", "chemgreek", "l3packages", "bussproofs"],
  math: ["amsmath", "amssymb", "amsfonts", "amsthm", "amscd", "amsbsy", "amsopn", "amstext", "amsgen", "eucal"],
};

/** The TikZ libraries that a bundle other than core holds. */
const DIAGRAM_LIBRARIES: readonly string[] = ["hobby", "cd"];

/** The packages with the GPL as their only licence, each with its replacement. */
const GPL_REPLACEMENTS: Readonly<Record<string, string>> = {
  pgfplots: "the plotly input type and the plot stage",
  "pgf-umlsd": "a Mermaid sequence diagram",
  xy: "tikz-cd",
  esvect: "\\vec or \\overrightarrow",
  mathrsfs: "\\mathscr from the AMS eucal package",
};

/** Environments that need a package. A starred form matches too. */
const ENVIRONMENT_RULES: ReadonlyArray<readonly [string, string]> = [
  ["tikzpicture", "tikz"],
  ["circuitikz", "circuitikz"],
  ["tikzcd", "tikz-cd"],
  ["prooftree", "bussproofs"],
  ["sequencediagram", "pgf-umlsd"],
  ["axis", "pgfplots"],
  ["xy", "xy"],
  ...[
    "align", "alignat", "flalign", "gather", "multline", "split", "aligned", "gathered", "subequations",
    "cases", "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "smallmatrix",
  ].map((name): readonly [string, string] => [name, "amsmath"]),
];

/** Commands that need a package. A longer command name never matches. */
const COMMAND_RULES: ReadonlyArray<readonly [string, string]> = [
  ["tikz", "tikz"],
  ["smartdiagram", "smartdiagram"],
  ["tdplotsetmaincoords", "tikz-3dplot"],
  ["tdplotsetrotatedcoords", "tikz-3dplot"],
  ["ce", "mhchem"],
  ["chemfig", "chemfig"],
  ["addplot", "pgfplots"],
  ["xymatrix", "xy"],
  ["vv", "esvect"],
  ["mathscr", "mathrsfs"],
  ...["DisplayProof", "AxiomC", "UnaryInfC", "BinaryInfC", "TrinaryInfC", "QuaternaryInfC", "QuinaryInfC"].map(
    (name): readonly [string, string] => [name, "bussproofs"],
  ),
  ...["color", "textcolor", "colorbox", "pagecolor", "definecolor"].map(
    (name): readonly [string, string] => [name, "xcolor"],
  ),
  ...["mathbb", "mathfrak"].map((name): readonly [string, string] => [name, "amssymb"]),
  ...["text", "dfrac", "tfrac", "binom", "operatorname", "intertext", "substack"].map(
    (name): readonly [string, string] => [name, "amsmath"],
  ),
];

/** Environments whose body the scan blanks. */
const VERBATIM_BEGIN = /^\\begin\s*\{(verbatim\*?|lstlisting|minted)\}/;
const VERB = /^\\verb\*?([^A-Za-z\s*])/;
const PACKAGE_LINE = /\\(?:usepackage|RequirePackage(?:WithOptions)?)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
const LIBRARY_LINE = /\\usetikzlibrary\s*\{([^}]*)\}/g;

const BUNDLE_OF = new Map<string, BundleName>();
for (const [bundle, names] of Object.entries(BUNDLE_PACKAGES) as Array<[BundleName, readonly string[]]>) {
  for (const name of names) {
    BUNDLE_OF.set(name, bundle);
  }
}

interface Finding {
  name: string;
  index: number;
}

/** Replaces the characters of a range with spaces and keeps the line breaks. */
function blank(chars: string[], from: number, to: number): void {
  for (let k = from; k < to; k += 1) {
    if (chars[k] !== "\n") {
      chars[k] = " ";
    }
  }
}

/**
 * Blanks the comments, the verbatim bodies, the `\verb` text and each double backslash.
 * The result has the length of the source and the same line breaks.
 */
function sanitize(source: string): string {
  const chars = source.split("");
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "%") {
      const end = source.indexOf("\n", i);
      const stop = end < 0 ? source.length : end;
      blank(chars, i, stop);
      i = stop;
    } else if (c === "\\") {
      const rest = source.slice(i, i + 40);
      const begin = VERBATIM_BEGIN.exec(rest);
      const verb = VERB.exec(rest);
      const next = source[i + 1];
      if (begin !== null) {
        const bodyStart = i + begin[0].length;
        const end = source.indexOf(`\\end{${begin[1]}}`, bodyStart);
        if (end >= 0) {
          blank(chars, bodyStart, end);
          i = end;
        } else {
          i = bodyStart;
        }
      } else if (verb !== null) {
        const textStart = i + verb[0].length;
        const close = source.indexOf(verb[1] as string, textStart);
        const lineEnd = source.indexOf("\n", textStart);
        if (close >= 0 && (lineEnd < 0 || close < lineEnd)) {
          blank(chars, i, close + 1);
          i = close + 1;
        } else {
          i += verb[0].length;
        }
      } else if (next === "\\") {
        blank(chars, i, i + 2);
        i += 2;
      } else {
        i += 2;
      }
    } else {
      i += 1;
    }
  }
  return chars.join("");
}

/** Collects the first position of each package that the clean text names or implies. */
function findPackages(text: string): { findings: Finding[]; extra: Set<BundleName> } {
  const findings: Finding[] = [];
  const extra = new Set<BundleName>();
  for (const m of text.matchAll(PACKAGE_LINE)) {
    for (const part of (m[1] as string).split(",")) {
      const name = part.trim();
      if (name !== "") {
        findings.push({ name, index: m.index });
      }
    }
  }
  for (const m of text.matchAll(LIBRARY_LINE)) {
    for (const part of (m[1] as string).split(",")) {
      if (DIAGRAM_LIBRARIES.includes(part.trim())) {
        extra.add("diagrams");
      }
    }
  }
  for (const [env, name] of ENVIRONMENT_RULES) {
    const hit = new RegExp(`\\\\begin\\s*\\{${env}\\*?\\}`).exec(text);
    if (hit !== null) {
      findings.push({ name, index: hit.index });
    }
  }
  for (const [command, name] of COMMAND_RULES) {
    const hit = new RegExp(`\\\\${command}(?![A-Za-z])`).exec(text);
    if (hit !== null) {
      findings.push({ name, index: hit.index });
    }
  }
  return { findings, extra };
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let k = 0; k < index; k += 1) {
    if (text[k] === "\n") {
      line += 1;
    }
  }
  return line;
}

/**
 * Scans a TeX source and names the bundles that it needs.
 * Throws E_UNSUPPORTED for a package with the GPL as its only licence and for a package that no bundle holds.
 */
export function detectBundles(source: string): Detection {
  const text = sanitize(source);
  const { findings, extra } = findPackages(text);
  findings.sort((a, b) => a.index - b.index);
  const bundles = new Set<BundleName>(["core", ...extra]);
  const packages = new Set<string>();
  for (const { name, index } of findings) {
    const replacement = Object.hasOwn(GPL_REPLACEMENTS, name) ? GPL_REPLACEMENTS[name] : undefined;
    const bundle = BUNDLE_OF.get(name);
    if (replacement !== undefined) {
      throw new RenderError(
        "E_UNSUPPORTED",
        `TeX package "${name}" has the GPL as its only licence, so no bundle holds it. Replacement: ${replacement}.`,
        { line: lineOf(text, index) },
      );
    }
    if (bundle === undefined) {
      throw new RenderError("E_UNSUPPORTED", `TeX package "${name}" is not in any bundle.`, {
        line: lineOf(text, index),
      });
    }
    bundles.add(bundle);
    packages.add(name);
  }
  const rest = [...bundles].filter((b) => b !== "core").sort();
  return { bundles: ["core", ...rest] as BundleName[], packages: [...packages].sort() };
}
