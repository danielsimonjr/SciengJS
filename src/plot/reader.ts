import { RenderError } from "../errors.ts";

// Table-driven reader for the Plotly JSON subset. Each allowed key is a dotted
// path relative to its object and maps to a type spec. A key outside the
// tables rejects with its full path, or is dropped with a warning in lenient mode.
type SpecTable = Map<string, string>;

const SHAPES_SPEC = "shapes";
const ENUM_PREFIX = "enum:";
const AXIS_KEY_PATTERN = /^(x|y)axis\d*$/;

const TRACE_SPECS: SpecTable = new Map<string, string>([
  ["type", "enum:scatter"],
  ["mode", "enum:lines|markers|lines+markers|markers+text|text"],
  ["x", "numberArray"],
  ["y", "numberArray"],
  ["name", "string"],
  ["text", "stringOrStringArray"],
  [
    "textposition",
    "enum:top left|top center|top right|middle left|middle center|middle right|bottom left|bottom center|bottom right",
  ],
  ["line.color", "string"],
  ["line.width", "number"],
  ["line.dash", "enum:solid|dot|dash|longdash|dashdot"],
  ["marker.size", "number"],
  ["marker.color", "string"],
  ["marker.symbol", "enum:circle|square|diamond|cross|x|triangle-up"],
  ["xaxis", "string"],
  ["yaxis", "string"],
  ["showlegend", "boolean"],
]);

const LAYOUT_SPECS: SpecTable = new Map<string, string>([
  ["title.text", "string"],
  ["width", "number"],
  ["height", "number"],
  ["paper_bgcolor", "string"],
  ["plot_bgcolor", "string"],
  ["font.color", "string"],
  ["font.size", "number"],
  ["showlegend", "boolean"],
  ["grid.rows", "int"],
  ["grid.columns", "int"],
  ["grid.pattern", "enum:independent|coupled"],
  ["shapes", SHAPES_SPEC],
]);

const AXIS_SPECS: SpecTable = new Map<string, string>([
  ["type", "enum:linear|log"],
  ["title.text", "string"],
  ["range", "pair"],
  ["dtick", "number"],
  ["tickformat", "string"],
  ["gridcolor", "string"],
  ["zeroline", "boolean"],
  ["zerolinecolor", "string"],
  ["matches", "string"],
]);

const SHAPE_SPECS: SpecTable = new Map<string, string>([
  ["type", "enum:line|rect"],
  ["xref", "string"],
  ["yref", "string"],
  ["x0", "number"],
  ["x1", "number"],
  ["y0", "number"],
  ["y1", "number"],
  ["line.color", "string"],
  ["line.width", "number"],
  ["fillcolor", "string"],
]);

