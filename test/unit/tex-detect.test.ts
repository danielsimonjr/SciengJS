import { describe, expect, test } from "bun:test";
import { detectBundles } from "../../src/tex/detect.ts";
import { rejection, returned } from "../support/rejections.ts";

/** Scans a source that must be accepted. A rejection fails as an assertion. */
const scan = (source: string) => returned(() => detectBundles(source));

describe("bundle names", () => {
  test("plain TikZ needs core only", () => {
    const d = scan("\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}");
    expect(d.bundles).toEqual(["core"]);
    expect(d.packages).toEqual(["tikz"]);
  });

  test("an empty source needs core", () => {
    expect(scan("")).toEqual({ bundles: ["core"], packages: [] });
  });

  test("core packages stay in core", () => {
    const d = scan("\\usepackage{xcolor,circuitikz}\\usepackage[all]{standalone}\\RequirePackage{tikz}");
    expect(d.bundles).toEqual(["core"]);
    expect(d.packages).toEqual(["circuitikz", "standalone", "tikz", "xcolor"]);
  });

  test("bundles are sorted with core first", () => {
    const d = scan("\\usepackage{mhchem}\\usepackage{amsmath}\\usepackage{tikz-cd}");
    expect(d.bundles).toEqual(["core", "diagrams", "math", "science"]);
  });

  test("one package of each bundle", () => {
    expect(scan("\\usepackage{tikz-3dplot}").bundles).toEqual(["core", "diagrams"]);
    expect(scan("\\usepackage{smartdiagram}").bundles).toEqual(["core", "diagrams"]);
    expect(scan("\\usepackage{chemfig}").bundles).toEqual(["core", "science"]);
    expect(scan("\\usepackage{simplekv,chemgreek,l3packages}").bundles).toEqual(["core", "science"]);
    expect(scan("\\usepackage{bussproofs}").bundles).toEqual(["core", "science"]);
    for (const name of ["amssymb", "amsfonts", "amsthm", "amscd", "eucal"]) {
      expect(scan(`\\usepackage{${name}}`).bundles).toEqual(["core", "math"]);
    }
  });
});

describe("package lines", () => {
  test("options and lists", () => {
    const d = scan("\\usepackage[utf8, T1]{inputenc}\n\\usepackage[a=b]{ amsmath ,\n amssymb }");
    expect(d.packages).toEqual(["amsmath", "amssymb", "inputenc"]);
    expect(d.bundles).toEqual(["core", "math"]);
  });

  test("RequirePackage forms", () => {
    expect(scan("\\RequirePackage[x]{mhchem}").bundles).toEqual(["core", "science"]);
    expect(scan("\\RequirePackageWithOptions{mhchem}").bundles).toEqual(["core", "science"]);
  });

  test("a package name is case sensitive", () => {
    const err = rejection(() => detectBundles("\\usepackage{TikZ}"));
    expect(err.code).toBe("E_UNSUPPORTED");
    expect(err.message).toContain("TikZ");
  });

  test("tikz libraries", () => {
    expect(scan("\\usetikzlibrary{arrows.meta,calc}").bundles).toEqual(["core"]);
    expect(scan("\\usetikzlibrary{arrows.meta, hobby}").bundles).toEqual(["core", "diagrams"]);
    expect(scan("\\usetikzlibrary{\n cd\n}").bundles).toEqual(["core", "diagrams"]);
    expect(scan("\\usetikzlibrary{hobby}").packages).toEqual([]);
  });

  test("a commented library list never counts", () => {
    expect(scan("% \\usetikzlibrary{hobby}").bundles).toEqual(["core"]);
  });
});

