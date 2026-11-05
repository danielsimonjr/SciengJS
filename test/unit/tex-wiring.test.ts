import { describe, expect, test } from "bun:test";
import { DEFAULT_REGISTRY } from "../../src/registry.ts";
import { PAIRS } from "../../src/pairs.ts";
import { wrapSource } from "../../src/tex/stage.ts";
import { render as renderSvg } from "../../src/tex/backend-svg.ts";
import { testSettings } from "../support/settings.ts";
import { rejectionOf } from "../support/rejections.ts";

describe("tikz registry entries", () => {
  test("tikz:svg, tikz:png and tikz:pdf have a backend module each", () => {
    expect(DEFAULT_REGISTRY["tikz:svg"]!.backend).toBe("tex/etex");
    expect(DEFAULT_REGISTRY["tikz:png"]!.backend).toBe("tex/etex+raster/resvg");
    expect(DEFAULT_REGISTRY["tikz:pdf"]!.backend).toBe("tex/etex+browser/chromium");
    expect(DEFAULT_REGISTRY["tikz:svg"]!.moduleUrl).toContain("/tex/backend-svg.");
    expect(DEFAULT_REGISTRY["tikz:png"]!.moduleUrl).toContain("/tex/backend-png.");
    expect(DEFAULT_REGISTRY["tikz:pdf"]!.moduleUrl).toContain("/tex/backend-pdf.");
  });

  test("every tikz pair of the design has a registry entry", () => {
    for (const p of PAIRS.filter((x) => x.type === "tikz")) expect(DEFAULT_REGISTRY[`tikz:${p.format}`]).toBeDefined();
  });
});

describe("wrapSource", () => {
  test("a bare picture goes into a standalone document with the dvisvgm option", () => {
    const out = wrapSource("\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}", []);
    expect(out.startsWith("\\documentclass[dvisvgm]{standalone}\n\\begin{document}\n")).toBe(true);
    expect(out.endsWith("\\end{tikzpicture}\n\\end{document}\n")).toBe(true);
  });

  test("a detected package that the format does not hold gets a usepackage line; the format packages do not", () => {
    const out = wrapSource("x", ["tikz", "circuitikz", "tikz-cd", "amsmath"]);
    expect(out).toContain("\\usepackage{tikz-cd}\n\\usepackage{amsmath}\n");
    expect(out).not.toContain("\\usepackage{tikz}");
    expect(out).not.toContain("\\usepackage{circuitikz}");
  });

  test("a document keeps its text and gains the dvisvgm class option once", () => {
    expect(wrapSource("\\documentclass{standalone}\n\\begin{document}x\\end{document}", [])).toBe(
      "\\documentclass[dvisvgm]{standalone}\n\\begin{document}x\\end{document}",
    );
    expect(wrapSource("\\documentclass[border=2pt, dvisvgm]{standalone}\nx", [])).toBe("\\documentclass[border=2pt,dvisvgm]{standalone}\nx");
  });
});

describe("tikz backend without bundles", () => {
  test("a render with the network off and an empty cache rejects with E_STAGE_MISSING that names the core bundle", async () => {
    const settings = testSettings({ allowNetwork: "none", cacheDir: `${process.env.TEMP ?? "/tmp"}/scieng-empty-cache-${process.pid}` });
    const err = await rejectionOf(
      renderSvg({ type: "tikz", format: "svg", source: "\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}", options: {}, settings }),
    );
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(err.message).toContain("core");
  });

  test("a source with a package that no bundle holds rejects with E_UNSUPPORTED before any bundle loads", async () => {
    const err = await rejectionOf(
      renderSvg({ type: "tikz", format: "svg", source: "\\usepackage{pgfplots}\n\\begin{tikzpicture}\\end{tikzpicture}", options: {}, settings: testSettings({ allowNetwork: "none" }) }),
    );
    expect(err.code).toBe("E_UNSUPPORTED");
  });
});