function inputError(message: string): RenderError {
  return new RenderError("E_INPUT", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateValue(value: unknown, spec: string, path: string): void {
  switch (spec) {
    case "string":
      if (typeof value !== "string") throw inputError(`${path} must be a string`);
      return;
    case "number":
      if (!isNumber(value)) throw inputError(`${path} must be a number`);
      return;
    case "boolean":
      if (typeof value !== "boolean") throw inputError(`${path} must be a boolean`);
      return;
    case "int":
      if (!isNumber(value) || !Number.isInteger(value) || value <= 0) {
        throw inputError(`${path} must be a positive integer`);
      }
      return;
    case "numberArray":
      if (!Array.isArray(value)) throw inputError(`${path} must be an array of numbers`);
      for (let index = 0; index < value.length; index += 1) {
        if (!isNumber(value[index])) throw inputError(`${path}[${index}] must be a finite number`);
      }
      return;
    case "stringOrStringArray":
      if (typeof value === "string") return;
      if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
        throw inputError(`${path} must be a string or an array of strings`);
      }
      return;
    case "pair":
      if (!Array.isArray(value) || value.length !== 2 || !value.every(isNumber)) {
        throw inputError(`${path} must be an array of exactly two numbers`);
      }
      return;
    default:
      if (spec.startsWith(ENUM_PREFIX)) {
        const allowed = spec.slice(ENUM_PREFIX.length).split("|");
        if (typeof value !== "string" || !allowed.includes(value)) {
          throw inputError(`${path} must be one of ${allowed.join(", ")}`);
        }
        return;
      }
      throw inputError(`${path} has unsupported validation spec`);
  }
}

/** Validates and copies one object level. Dotted spec keys group into child levels. */
function readLevel(
  source: Record<string, unknown>,
  path: string,
  specs: SpecTable,
  lenient: boolean,
  warnings: string[],
): Record<string, unknown> {
  const leafSpecs = new Map<string, string>();
  const childSpecs = new Map<string, SpecTable>();
  for (const [dottedKey, spec] of specs) {
    const separator = dottedKey.indexOf(".");
    if (separator >= 0) {
      const head = dottedKey.slice(0, separator);
      let child = childSpecs.get(head);
      if (child === undefined) {
        child = new Map<string, string>();
        childSpecs.set(head, child);
      }
      child.set(dottedKey.slice(separator + 1), spec);
    } else {
      leafSpecs.set(dottedKey, spec);
    }
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    const value: unknown = source[key];
    const keyPath = `${path}.${key}`;
    const leafSpec = leafSpecs.get(key);
    if (leafSpec !== undefined) {
      if (leafSpec === SHAPES_SPEC) {
        result[key] = readShapes(value, keyPath, lenient, warnings);
      } else {
        validateValue(value, leafSpec, keyPath);
        result[key] = value;
      }
      continue;
    }
    const childSpec = childSpecs.get(key);
    if (childSpec !== undefined) {
      if (!isRecord(value)) throw inputError(`${keyPath} must be an object`);
      result[key] = readLevel(value, keyPath, childSpec, lenient, warnings);
      continue;
    }
    const message = `unknown plot figure key ${keyPath}`;
    if (lenient) {
      warnings.push(message);
    } else {
      throw inputError(message);
    }
  }
  return result;
}

function readShapes(
  value: unknown,
  path: string,
  lenient: boolean,
  warnings: string[],
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw inputError(`${path} must be an array of shape objects`);
  const shapes: Array<Record<string, unknown>> = [];
  for (let index = 0; index < value.length; index += 1) {
    const element: unknown = value[index];
    const elementPath = `${path}[${index}]`;
    if (!isRecord(element)) throw inputError(`${elementPath} must be an object`);
    shapes.push(readLevel(element, elementPath, SHAPE_SPECS, lenient, warnings));
  }
  return shapes;
}

/** Adds the axis key set for each layout key named like an axis (xaxis, yaxis2, ...). */
function buildLayoutSpecs(layout: Record<string, unknown>): SpecTable {
  const specs: SpecTable = new Map<string, string>(LAYOUT_SPECS);
  for (const key of Object.keys(layout)) {
    if (!AXIS_KEY_PATTERN.test(key)) continue;
    for (const [subKey, subSpec] of AXIS_SPECS) specs.set(`${key}.${subKey}`, subSpec);
  }
  return specs;
}

/** Reads a Plotly figure subset from JSON text or a parsed object. Rejects with E_INPUT and the key path. */
export function readPlotFigure(
  input: unknown,
  options?: { lenient?: boolean },
): {
  figure: { data: Array<Record<string, unknown>>; layout: Record<string, unknown> };
  warnings: string[];
} {
  const lenient = options?.lenient === true;
  const warnings: string[] = [];

  let parsed: unknown = input;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw inputError(`plot figure is not valid JSON text: ${detail}`);
    }
  }
  if (!isRecord(parsed)) throw inputError('plot figure must be an object with "data" and "layout" keys');
  if (!Array.isArray(parsed.data)) throw inputError('plot figure "data" must be an array of traces');
  const layoutSource: unknown = parsed.layout;
  if (layoutSource !== undefined && layoutSource !== null && !isRecord(layoutSource)) {
    throw inputError('plot figure "layout" must be an object');
  }

  const rawTraces = parsed.data as unknown[];
  const data: Array<Record<string, unknown>> = [];
  for (let index = 0; index < rawTraces.length; index += 1) {
    const trace: unknown = rawTraces[index];
    if (!isRecord(trace)) throw inputError(`data[${index}] must be an object`);
    data.push(readLevel(trace, `data[${index}]`, TRACE_SPECS, lenient, warnings));
  }

  const layoutRoot: Record<string, unknown> = isRecord(layoutSource) ? layoutSource : {};
  const layout = readLevel(layoutRoot, "layout", buildLayoutSpecs(layoutRoot), lenient, warnings);
  return { figure: { data, layout }, warnings };
}
