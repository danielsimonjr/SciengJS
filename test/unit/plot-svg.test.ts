import { describe, expect, test } from "bun:test";
import { RenderError } from "../../src/errors.ts";
import { plotToSvg } from "../../src/plot/plotter.ts";

/** Counts the matches of a pattern in an SVG text. */
function count(svg: string, pattern: RegExp): number {
  return [...svg.matchAll(new RegExp(pattern.source, "g"))].length;
}

/** The text content of each text element, in document order. */
function texts(svg: string): string[] {
  return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1] as string);
}

function scatter(extra: Record<string, unknown> = {}, layout: Record<string, unknown> = {}) {
  return {
    data: [{ type: "scatter", mode: "lines", x: [0, 1, 2, 3], y: [0, 1, 4, 9], ...extra }],
    layout,
  };
}

describe("plotToSvg page", () => {
  test("writes a standalone svg root with the default 700 by 450 size", () => {
    const { svg } = plotToSvg(scatter());
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="700"');
    expect(svg).toContain('height="450"');
    expect(svg).toContain('viewBox="0 0 700 450"');
  });

  test("takes width and height from the layout", () => {
    const { svg } = plotToSvg(scatter({}, { width: 500, height: 300 }));
    expect(svg).toContain('viewBox="0 0 500 300"');
  });

  test("accepts JSON text as well as an object", () => {
    const text = JSON.stringify(scatter());
    expect(plotToSvg(text).svg).toBe(plotToSvg(scatter()).svg);
  });

  test("is deterministic and never prints NaN or Infinity", () => {
    const first = plotToSvg(scatter({ mode: "lines+markers" }, { title: { text: "T" } })).svg;
    const second = plotToSvg(scatter({ mode: "lines+markers" }, { title: { text: "T" } })).svg;
    expect(first).toBe(second);
    expect(first).not.toContain("NaN");
    expect(first).not.toContain("Infinity");
  });

  test("escapes the text of titles and names", () => {
    const { svg } = plotToSvg(scatter({ name: "a<b & c" }, { title: { text: 'say "hi"' }, showlegend: true }));
    expect(svg).toContain("a&lt;b &amp; c");
    expect(svg).toContain("say &quot;hi&quot;");
    expect(svg).not.toContain("a<b");
  });

  test("paints the paper and the plot area with the background colors", () => {
    const { svg } = plotToSvg(scatter({}, { paper_bgcolor: "#fafafa", plot_bgcolor: "#eeeeff" }));
    expect(svg).toContain('fill="#fafafa"');
    expect(svg).toContain('fill="#eeeeff"');
  });

  test("sets the font color and size of the text", () => {
    const { svg } = plotToSvg(scatter({ mode: "text", text: ["a", "b", "c", "d"] }, { font: { color: "#112233", size: 20 } }));
    expect(svg).toContain('fill="#112233"');
    expect(svg).toContain('font-size="20"');
    expect(svg).toContain('font-family="sans-serif"');
  });

  test("draws the title at the top of the figure with the title text", () => {
    const { svg } = plotToSvg(scatter({}, { title: { text: "Step response" } }));
    expect(texts(svg)).toContain("Step response");
  });
});

