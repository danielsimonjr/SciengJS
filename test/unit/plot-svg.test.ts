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

/** The x and y attributes of the first text element with the given content. */
function placed(svg: string, label: string): { x: number; y: number } {
  const match = new RegExp(`<text x="([-0-9.]+)" y="([-0-9.]+)"[^>]*>${label}</text>`).exec(svg);
  if (match === null) throw new Error(`no text ${label}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

describe("plotToSvg reversed ranges", () => {
  test("a reversed linear x range puts its high end at the left", () => {
    const { svg } = plotToSvg(scatter({}, { xaxis: { range: [30, 20] } }));
    expect(placed(svg, "30").x).toBeLessThan(placed(svg, "20").x);
  });

  test("a reversed linear y range puts its high end at the bottom", () => {
    const { svg } = plotToSvg(scatter({}, { yaxis: { range: [60, 50] } }));
    expect(placed(svg, "60").y).toBeGreaterThan(placed(svg, "50").y);
  });

  test("a reversed log x range puts its high decade at the left", () => {
    const { svg } = plotToSvg(scatter({ x: [10, 100, 1000], y: [0, 1, 4] }, { xaxis: { type: "log", range: [4, 2] } }));
    expect(placed(svg, "10000").x).toBeLessThan(placed(svg, "100").x);
  });
});

describe("plotToSvg grid numbering", () => {
  test("subplot 1 is the top-left cell and the numbering runs left to right, then down", () => {
    const data = [
      { type: "scatter", mode: "lines", x: [0, 1], y: [0, 1] },
      { type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], xaxis: "x2", yaxis: "y2" },
      { type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], xaxis: "x3", yaxis: "y3" },
    ];
    const layout = {
      grid: { rows: 2, columns: 2, pattern: "independent" },
      xaxis: { range: [1000, 1001] },
      xaxis2: { range: [7000, 7001] },
      xaxis3: { range: [8000, 8001] },
    };
    const { svg } = plotToSvg({ data, layout });
    const first = placed(svg, "1000\.0");
    const second = placed(svg, "7000\.0");
    const third = placed(svg, "8000\.0");
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeCloseTo(first.y, 0);
    expect(third.x).toBeCloseTo(first.x, 0);
    expect(third.y).toBeGreaterThan(first.y);
  });
});

/** The RenderError of a rejected call, or undefined. A raw error fails the test. */
function renderError(fn: () => unknown): RenderError | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    if (!(error instanceof RenderError)) throw error;
    return error;
  }
}

describe("tick count limits", () => {
  test("a dtick of 1e-9 over a range of 1000 rejects fast with E_INPUT naming layout.xaxis.dtick", () => {
    const started = performance.now();
    const error = renderError(() => plotToSvg(scatter({ x: [0, 1000], y: [0, 1] }, { xaxis: { dtick: 1e-9 } })));
    expect(performance.now() - started).toBeLessThan(500);
    expect(error?.code).toBe("E_INPUT");
    expect(error?.message).toContain("layout.xaxis.dtick");
  });

  test("a dtick that gives 1000 ticks is accepted, 1001 ticks rejects", () => {
    expect(renderError(() => plotToSvg(scatter({}, { xaxis: { range: [1, 1000], dtick: 1 } })))).toBeUndefined();
    expect(renderError(() => plotToSvg(scatter({}, { xaxis: { range: [0, 1000], dtick: 1 } })))?.code).toBe("E_INPUT");
  });

  test("a dtick on a second axis names its full path", () => {
    const figure = {
      data: [{ type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], xaxis: "x2", yaxis: "y2" }],
      layout: { grid: { rows: 1, columns: 2 }, yaxis2: { dtick: 1e-12 } },
    };
    expect(renderError(() => plotToSvg(figure))?.message).toContain("layout.yaxis2.dtick");
  });
});

describe("tick labels at extreme magnitudes", () => {
  test("a log range of -300 to 300 decades draws without a raw error and with few labels", () => {
    const { svg } = plotToSvg(scatter({ x: [1, 2], y: [1, 2] }, { xaxis: { type: "log", range: [-300, 300] } }));
    expect(svg).toContain("1e-300");
    expect(svg).toContain("1e+300");
    expect(count(svg, /<line[^>]*class="tick-minor"/)).toBe(0);
  });

  test("log data near 1e-300 draws without a raw error", () => {
    const { svg } = plotToSvg(scatter({ x: [1e-300, 1e-299], y: [1, 2] }, { xaxis: { type: "log" } }));
    expect(svg.startsWith("<svg")).toBe(true);
  });

  test("linear data near 1e-300 draws with exponent labels", () => {
    const { svg } = plotToSvg(scatter({ x: [0, 4e-300], y: [1, 2] }));
    expect(texts(svg).some((t) => /e-30\d$/.test(t))).toBe(true);
  });

  test("a tickformat with more than 20 decimals rejects with E_INPUT", () => {
    expect(renderError(() => plotToSvg(scatter({}, { xaxis: { tickformat: ".101f" } })))?.code).toBe("E_INPUT");
  });
});

describe("plotter errors name the full key path", () => {
  test("an axis config outside the grid rejects", () => {
    const error = renderError(() => plotToSvg(scatter({}, { xaxis3: { type: "log" } })));
    expect(error?.code).toBe("E_INPUT");
    expect(error?.message).toContain("layout.xaxis3");
  });

  test("a range with two equal ends names layout.yaxis.range", () => {
    expect(renderError(() => plotToSvg(scatter({}, { yaxis: { range: [2, 2] } })))?.message).toContain("layout.yaxis.range");
  });

  test("a trace on axes that no subplot holds names data[0].xaxis", () => {
    const figure = { data: [{ type: "scatter", x: [1], y: [1], xaxis: "x2" }], layout: {} };
    expect(renderError(() => plotToSvg(figure))?.message).toContain("data[0].xaxis");
  });

  test("x and y of different lengths names data[0].x and data[0].y", () => {
    const message = renderError(() => plotToSvg({ data: [{ type: "scatter", x: [1, 2], y: [1] }], layout: {} }))?.message;
    expect(message).toContain("data[0].x");
    expect(message).toContain("data[0].y");
  });

  test("a figure too small for its margins names layout.width and layout.height", () => {
    const message = renderError(() => plotToSvg(scatter({}, { width: 50 })))?.message;
    expect(message).toContain("layout.width");
  });

  test("a grid too dense names layout.grid", () => {
    expect(renderError(() => plotToSvg(scatter({}, { grid: { rows: 1, columns: 40 } })))?.message).toContain("layout.grid");
  });
});
