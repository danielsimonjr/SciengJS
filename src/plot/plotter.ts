import { RenderError } from "../errors.ts";
import { readPlotFigure } from "./reader.ts";
import { MAX_TICKS, linearTicks, logTicks, paddedRange } from "./ticks.ts";

// Plotly figure subset to standalone SVG. Every number is formatted with a fixed
// number of decimals, so the same figure always gives the same bytes.

type Rec = Record<string, unknown>;

/** One axis: its scale in axis units (log10 units for a log axis). */
interface Scale {
  log: boolean;
  lo: number;
  hi: number;
  /** True when the explicit range runs high to low, so the high end is at the left or bottom. */
  reversed: boolean;
}

/** One tick: its value in data units, its label and whether it is a major tick. */
interface Tick {
  value: number;
  label: string;
  major: boolean;
}

/** One subplot: its axis ids and its pixel rectangle. */
interface Panel {
  index: number;
  xId: string;
  yId: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One trace bound to its subplot, with its values in data units. */
interface Trace {
  raw: Rec;
  index: number;
  panel: Panel;
  xs: number[];
  ys: number[];
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Style {
  size: number;
  color: string;
}

interface Context {
  scales: Map<string, Scale>;
  ticks: Map<string, Tick[]>;
  plot: Rect;
  style: Style;
  panels: Panel[];
  axisCfg: (id: string) => Rec;
}

const DEFAULT_COLOR = "#1f77b4";
const DEFAULT_AXIS_LINE = "#444444";
const FRAME = { left: 70, right: 20, top: 20, bottom: 60, gap: 60 };
const DASH: Record<string, string> = {
  solid: "",
  dot: "2,3",
  dash: "8,4",
  longdash: "12,4",
  dashdot: "8,4,2,4",
};

function fail(message: string): never {
  throw new RenderError("E_INPUT", message);
}

function rec(value: unknown): Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Rec) : {};
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Formats a number with fixed decimals and drops the sign of a zero. */
function fmt(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text;
}

// A label that needs more decimals than this uses exponent form; a tickformat above it rejects.
const MAX_FIXED_DECIMALS = 20;
// A log axis with too many decades for minor ticks shows about this many major ticks.
const LOG_MAJOR_TARGET = 10;

/** Formats a tick label: fixed decimals, or exponent form when the decimals exceed MAX_FIXED_DECIMALS. */
function tickLabel(value: number, decimals: number): string {
  if (decimals <= MAX_FIXED_DECIMALS) return fmt(value, decimals);
  return value === 0 ? "0" : value.toExponential();
}

/** Returns the decimals that show a step without loss. */
function decimalsFor(step: number): number {
  return step > 0 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
}

function axisKey(id: string): string {
  return id.replace(/^([xy])(\d*)$/, (_all, letter: string, n: string) => `${letter}axis${n}`);
}

function axisId(letter: "x" | "y", n: number): string {
  return n === 1 ? letter : `${letter}${n}`;
}

/** Returns the fraction of a scale that a data value covers, from 0 at lo to 1 at hi. */
function frac(scale: Scale, value: number): number {
  const units = scale.log ? Math.log10(value) : value;
  const t = (units - scale.lo) / (scale.hi - scale.lo);
  return scale.reversed ? 1 - t : t;
}

function text(x: number, y: number, content: string, style: Style, anchor: string, extra = ""): string {
  return `<text x="${fmt(x, 2)}" y="${fmt(y, 2)}" text-anchor="${anchor}" font-family="sans-serif" font-size="${style.size}" fill="${esc(style.color)}"${extra}>${esc(content)}</text>`;
}

function line(x1: number, y1: number, x2: number, y2: number, stroke: string, width: number, extra = ""): string {
  return `<line x1="${fmt(x1, 2)}" y1="${fmt(y1, 2)}" x2="${fmt(x2, 2)}" y2="${fmt(y2, 2)}" stroke="${esc(stroke)}" stroke-width="${width}"${extra}/>`;
}

/** Reads an array of finite numbers, or returns undefined when the key is absent. */
function numbers(value: unknown, path: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(`${path} must be an array of numbers`);
  return (value as unknown[]).map((item, index) => {
    if (typeof item !== "number" || !Number.isFinite(item)) fail(`${path}[${index}] must be a finite number`);
    return item;
  });
}

/** Parses a tickformat. Only ".Nf" is supported; any other value rejects. */
function fixedDecimals(format: unknown, path: string): number | undefined {
  if (format === undefined) return undefined;
  const match = typeof format === "string" ? /^\.(\d+)f$/.exec(format) : null;
  if (match === null) fail(`${path} must be ".Nf" with a whole number N (got ${String(format)})`);
  const decimals = Number(match![1]);
  if (decimals > MAX_FIXED_DECIMALS) fail(`${path} must have at most ${MAX_FIXED_DECIMALS} decimals (got ${decimals})`);
  return decimals;
}

/** Chooses the scale of one axis: an explicit range, else the padded data extent. */
function scaleOf(cfg: Rec, extent: [number, number] | undefined): Scale {
  const log = str(cfg.type, "linear") === "log";
  if (Array.isArray(cfg.range)) {
    const [a, b] = cfg.range as number[];
    if (a === b) fail("an axis range needs two different ends");
    return { log, lo: Math.min(a!, b!), hi: Math.max(a!, b!), reversed: a! > b! };
  }
  if (extent === undefined) return { log, lo: 0, hi: 1, reversed: false };
  if (log) {
    let a = Math.log10(extent[0]);
    let b = Math.log10(extent[1]);
    if (a === b) {
      a -= 0.5;
      b += 0.5;
    }
    const [lo, hi] = paddedRange(a, b);
    return { log, lo, hi, reversed: false };
  }
  let [min, max] = extent;
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const [lo, hi] = paddedRange(min, max);
  return { log, lo, hi, reversed: false };
}

/** Returns the ticks of one axis with their labels. */
function ticksOf(scale: Scale, cfg: Rec, path: string): Tick[] {
  const decimals = fixedDecimals(cfg.tickformat, `${path}.tickformat`);
  if (scale.log) {
    const first = Math.floor(scale.lo);
    const last = Math.ceil(scale.hi);
    if ((last - first + 1) * 9 > MAX_TICKS) {
      // Too many decades for minor ticks: major ticks only, on every stride-th decade.
      const stride = Math.ceil((last - first) / LOG_MAJOR_TARGET);
      const ticks: Tick[] = [];
      for (let n = Math.ceil(first / stride) * stride; n <= last; n += stride) {
        const value = Number(`1e${n}`);
        ticks.push({ value, label: tickLabel(value, decimals ?? decimalsFor(value)), major: true });
      }
      return ticks;
    }
    return logTicks(10 ** scale.lo, 10 ** scale.hi).map((tick) => ({
      value: tick.value,
      label: tickLabel(tick.value, decimals ?? decimalsFor(tick.value)),
      major: tick.major,
    }));
  }
  let values: number[];
  const dtick = typeof cfg.dtick === "number" && cfg.dtick > 0 ? cfg.dtick : undefined;
  if (dtick !== undefined) {
    const count = Math.floor(scale.hi / dtick) - Math.ceil(scale.lo / dtick) + 1;
    if (count > MAX_TICKS) fail(`${path}.dtick gives ${count} ticks over the axis range; the limit is ${MAX_TICKS}`);
    values = [];
    for (let k = Math.ceil(scale.lo / dtick); k * dtick <= scale.hi; k += 1) values.push(k * dtick);
  } else {
    values = linearTicks(scale.lo, scale.hi);
  }
  const step = values.length > 1 ? values[1]! - values[0]! : 1;
  const digits = decimals ?? decimalsFor(dtick ?? step);
  return values.map((value) => ({ value, label: tickLabel(value, digits), major: true }));
}

/** Parses a shape reference: "paper", an axis such as "x2", or an axis domain such as "x2 domain". */
function refOf(ref: string, path: string): { kind: "paper" | "data" | "domain"; axis: string } {
  if (ref === "paper") return { kind: "paper", axis: "" };
  const domain = ref.endsWith(" domain");
  const axis = domain ? ref.slice(0, -" domain".length) : ref;
  if (!/^[xy]\d*$/.test(axis)) fail(`${path} must be paper, an axis such as x2, or an axis domain (got ${ref})`);
  return { kind: domain ? "domain" : "data", axis };
}

/** Returns the SVG for one text label, placed by its Plotly position. */
function labelSvg(x: number, y: number, label: string, position: string, radius: number, style: Style): string {
  const horizontal = position.includes("left") ? "end" : position.includes("right") ? "start" : "middle";
  const dx = horizontal === "end" ? -(radius + 4) : horizontal === "start" ? radius + 4 : 0;
  let dy = style.size * 0.35;
  if (position.includes("top")) dy = -(radius + 4);
  else if (position.includes("bottom")) dy = radius + 4 + style.size * 0.7;
  return text(x + dx, y + dy, label, style, horizontal);
}

/** Returns the SVG of one marker at a point. Unknown symbols draw a circle. */
function markerSvg(symbol: string, x: number, y: number, r: number, color: string): string {
  const fill = esc(color);
  const d = (points: string) => `<path d="${points}" data-marker="${symbol}" fill="${fill}"/>`;
  const stroked = (points: string) =>
    `<path d="${points}" data-marker="${symbol}" fill="none" stroke="${fill}" stroke-width="2"/>`;
  const p = (dx: number, dy: number) => `${fmt(x + dx, 2)} ${fmt(y + dy, 2)}`;
  switch (symbol) {
    case "square":
      return `<rect data-marker="square" x="${fmt(x - r, 2)}" y="${fmt(y - r, 2)}" width="${fmt(2 * r, 2)}" height="${fmt(2 * r, 2)}" fill="${fill}"/>`;
    case "diamond":
      return d(`M${p(0, -r)} L${p(r, 0)} L${p(0, r)} L${p(-r, 0)} Z`);
    case "triangle-up":
      return d(`M${p(0, -r)} L${p(r, r)} L${p(-r, r)} Z`);
    case "cross":
      return stroked(`M${p(-r, 0)} L${p(r, 0)} M${p(0, -r)} L${p(0, r)}`);
    case "x":
      return stroked(`M${p(-r, -r)} L${p(r, r)} M${p(-r, r)} L${p(r, -r)}`);
    default:
      return `<circle cx="${fmt(x, 2)}" cy="${fmt(y, 2)}" r="${Number(r.toFixed(2))}" fill="${fill}"/>`;
  }
}

/** Returns the SVG of one scatter trace inside its subplot. */
function traceSvg(trace: Trace, ctx: Context): string {
  const raw = trace.raw;
  const panel = trace.panel;
  const xScale = ctx.scales.get(panel.xId)!;
  const yScale = ctx.scales.get(panel.yId)!;
  const px = (v: number) => panel.x0 + frac(xScale, v) * (panel.x1 - panel.x0);
  const py = (v: number) => panel.y1 - frac(yScale, v) * (panel.y1 - panel.y0);
  const points = trace.xs.map((v, j) => [px(v), py(trace.ys[j]!)] as const);
  const modes = str(raw.mode, "lines").split("+");
  const lineCfg = rec(raw.line);
  const markerCfg = rec(raw.marker);
  const parts: string[] = [];

  if (modes.includes("lines") && points.length > 0) {
    const d = points.map((p, j) => `${j === 0 ? "M" : "L"}${fmt(p[0], 2)} ${fmt(p[1], 2)}`).join(" ");
    const dash = DASH[str(lineCfg.dash, "solid")] ?? "";
    const dashAttr = dash === "" ? "" : ` stroke-dasharray="${dash}"`;
    parts.push(
      `<path d="${d}" fill="none" stroke="${esc(str(lineCfg.color, DEFAULT_COLOR))}" stroke-width="${num(lineCfg.width, 2)}"${dashAttr}/>`,
    );
  }
  if (modes.includes("markers")) {
    const radius = num(markerCfg.size, 6) / 2;
    const color = str(markerCfg.color, DEFAULT_COLOR);
    const symbol = str(markerCfg.symbol, "circle");
    for (const p of points) parts.push(markerSvg(symbol, p[0], p[1], radius, color));
  }
  if (modes.includes("text")) {
    const labels = typeof raw.text === "string" ? points.map(() => raw.text as string) : Array.isArray(raw.text) ? (raw.text as unknown[]).map(String) : [];
    const position = str(raw.textposition, "middle center");
    const radius = num(markerCfg.size, 6) / 2;
    points.forEach((p, j) => {
      const label = labels[j];
      if (label !== undefined) parts.push(labelSvg(p[0], p[1], label, position, radius, ctx.style));
    });
  }
  return `<g clip-path="url(#clip${panel.index})">${parts.join("")}</g>`;
}

/** Returns the SVG of one shape. A shape reference picks the subplot it sits in. */
function shapeSvg(shape: Rec, index: number, ctx: Context): string {
  const path = `layout.shapes[${index}]`;
  const xr = refOf(str(shape.xref, "paper"), `${path}.xref`);
  const yr = refOf(str(shape.yref, "paper"), `${path}.yref`);
  const dataRef = xr.kind !== "paper" || yr.kind !== "paper";
  const panel = dataRef
    ? ctx.panels.find(
        (p) => (xr.kind === "paper" || p.xId === xr.axis) && (yr.kind === "paper" || p.yId === yr.axis),
      )
    : undefined;
  if (dataRef && panel === undefined) fail(`${path} names no subplot with its axes`);
  const rectX = xr.kind === "paper" ? ctx.plot : panel!;
  const rectY = yr.kind === "paper" ? ctx.plot : panel!;
  const mapX = (v: number) => {
    const f = xr.kind === "data" ? frac(ctx.scales.get(xr.axis)!, v) : v;
    return rectX.x0 + f * (rectX.x1 - rectX.x0);
  };
  const mapY = (v: number) => {
    const f = yr.kind === "data" ? frac(ctx.scales.get(yr.axis)!, v) : v;
    return rectY.y1 - f * (rectY.y1 - rectY.y0);
  };
  const x0 = mapX(num(shape.x0, 0));
  const x1 = mapX(num(shape.x1, 0));
  const y0 = mapY(num(shape.y0, 0));
  const y1 = mapY(num(shape.y1, 0));
  const lineCfg = rec(shape.line);
  const stroke = str(lineCfg.color, DEFAULT_AXIS_LINE);
  const width = num(lineCfg.width, 2);
  if (shape.type === "rect") {
    const fill = str(shape.fillcolor, "none");
    return `<rect x="${fmt(Math.min(x0, x1), 2)}" y="${fmt(Math.min(y0, y1), 2)}" width="${fmt(Math.abs(x1 - x0), 2)}" height="${fmt(Math.abs(y1 - y0), 2)}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${width}"/>`;
  }
  return line(x0, y0, x1, y1, stroke, width);
}

/** Returns the grid, the ticks, the zero line and the titles of one subplot. */
function axesSvg(panel: Panel, ctx: Context): string {
  const out: string[] = [];
  const style = ctx.style;
  const xCfg = ctx.axisCfg(panel.xId);
  const yCfg = ctx.axisCfg(panel.yId);
  const xScale = ctx.scales.get(panel.xId)!;
  const yScale = ctx.scales.get(panel.yId)!;
  const eps = 1e-9;
  for (const tick of ctx.ticks.get(panel.xId)!) {
    const f = frac(xScale, tick.value);
    if (f < -eps || f > 1 + eps) continue;
    const x = panel.x0 + f * (panel.x1 - panel.x0);
    if (tick.major) {
      out.push(line(x, panel.y0, x, panel.y1, str(xCfg.gridcolor, "#e5e5e5"), 1));
      out.push(text(x, panel.y1 + style.size + 6, tick.label, style, "middle"));
    } else {
      out.push(line(x, panel.y1, x, panel.y1 + 4, DEFAULT_AXIS_LINE, 1, ' class="tick-minor"'));
    }
  }
  for (const tick of ctx.ticks.get(panel.yId)!) {
    const f = frac(yScale, tick.value);
    if (f < -eps || f > 1 + eps) continue;
    const y = panel.y1 - f * (panel.y1 - panel.y0);
    if (tick.major) {
      out.push(line(panel.x0, y, panel.x1, y, str(yCfg.gridcolor, "#e5e5e5"), 1));
      out.push(text(panel.x0 - 6, y + style.size * 0.35, tick.label, style, "end"));
    } else {
      out.push(line(panel.x0 - 4, y, panel.x0, y, DEFAULT_AXIS_LINE, 1, ' class="tick-minor"'));
    }
  }
  const zeroOn = (cfg: Rec, scale: Scale) => !scale.log && cfg.zeroline !== false && scale.lo <= 0 && scale.hi >= 0;
  if (zeroOn(xCfg, xScale)) {
    const x = panel.x0 + frac(xScale, 0) * (panel.x1 - panel.x0);
    out.push(line(x, panel.y0, x, panel.y1, str(xCfg.zerolinecolor, DEFAULT_AXIS_LINE), 1));
  }
  if (zeroOn(yCfg, yScale)) {
    const y = panel.y1 - frac(yScale, 0) * (panel.y1 - panel.y0);
    out.push(line(panel.x0, y, panel.x1, y, str(yCfg.zerolinecolor, DEFAULT_AXIS_LINE), 1));
  }
  const xTitle = str(rec(xCfg.title).text, "");
  if (xTitle !== "") out.push(text((panel.x0 + panel.x1) / 2, panel.y1 + style.size * 2 + 26, xTitle, style, "middle"));
  const yTitle = str(rec(yCfg.title).text, "");
  if (yTitle !== "") {
    const x = panel.x0 - 50;
    const y = (panel.y0 + panel.y1) / 2;
    out.push(text(x, y, yTitle, style, "middle", ` transform="rotate(-90 ${fmt(x, 2)} ${fmt(y, 2)})"`));
  }
  return out.join("");
}

/** Builds the subplot rectangles from the grid key (row-major, top-left first). */
function panelsOf(grid: Rec, plot: Rect, gap: number): Panel[] {
  const rows = num(grid.rows, 1);
  const cols = num(grid.columns, 1);
  const coupled = str(grid.pattern, "independent") === "coupled";
  const cellW = (plot.x1 - plot.x0 - gap * (cols - 1)) / cols;
  const cellH = (plot.y1 - plot.y0 - gap * (rows - 1)) / rows;
  if (cellW <= 0 || cellH <= 0) fail("the grid is too dense for the figure size");
  const panels: Panel[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const k = r * cols + c + 1;
      const x0 = plot.x0 + c * (cellW + gap);
      const y0 = plot.y0 + r * (cellH + gap);
      panels.push({
        index: panels.length,
        xId: coupled ? axisId("x", c + 1) : axisId("x", k),
        yId: coupled ? axisId("y", r + 1) : axisId("y", k),
        x0,
        y0,
        x1: x0 + cellW,
        y1: y0 + cellH,
      });
    }
  }
  return panels;
}