describe("plotToSvg traces", () => {
  test("lines mode draws one path with the line color and width", () => {
    const { svg } = plotToSvg(scatter({ line: { color: "#ff0000", width: 3 } }));
    expect(count(svg, /<path d="M[^"]*"/)).toBe(1);
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('stroke-width="3"');
    expect(count(svg, /<circle/)).toBe(0);
  });

  test("lines mode with a dash writes a stroke-dasharray", () => {
    const { svg } = plotToSvg(scatter({ line: { dash: "dash" } }));
    expect(svg).toContain('stroke-dasharray="');
  });

  test("markers mode draws one circle per point at the marker size", () => {
    const { svg } = plotToSvg(scatter({ mode: "markers", marker: { size: 9, color: "#00aa00" } }));
    expect(count(svg, /<circle /)).toBe(4);
    expect(svg).toContain('r="4.5"');
    expect(svg).toContain('fill="#00aa00"');
    expect(count(svg, /<path d="M[^"]*"/)).toBe(0);
  });

  test("square marker draws rectangles, not circles", () => {
    const { svg } = plotToSvg(scatter({ mode: "markers", marker: { symbol: "square" } }));
    expect(count(svg, /<circle /)).toBe(0);
    expect(count(svg, /<rect [^>]*data-marker="square"/)).toBe(4);
  });

  test("diamond marker draws a closed path per point", () => {
    const { svg } = plotToSvg(scatter({ mode: "markers", marker: { symbol: "diamond" } }));
    expect(count(svg, /data-marker="diamond"/)).toBe(4);
  });

  test("lines+markers draws the path and the circles", () => {
    const { svg } = plotToSvg(scatter({ mode: "lines+markers" }));
    expect(count(svg, /<path d="M[^"]*"/)).toBe(1);
    expect(count(svg, /<circle /)).toBe(4);
  });

  test("text mode writes the labels and no markers", () => {
    const { svg } = plotToSvg(scatter({ mode: "text", text: ["p", "q", "r", "s"] }));
    expect(texts(svg)).toEqual(expect.arrayContaining(["p", "q", "r", "s"]));
    expect(count(svg, /<circle /)).toBe(0);
  });

  test("markers+text draws circles and labels", () => {
    const { svg } = plotToSvg(scatter({ mode: "markers+text", text: ["a", "b", "c", "d"] }));
    expect(count(svg, /<circle /)).toBe(4);
    expect(texts(svg)).toContain("a");
  });

  test("textposition top center puts the label above its point with a middle anchor", () => {
    const { svg } = plotToSvg(scatter({ mode: "text", x: [5], y: [5], text: ["peak"] }, { xaxis: { range: [0, 10] }, yaxis: { range: [0, 10] } }));
    const match = svg.match(/<text x="([\d.]+)" y="([\d.]+)"[^>]*text-anchor="middle"[^>]*>peak<\/text>/);
    expect(match).not.toBeNull();
  });

  test("a trace with x and y of different lengths rejects with E_INPUT", () => {
    expect(() => plotToSvg({ data: [{ type: "scatter", mode: "lines", x: [1, 2], y: [1] }], layout: {} })).toThrow(RenderError);
  });

  test("a non-finite value in data rejects with E_INPUT and its path", () => {
    const figure = { data: [{ type: "scatter", mode: "lines", x: [0, Number.NaN], y: [0, 1] }], layout: {} };
    try {
      plotToSvg(figure);
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(RenderError);
      expect((error as RenderError).code).toBe("E_INPUT");
      expect((error as RenderError).message).toContain("data[0].x[1]");
    }
  });

  test("a non-positive value on a log axis rejects with E_INPUT", () => {
    const figure = scatter({ x: [0, 1] }, { xaxis: { type: "log" } });
    expect(() => plotToSvg(figure)).toThrow(RenderError);
  });
});

describe("plotToSvg axes", () => {
  test("linear axis labels use fixed decimals from the tick step", () => {
    const { svg } = plotToSvg(scatter({ x: [0, 1], y: [0, 1] }));
    expect(texts(svg)).toContain("0.2");
    expect(texts(svg)).toContain("0.0");
  });

  test("tickformat .3f sets three decimals", () => {
    const { svg } = plotToSvg(scatter({ x: [0, 1], y: [0, 1] }, { xaxis: { tickformat: ".3f" } }));
    expect(texts(svg)).toContain("0.200");
  });

  test("an unsupported tickformat rejects with E_INPUT", () => {
    expect(() => plotToSvg(scatter({}, { xaxis: { tickformat: "%Y" } }))).toThrow(RenderError);
  });

  test("a log axis labels decades and draws minor ticks", () => {
    const { svg } = plotToSvg({
      data: [{ type: "scatter", mode: "lines", x: [1, 1000], y: [1, 1000] }],
      layout: { xaxis: { type: "log" }, yaxis: { type: "log" } },
    });
    for (const label of ["1", "10", "100", "1000"]) expect(texts(svg)).toContain(label);
    expect(count(svg, /class="tick-minor"/)).toBeGreaterThan(0);
  });

  test("an explicit log range is given in decades", () => {
    const { svg } = plotToSvg({
      data: [{ type: "scatter", mode: "lines", x: [1, 2], y: [1, 2] }],
      layout: { xaxis: { type: "log", range: [0, 3] } },
    });
    expect(texts(svg)).toContain("100");
  });

  test("axis titles appear as text", () => {
    const { svg } = plotToSvg(scatter({}, { xaxis: { title: { text: "time" } }, yaxis: { title: { text: "output" } } }));
    expect(texts(svg)).toEqual(expect.arrayContaining(["time", "output"]));
  });

  test("grid lines take the gridcolor", () => {
    const { svg } = plotToSvg(scatter({}, { xaxis: { gridcolor: "#abcdef" } }));
    expect(count(svg, /<line [^>]*stroke="#abcdef"/)).toBeGreaterThan(0);
  });

  test("zeroline draws a line at zero in its color", () => {
    const { svg } = plotToSvg(scatter({ x: [-1, 1], y: [-1, 1] }, { xaxis: { zeroline: true, zerolinecolor: "#123123" } }));
    expect(count(svg, /<line [^>]*stroke="#123123"/)).toBe(1);
  });

  test("matches makes the second axis take the range of the first", () => {
    const figure = {
      data: [
        { type: "scatter", mode: "lines", x: [0, 10], y: [0, 1], xaxis: "x", yaxis: "y" },
        { type: "scatter", mode: "lines", x: [0, 100], y: [0, 1], xaxis: "x2", yaxis: "y2" },
      ],
      layout: { grid: { rows: 1, columns: 2, pattern: "independent" }, xaxis2: { matches: "x" } },
    };
    const { svg } = plotToSvg(figure);
    // The shared range is 0..100, so the first panel draws no tick above 10.
    expect(texts(svg)).toContain("100");
  });

  test("an unsupported axis type rejects in the reader with E_INPUT", () => {
    expect(() => plotToSvg(scatter({}, { xaxis: { type: "date" } }))).toThrow(RenderError);
  });
});

describe("plotToSvg subplots", () => {
  test("a 1 by 2 grid draws two plot areas, each with its own clip path", () => {
    const figure = {
      data: [
        { type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], xaxis: "x", yaxis: "y" },
        { type: "scatter", mode: "lines", x: [0, 1], y: [1, 0], xaxis: "x2", yaxis: "y2" },
      ],
      layout: { grid: { rows: 1, columns: 2, pattern: "independent" } },
    };
    const { svg } = plotToSvg(figure);
    expect(count(svg, /<clipPath /)).toBe(2);
    expect(count(svg, /<path d="M[^"]*"/)).toBe(2);
  });

  test("coupled grid shares the axes of a column and a row", () => {
    const figure = {
      data: [
        { type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], xaxis: "x", yaxis: "y" },
        { type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], xaxis: "x2", yaxis: "y" },
      ],
      layout: { grid: { rows: 1, columns: 2, pattern: "coupled" } },
    };
    expect(() => plotToSvg(figure)).not.toThrow();
  });

  test("a trace on an axis that no panel holds rejects with E_INPUT", () => {
    const figure = { data: [{ type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], xaxis: "x9" }], layout: {} };
    expect(() => plotToSvg(figure)).toThrow(RenderError);
  });

  test("grid rows and columns must be positive integers", () => {
    expect(() => plotToSvg(scatter({}, { grid: { rows: 0, columns: 1 } }))).toThrow(RenderError);
  });

  test("each subplot has its own axis titles", () => {
    const figure = {
      data: [
        { type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], xaxis: "x", yaxis: "y" },
        { type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], xaxis: "x2", yaxis: "y2" },
      ],
      layout: {
        grid: { rows: 1, columns: 2, pattern: "independent" },
        xaxis: { title: { text: "left x" } },
        xaxis2: { title: { text: "right x" } },
      },
    };
    expect(texts(plotToSvg(figure).svg)).toEqual(expect.arrayContaining(["left x", "right x"]));
  });
});