describe("environments and commands", () => {
  test("tikzcd", () => {
    const d = scan("\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}");
    expect(d.bundles).toEqual(["core", "diagrams"]);
    expect(d.packages).toEqual(["tikz-cd"]);
  });

  test("starred and spaced begin", () => {
    expect(scan("\\begin {align*} a \\end{align*}").bundles).toEqual(["core", "math"]);
  });

  test("science commands", () => {
    expect(scan("\\ce{H2O}").bundles).toEqual(["core", "science"]);
    expect(scan("\\ce{H2O}").packages).toEqual(["mhchem"]);
    expect(scan("\\chemfig{A-B}").packages).toEqual(["chemfig"]);
    expect(scan("\\begin{prooftree}\\AxiomC{a}\\end{prooftree}").packages).toEqual(["bussproofs"]);
    expect(scan("\\AxiomC{a}\\UnaryInfC{b}\\DisplayProof").packages).toEqual(["bussproofs"]);
  });

  test("diagram commands", () => {
    expect(scan("\\tdplotsetmaincoords{60}{110}").packages).toEqual(["tikz-3dplot"]);
    expect(scan("\\smartdiagram[flow diagram]{a,b}").packages).toEqual(["smartdiagram"]);
  });

  test("math commands", () => {
    expect(scan("$\\mathbb{R}$").packages).toEqual(["amssymb"]);
    expect(scan("$\\mathfrak g$").bundles).toEqual(["core", "math"]);
    expect(scan("$\\dfrac12$").packages).toEqual(["amsmath"]);
    expect(scan("$\\operatorname{sin}$").packages).toEqual(["amsmath"]);
    for (const env of ["pmatrix", "bmatrix", "cases", "gather", "aligned", "multline"]) {
      expect(scan(`\\begin{${env}} a \\end{${env}}`).bundles).toEqual(["core", "math"]);
    }
  });

  test("colour commands stay in core", () => {
    const d = scan("\\textcolor{red}{a}\\color{blue}\\definecolor{x}{rgb}{1,0,0}\\colorbox{y}{a}\\pagecolor{z}");
    expect(d.bundles).toEqual(["core"]);
    expect(d.packages).toEqual(["xcolor"]);
  });

  test("a longer command name never matches", () => {
    expect(scan("\\centering \\textbf{a} \\cell \\mathbbm \\ceil").bundles).toEqual(["core"]);
    expect(scan("\\ce").bundles).toEqual(["core", "science"]);
    expect(scan("\\ce{a}").bundles).toEqual(["core", "science"]);
    expect(scan("\\ce\\x").bundles).toEqual(["core", "science"]);
  });

  test("circuitikz and tikz commands", () => {
    expect(scan("\\begin{circuitikz}\\end{circuitikz}").packages).toEqual(["circuitikz"]);
    expect(scan("\\tikz \\draw (0,0);").packages).toEqual(["tikz"]);
  });

  test("explicit and implied packages merge once", () => {
    const d = scan("\\usepackage{amsmath}\\begin{align}a\\end{align}\\dfrac12");
    expect(d.packages).toEqual(["amsmath"]);
  });
});

