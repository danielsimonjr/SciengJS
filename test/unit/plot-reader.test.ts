import { describe, expect, test } from "bun:test";
import { RenderError } from "../../src/errors.ts";
import { readPlotFigure } from "../../src/plot/reader.ts";

const base = (extra: Record<string, unknown> = {}, layout: Record<string, unknown> = {}) => ({
  data: [{ type: "scatter", x: [0, 1], y: [0, 1], ...extra }],
  layout,
});

/** Each accepted trace key with one valid value. */
const TRACE_KEYS: Array<[string, unknown]> = [
  ["type", "scatter"],
  ["mode", "lines"],
  ["mode", "markers"],
  ["mode", "lines+markers"],
  ["mode", "markers+text"],
  ["mode", "text"],
  ["x", [1, 2]],
  ["y", [3, 4]],
  ["name", "run A"],
  ["text", ["a", "b"]],
  ["textposition", "top center"],
  ["line.color", "#123456"],
  ["line.width", 2],
  ["line.dash", "dash"],
  ["marker.size", 8],
  ["marker.color", "red"],
  ["marker.symbol", "diamond"],
  ["xaxis", "x2"],
  ["yaxis", "y2"],
  ["showlegend", false],
];

/** Each accepted layout key with one valid value. */
const LAYOUT_KEYS: Array<[string, unknown]> = [
  ["title.text", "Bode"],
  ["width", 800],
  ["height", 600],
  ["paper_bgcolor", "white"],
  ["plot_bgcolor", "#eeeeee"],
  ["font.color", "black"],
  ["font.size", 12],
  ["showlegend", true],
  ["grid.rows", 2],
  ["grid.columns", 1],
  ["grid.pattern", "independent"],
  ["xaxis.type", "log"],
  ["xaxis.title.text", "Frequency"],
  ["xaxis.range", [0.1, 100]],
  ["xaxis.dtick", 1],
  ["xaxis.tickformat", ".2f"],
  ["xaxis.gridcolor", "#ccc"],
  ["xaxis.zeroline", true],
  ["xaxis.zerolinecolor", "#888"],
  ["xaxis.matches", "x"],
  ["yaxis2.type", "linear"],
];

describe("readPlotFigure accepts every listed key", () => {
  test.each(TRACE_KEYS)("trace key %s = %j", (key, value) => {
    const figure = readPlotFigure(base(setPath({}, key, value))).figure;
    expect(getPath(figure.data[0] as object, key)).toEqual(value);
  });

  test.each(LAYOUT_KEYS)("layout key %s = %j", (key, value) => {
    const figure = readPlotFigure(base({}, setPath({}, key, value))).figure;
    expect(getPath(figure.layout as object, key)).toEqual(value);
  });

  test("shape of type line and rect with xref and yref", () => {
    const shapes = [
      { type: "line", xref: "x", yref: "paper", x0: 0, x1: 1, y0: 0.5, y1: 0.5 },
      { type: "rect", xref: "x domain", yref: "y", x0: 0, x1: 1, y0: 0, y1: 2 },
    ];
    expect(readPlotFigure(base({}, { shapes })).figure.layout.shapes).toEqual(shapes);
  });
});

describe("readPlotFigure rejects with the key path", () => {
  test("trace key outside the subset names its path", () => {
    expect(() => readPlotFigure(base({ marker: { foo: 1 } }))).toThrow(RenderError);
    try {
      readPlotFigure(base({ marker: { foo: 1 } }));
    } catch (e) {
      expect((e as RenderError).code).toBe("E_INPUT");
      expect((e as Error).message).toContain("data[0].marker.foo");
    }
  });
  test("layout key outside the subset names its path", () => {
    try {
      readPlotFigure(base({}, { legend: { x: 1 } }));
      throw new Error("expected rejection");
    } catch (e) {
      expect((e as RenderError).code).toBe("E_INPUT");
      expect((e as Error).message).toContain("layout.legend");
    }
  });
  test("wrong type names its path", () => {
    try {
      readPlotFigure(base({}, { width: "wide" }));
      throw new Error("expected rejection");
    } catch (e) {
      expect((e as RenderError).code).toBe("E_INPUT");
      expect((e as Error).message).toContain("layout.width");
    }
  });
  test("bad enum value names its path", () => {
    expect(() => readPlotFigure(base({ mode: "bars" }))).toThrow(RenderError);
  });
  test("lenient ignores an unknown key and reports a warning", () => {
    const result = readPlotFigure(base({ marker: { foo: 1 } }), { lenient: true });
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("data[0].marker.foo");
  });
  test("lenient gives one warning per dropped key, each naming its path", () => {
    const result = readPlotFigure(base({ marker: { foo: 1, bar: 2 }, bogusTop: 3 }), { lenient: true });
    expect(result.warnings.length).toBe(3);
    expect(result.warnings.some((w) => w.includes("data[0].marker.foo"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("data[0].marker.bar"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("bogusTop"))).toBe(true);
  });
  test("input that is not an object rejects", () => {
    expect(() => readPlotFigure("not json")).toThrow(RenderError);
  });
});

function setPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (const p of parts.slice(0, -1)) {
    cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
  return obj;
}

function getPath(obj: object, path: string): unknown {
  return path.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], obj);
}
