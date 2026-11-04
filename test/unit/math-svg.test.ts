import { describe, expect, test } from "bun:test";
import { mathToSvg } from "../../src/math/tex.ts";
import { rejectionOf } from "../support/rejections.ts";
import { xmlErrors } from "../support/xml-wellformed.ts";

const CORPUS: Array<[string, string]> = [
  ["fraction", "\\frac{a+b}{c-d}"],
  ["matrix", "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}"],
  ["align", "\\begin{aligned} x &= 1 \\\\ y &= 2 \\end{aligned}"],
  ["sum-integral", "\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\int_0^1 x\\,dx"],
  ["greek", "\\alpha + \\beta \\Gamma \\omega"],
  ["blackboard-calligraphic", "\\mathbb{R}^n \\subset \\mathcal{L}"],
  ["text", "x \\text{ if } x > 0"],
];

/** Scans an SVG for any font or external reference. */
function fontReferences(svg: string): string[] {
  const found: string[] = [];
  if (/font-family/i.test(svg)) found.push("font-family");
  if (/@font-face/i.test(svg)) found.push("@font-face");
  if (/<text[\s>]/i.test(svg)) found.push("<text>");
  const ids = new Set([...svg.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]!));
  for (const m of svg.matchAll(/(?:href|xlink:href)\s*=\s*"([^"]*)"/g)) {
    const target = m[1]!;
    if (!(target.startsWith("#") && ids.has(target.slice(1)))) found.push(`href=${target}`);
  }
  return found;
}

describe("math to svg", () => {
  for (const [name, tex] of CORPUS) {
    test(`${name} renders a standalone svg with no font reference`, async () => {
      const svg = await mathToSvg(tex, { display: true });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain("viewBox=");
      expect(svg).toMatch(/<svg[^>]*\swidth="[\d.]+px"/);
      expect(svg).toMatch(/<svg[^>]*\sheight="[\d.]+px"/);
      expect(svg).toContain("<path");
      expect(fontReferences(svg)).toEqual([]);
      expect(xmlErrors(svg)).toEqual([]);
    });
  }

  const XML_CASES = ["a<b", "x<y<z", "a\\&b", "\\ce{A <- B}", "\\ce{A <-> B}", "\\ce{A <=> B}", 'x \\text{"q"}'];
  for (const tex of XML_CASES) {
    test(`source ${tex} gives well-formed xml`, async () => {
      const svg = await mathToSvg(tex, { display: true });
      expect(xmlErrors(svg)).toEqual([]);
    });
  }

  const ARROWS = [
    "\\ce{A -> B}",
    "\\ce{A <- B}",
    "\\ce{A <-> B}",
    "\\ce{A <=> B}",
    "\\ce{A <=>> B}",
    "\\ce{A <<=> B}",
    "\\ce{A <--> B}",
    "\\ce{A ->[x] B}",
    "\\ce{A <-[x] B}",
    "\\ce{A <=>[x][y] B}",
  ];
  for (const tex of ARROWS) {
    test(`mhchem arrow ${tex} draws every glyph as a path`, async () => {
      const svg = await mathToSvg(tex, { display: true });
      expect(fontReferences(svg)).toEqual([]);
      expect(xmlErrors(svg)).toEqual([]);
    });
  }

  for (const [tex, char] of [["中", "中"], ["\\text{héllo 中}", "中"]]) {
    test(`a character with no glyph (${tex}) rejects with E_UNSUPPORTED and names it`, async () => {
      const err = await rejectionOf(mathToSvg(tex!, { display: true }));
      expect(err.code).toBe("E_UNSUPPORTED");
      expect(err.message).toContain(char!);
      expect(err.message).toContain("U+4E2D");
    });
  }

  test("a require of a held package is a no-op", async () => {
    const plain = await mathToSvg("\\ce{H2O}", { display: true });
    const required = await mathToSvg("\\require{mhchem}\\ce{H2O}", { display: true });
    expect(required).toEqual(plain);
  });

  test("a require of several held packages is a no-op", async () => {
    const svg = await mathToSvg("\\require{ams, color}x", { display: true });
    expect(svg).toEqual(await mathToSvg("x", { display: true }));
  });

  test("the chemistry sample renders through mhchem", async () => {
    const svg = await mathToSvg("\\ce{H2O + CO2 -> H2CO3}", { display: false });
    expect(svg).toContain("<path");
    expect(fontReferences(svg)).toEqual([]);
  });

  test("display false keeps the svg inline-sized", async () => {
    const inline = await mathToSvg("x^2", { display: false });
    const display = await mathToSvg("x^2", { display: true });
    expect(inline).not.toEqual(display);
  });

  test("invalid TeX rejects with E_INPUT and MathJax's message", async () => {
    const err = await rejectionOf(mathToSvg("\\notamacro{x}", { display: true }));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("notamacro");
  });

  test("an undefined macro rejects with E_INPUT and names it", async () => {
    const err = await rejectionOf(mathToSvg("\\foo", { display: true }));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("\\foo");
  });

  test("a parse error rejects with E_INPUT and MathJax's message", async () => {
    const err = await rejectionOf(mathToSvg("\\frac{a}", { display: true }));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("Missing argument for \\frac");
  });

  test("a package that the build does not hold rejects with E_UNSUPPORTED", async () => {
    const err = await rejectionOf(mathToSvg("\\require{physics-x}x", { display: true }));
    expect(err.code).toBe("E_UNSUPPORTED");
    expect(err.message).toContain("physics-x");
  });

  test("a require of a held and an unknown package rejects with E_UNSUPPORTED", async () => {
    const err = await rejectionOf(mathToSvg("\\require{mhchem,physics-x}x", { display: true }));
    expect(err.code).toBe("E_UNSUPPORTED");
    expect(err.message).toContain("physics-x");
  });
});