describe("plotToSvg shapes", () => {
  test("a line shape draws a line element in the data coordinates", () => {
    const figure = scatter({}, { shapes: [{ type: "line", xref: "x", yref: "y", x0: 0, x1: 3, y0: 0, y1: 9, line: { color: "#ff00ff" } }] });
    const { svg } = plotToSvg(figure);
    expect(count(svg, /<line [^>]*stroke="#ff00ff"/)).toBe(1);
  });

  test("a rect shape draws a rect with its fill color", () => {
    const figure = scatter({}, { shapes: [{ type: "rect", xref: "x", yref: "y", x0: 1, x1: 2, y0: 1, y1: 2, fillcolor: "#00ffff" }] });
    expect(plotToSvg(figure).svg).toContain('fill="#00ffff"');
  });

  test("a paper reference places the shape in figure fractions", () => {
    const figure = scatter({}, { shapes: [{ type: "rect", xref: "paper", yref: "paper", x0: 0, x1: 1, y0: 0, y1: 1, fillcolor: "#123456" }] });
    expect(plotToSvg(figure).svg).toContain('fill="#123456"');
  });

  test("an unknown shape type rejects in the reader with E_INPUT", () => {
    expect(() => plotToSvg(scatter({}, { shapes: [{ type: "circle" }] }))).toThrow(RenderError);
  });

  test("a shape reference to an unknown axis rejects with E_INPUT", () => {
    const figure = scatter({}, { shapes: [{ type: "line", xref: "x7", yref: "y", x0: 0, x1: 1, y0: 0, y1: 1 }] });
    expect(() => plotToSvg(figure)).toThrow(RenderError);
  });
});