describe("hidden text", () => {
  test("a comment hides a package line", () => {
    expect(scan("% \\usepackage{pgfplots}\n\\usepackage{tikz}").packages).toEqual(["tikz"]);
    expect(scan("\\usepackage{tikz} % \\usepackage{xy}").packages).toEqual(["tikz"]);
  });

  test("an escaped percent starts no comment", () => {
    const err = rejection(() => detectBundles("50\\% \\usepackage{xy}"));
    expect(err.message).toContain("xy");
  });

  test("a double backslash then percent starts a comment", () => {
    expect(scan("a\\\\% \\usepackage{xy}").packages).toEqual([]);
  });

  test("a command after a double backslash is not a command", () => {
    expect(scan("a\\\\ce{x}").bundles).toEqual(["core"]);
    expect(scan("a\\\\\\ce{x}").bundles).toEqual(["core", "science"]);
  });

  test("blanked text keeps its line breaks", () => {
    const err = rejection(() => detectBundles("% c\n\\begin{verbatim}\n\n\\end{verbatim}\n\\usepackage{xy}"));
    expect(err.line).toBe(5);
  });

  test("a comment ends at the line end", () => {
    const err = rejection(() => detectBundles("% one\n\\usepackage{xy}"));
    expect(err.code).toBe("E_UNSUPPORTED");
  });

  test("verbatim environments hide text", () => {
    expect(scan("\\begin{verbatim}\\usepackage{xy}\\end{verbatim}").packages).toEqual([]);
    expect(scan("\\begin{verbatim*}\\ce{x}\\end{verbatim*}").bundles).toEqual(["core"]);
    expect(scan("\\begin{lstlisting}\\usepackage{xy}\\end{lstlisting}").packages).toEqual([]);
    expect(scan("\\begin{minted}{c}\\usepackage{xy}\\end{minted}").packages).toEqual([]);
  });

  test("text after the verbatim end still counts", () => {
    const err = rejection(() => detectBundles("\\begin{verbatim}a\\end{verbatim}\\usepackage{xy}"));
    expect(err.message).toContain("xy");
  });

  test("an unterminated verbatim hides nothing", () => {
    const err = rejection(() => detectBundles("\\begin{verbatim}\\usepackage{xy}"));
    expect(err.message).toContain("xy");
  });

  test("a verbatim percent is no comment", () => {
    const err = rejection(() => detectBundles("\\begin{verbatim}%\\end{verbatim}\n\\usepackage{xy}"));
    expect(err.message).toContain("xy");
  });

  test("verb hides text up to its delimiter", () => {
    expect(scan("\\verb|\\usepackage{xy}|").packages).toEqual([]);
    expect(scan("\\verb*+\\ce{x}+").bundles).toEqual(["core"]);
    const err = rejection(() => detectBundles("\\verb|a|\\usepackage{xy}"));
    expect(err.message).toContain("xy");
  });

  test("verb never crosses a line", () => {
    const err = rejection(() => detectBundles("\\verb|a\n\\usepackage{xy}|"));
    expect(err.message).toContain("xy");
  });
});

describe("rejections", () => {
  const table: Array<[string, string]> = [
    ["pgfplots", "plotly"],
    ["pgf-umlsd", "Mermaid sequence diagram"],
    ["xy", "tikz-cd"],
    ["esvect", "\\vec"],
    ["mathrsfs", "\\mathscr"],
  ];
  for (const [name, replacement] of table) {
    test(`package line ${name}`, () => {
      const err = rejection(() => detectBundles(`\\usepackage{${name}}`));
      expect(err.code).toBe("E_UNSUPPORTED");
      expect(err.message).toContain(`"${name}"`);
      expect(err.message).toContain(replacement);
      expect(err.message).toContain("GPL");
    });
  }

  test("a GPL package inside a list", () => {
    const err = rejection(() => detectBundles("\\usepackage{tikz,pgfplots}"));
    expect(err.message).toContain("pgfplots");
  });

  test("environments and commands of GPL packages", () => {
    expect(rejection(() => detectBundles("\\begin{axis}\\addplot{x};\\end{axis}")).message).toContain("pgfplots");
    expect(rejection(() => detectBundles("\\addplot3 coordinates {};")).message).toContain("pgfplots");
    expect(rejection(() => detectBundles("\\addplot+ {};")).message).toContain("pgfplots");
    expect(rejection(() => detectBundles("\\begin{sequencediagram}\\end{sequencediagram}")).message).toContain("pgf-umlsd");
    expect(rejection(() => detectBundles("\\xymatrix{a}")).message).toContain("xy");
    expect(rejection(() => detectBundles("\\begin{xy}\\end{xy}")).message).toContain("xy");
    expect(rejection(() => detectBundles("$\\vv{a}$")).message).toContain("esvect");
    expect(rejection(() => detectBundles("$\\mathscr{A}$")).message).toContain("mathrsfs");
  });

  test("a package that no bundle holds", () => {
    const err = rejection(() => detectBundles("\\usepackage{fancyhdr}"));
    expect(err.code).toBe("E_UNSUPPORTED");
    expect(err.message).toContain('"fancyhdr"');
    expect(err.message).not.toContain("Replacement");
  });

  test("an inherited object key is no GPL package", () => {
    const err = rejection(() => detectBundles("\\usepackage{constructor}"));
    expect(err.message).toContain("is not in any bundle");
  });

  test("the rejection names its line", () => {
    const err = rejection(() => detectBundles("a\nb\n\\usepackage{tikz}\n\n\\usepackage{fancyhdr}"));
    expect(err.line).toBe(5);
  });

  test("the first bad package in the source wins", () => {
    const err = rejection(() => detectBundles("\\mathscr{A}\n\\usepackage{fancyhdr}"));
    expect(err.message).toContain("mathrsfs");
    const err2 = rejection(() => detectBundles("\\usepackage{fancyhdr}\n\\mathscr{A}"));
    expect(err2.message).toContain("fancyhdr");
  });

  test("a bad package inside a list reports the line of the list", () => {
    const err = rejection(() => detectBundles("\n\\usepackage{tikz,\nxy}"));
    expect(err.line).toBe(2);
  });
});