/** Follows the matches key of an axis to the axis that it shares its range with. */
function rootOf(id: string, axisCfg: (id: string) => Rec, depth = 0): string {
  const target = str(axisCfg(id).matches, "");
  if (target === "" || depth > 10) return id;
  return rootOf(target, axisCfg, depth + 1);
}

/** Reads a Plotly figure subset and returns standalone SVG text with the warnings of the reader. */
export function plotToSvg(source: string | object, options?: { lenient?: boolean }): { svg: string; warnings: string[] } {
  const { figure, warnings } = readPlotFigure(source, options);
  const layout = figure.layout;
  const data = figure.data;
  const width = num(layout.width, 700);
  const height = num(layout.height, 450);
  const font = rec(layout.font);
  const style: Style = { size: num(font.size, 12), color: str(font.color, "#444444") };
  const paper = str(layout.paper_bgcolor, "#ffffff");
  const plotBg = str(layout.plot_bgcolor, "#ffffff");
  const titleText = str(rec(layout.title).text, "");
  const axisCfg = (id: string): Rec => rec(layout[axisKey(id)]);

  const entries = data
    .map((raw, index) => ({ raw, index, name: str(raw.name, `trace ${index}`), visible: raw.showlegend !== false }))
    .filter((entry) => entry.visible);
  const legendShown = typeof layout.showlegend === "boolean" ? layout.showlegend : data.length > 1;
  const legendWidth = legendShown && entries.length > 0
    ? 40 + Math.max(...entries.map((entry) => entry.name.length)) * style.size * 0.6
    : 0;

  const plot: Rect = {
    x0: FRAME.left,
    y0: FRAME.top + (titleText === "" ? 0 : style.size * 1.2 + 16),
    x1: width - FRAME.right - legendWidth,
    y1: height - FRAME.bottom,
  };
  if (plot.x1 <= plot.x0 || plot.y1 <= plot.y0) fail("the figure is too small for its margins");
  const panels = panelsOf(rec(layout.grid), plot, FRAME.gap);

  const traces: Trace[] = data.map((raw, index) => {
    const xAxis = str(raw.xaxis, "x");
    const yAxis = str(raw.yaxis, "y");
    const panel = panels.find((p) => p.xId === xAxis && p.yId === yAxis);
    if (panel === undefined) fail(`data[${index}] names axes ${xAxis} and ${yAxis} that no subplot holds`);
    const ys = numbers(raw.y, `data[${index}].y`);
    const xs = numbers(raw.x, `data[${index}].x`);
    const n = ys?.length ?? xs?.length ?? 0;
    const xv = xs ?? Array.from({ length: n }, (_unused, j) => j + 1);
    const yv = ys ?? Array.from({ length: n }, (_unused, j) => j + 1);
    if (xv.length !== yv.length) fail(`data[${index}]: x and y must have the same length`);
    return { raw, index, panel: panel!, xs: xv, ys: yv };
  });

  // Data extent per axis id, then merged across each matches group.
  const axisIds = [...new Set(panels.flatMap((p) => [p.xId, p.yId]))];
  const extent = new Map<string, [number, number]>();
  const addValues = (id: string, values: number[], path: string) => {
    const log = str(axisCfg(id).type, "linear") === "log";
    values.forEach((value, j) => {
      if (log && value <= 0) fail(`${path}[${j}] must be above zero on a log axis`);
      const current = extent.get(id);
      extent.set(id, current === undefined ? [value, value] : [Math.min(current[0], value), Math.max(current[1], value)]);
    });
  };
  for (const trace of traces) {
    addValues(trace.panel.xId, trace.xs, `data[${trace.index}].x`);
    addValues(trace.panel.yId, trace.ys, `data[${trace.index}].y`);
  }
  const groupExtent = new Map<string, [number, number]>();
  for (const id of axisIds) {
    const own = extent.get(id);
    if (own === undefined) continue;
    const root = rootOf(id, axisCfg);
    const current = groupExtent.get(root);
    groupExtent.set(
      root,
      current === undefined ? [own[0], own[1]] : [Math.min(current[0], own[0]), Math.max(current[1], own[1])],
    );
  }
  const scales = new Map<string, Scale>();
  const ticks = new Map<string, Tick[]>();
  for (const id of axisIds) {
    const scale = scaleOf(axisCfg(id), groupExtent.get(rootOf(id, axisCfg)));
    scales.set(id, scale);
    ticks.set(id, ticksOf(scale, axisCfg(id), `layout.${axisKey(id)}`));
  }
  const ctx: Context = { scales, ticks, plot, style, panels, axisCfg };

  const defs = panels
    .map((p) => `<clipPath id="clip${p.index}"><rect x="${fmt(p.x0, 2)}" y="${fmt(p.y0, 2)}" width="${fmt(p.x1 - p.x0, 2)}" height="${fmt(p.y1 - p.y0, 2)}"/></clipPath>`)
    .join("");
  // Plotly draws shapes below the traces, so the order is: backgrounds and axes, shapes, traces.
  const frames = panels
    .map((p) => `<rect x="${fmt(p.x0, 2)}" y="${fmt(p.y0, 2)}" width="${fmt(p.x1 - p.x0, 2)}" height="${fmt(p.y1 - p.y0, 2)}" fill="${esc(plotBg)}"/>` + axesSvg(p, ctx))
    .join("");
  const shapes = Array.isArray(layout.shapes)
    ? (layout.shapes as Rec[]).map((shape, index) => shapeSvg(shape, index, ctx)).join("")
    : "";
  const body = frames + shapes + traces.map((t) => traceSvg(t, ctx)).join("");
  const title = titleText === "" ? "" : text(width / 2, FRAME.top + style.size * 1.2, titleText, { ...style, size: style.size * 1.2 }, "middle");
  let legend = "";
  if (legendShown) {
    entries.forEach((entry, k) => {
      const y = plot.y0 + 16 + k * (style.size + 10);
      const x = plot.x1 + 16;
      const swatchY = y - style.size * 0.35;
      const color = str(rec(entry.raw.line).color, DEFAULT_COLOR);
      const modes = str(entry.raw.mode, "lines").split("+");
      if (modes.includes("lines")) legend += line(x, swatchY, x + 20, swatchY, color, 2);
      if (modes.includes("markers")) {
        const symbol = str(rec(entry.raw.marker).symbol, "circle");
        legend += markerSvg(symbol, x + 10, swatchY, num(rec(entry.raw.marker).size, 6) / 2, str(rec(entry.raw.marker).color, DEFAULT_COLOR));
      }
      legend += text(x + 28, y, entry.name, style, "start");
    });
  }
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>${defs}</defs>`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${esc(paper)}"/>`,
    body,
    title,
    legend,
    "</svg>",
  ].join("\n");
  return { svg, warnings };
}