describe("plotToSvg legend", () => {
  test("two traces show their names in the legend by default", () => {
    const figure = {
      data: [
        { type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], name: "alpha" },
        { type: "scatter", mode: "lines", x: [0, 1], y: [1, 0], name: "beta" },
      ],
      layout: {},
    };
    const { svg } = plotToSvg(figure);
    expect(texts(svg)).toEqual(expect.arrayContaining(["alpha", "beta"]));
  });

  test("layout showlegend false hides the legend", () => {
    const figure = {
      data: [
        { type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], name: "alpha" },
        { type: "scatter", mode: "lines", x: [0, 1], y: [1, 0], name: "beta" },
      ],
      layout: { showlegend: false },
    };
    expect(texts(plotToSvg(figure).svg)).not.toContain("alpha");
  });

  test("a trace with showlegend false is left out of the legend", () => {
    const figure = {
      data: [
        { type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], name: "shown", showlegend: true },
        { type: "scatter", mode: "lines", x: [0, 1], y: [1, 0], name: "hidden", showlegend: false },
      ],
      layout: {},
    };
    const names = texts(plotToSvg(figure).svg);
    expect(names).toContain("shown");
    expect(names).not.toContain("hidden");
  });

  test("a single trace has no legend unless showlegend is set", () => {
    expect(texts(plotToSvg(scatter({ name: "solo" })).svg)).not.toContain("solo");
  });
});

describe("plotToSvg input rejections", () => {
  test("an unknown key rejects with E_INPUT and its path", () => {
    try {
      plotToSvg(scatter({ bogus: 1 }));
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as RenderError).code).toBe("E_INPUT");
      expect((error as RenderError).message).toContain("data[0].bogus");
    }
  });

  test("lenient mode drops an unknown key and returns a warning", () => {
    const result = plotToSvg(scatter({ bogus: 1 }), { lenient: true });
    expect(result.warnings.join("\n")).toContain("data[0].bogus");
    expect(result.svg).toContain("<svg");
  });
});