describe("font encodings", () => {
  test("the OT1 encoding is accepted, with no option or as an option", () => {
    expect(scan("\\usepackage{fontenc}").packages).toEqual(["fontenc"]);
    expect(scan("\\usepackage[OT1]{fontenc}").packages).toEqual(["fontenc"]);
    expect(scan("\\usepackage[]{fontenc}").bundles).toEqual(["core"]);
    expect(scan("\\usepackage[ OT1 ]{fontenc}").bundles).toEqual(["core"]);
  });

  test("an option of another package may name T1", () => {
    expect(scan("\\usepackage[utf8,T1]{inputenc}").packages).toEqual(["inputenc"]);
  });

  test("T1 rejects with the bundled encoding and the line", () => {
    const err = rejection(() => detectBundles("a\n\\usepackage[T1]{fontenc}"));
    expect(err.code).toBe("E_UNSUPPORTED");
    expect(err.message).toContain('"T1"');
    expect(err.message).toContain("only the OT1 encoding is bundled");
    expect(err.line).toBe(2);
  });

  test("any encoding other than OT1 rejects, also in a list of options", () => {
    for (const option of ["T2A", "OML", "T1,OT1", "OT1, T1", "OT1,\nT1", "LY1"]) {
      const err = rejection(() => detectBundles(`\\usepackage[${option}]{fontenc}`));
      expect(err.code).toBe("E_UNSUPPORTED");
      expect(err.message).toContain("only the OT1 encoding is bundled");
    }
  });

  test("the rejection names the first encoding that is not OT1", () => {
    expect(rejection(() => detectBundles("\\usepackage[OT1,T1,T2A]{fontenc}")).message).toContain('"T1"');
  });

  test("fontenc inside a list of packages and RequirePackage reject too", () => {
    expect(rejection(() => detectBundles("\\usepackage[T1]{tikz,fontenc}")).message).toContain("OT1");
    expect(rejection(() => detectBundles("\\RequirePackage[T1]{fontenc}")).message).toContain("OT1");
  });

  test("T1 in a comment or in verbatim text is no request", () => {
    expect(scan("% \\usepackage[T1]{fontenc}\n\\usepackage{fontenc}").packages).toEqual(["fontenc"]);
    expect(scan("\\begin{verbatim}\\usepackage[T1]{fontenc}\\end{verbatim}").packages).toEqual([]);
  });

  test("the encoding rule does not match another package name", () => {
    expect(scan("\\usepackage[T1]{inputenc}").packages).toEqual(["inputenc"]);
  });

  test("the first bad entry in the source wins", () => {
    expect(rejection(() => detectBundles("\\usepackage{fancyhdr}\n\\usepackage[T1]{fontenc}")).message).toContain("fancyhdr");
    expect(rejection(() => detectBundles("\\usepackage[T1]{fontenc}\n\\usepackage{fancyhdr}")).message).toContain("OT1");
  });
});
