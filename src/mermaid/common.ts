import { RenderError } from "../errors.ts";

/** The three Mermaid diagram kinds that the native layouts draw. */
export type DiagramKind = "class" | "state" | "sequence";

/** One content line of a source: its one-based number and its trimmed text. */
export interface ContentLine {
  readonly number: number;
  readonly text: string;
}

/** The lenient flag and the warnings that a parse shares. A skipped construct adds a warning. */
export interface Context {
  readonly lenient: boolean;
  readonly warnings: string[];
}

/** A source after the header. Comments, blank lines and skipped constructs are absent from `lines`. */
export interface Source extends Context {
  readonly kind: DiagramKind;
  readonly headerLine: number;
  readonly lines: ContentLine[];
}

const HEADERS: ReadonlyMap<string, DiagramKind> = new Map([
  ["classDiagram", "class"],
  ["classDiagram-v2", "class"],
  ["stateDiagram-v2", "state"],
  ["sequenceDiagram", "sequence"],
]);

/** Mermaid types that the native layouts do not draw. They need the browser stage, which this release does not build. */
const OTHER_TYPES: ReadonlySet<string> = new Set([
  "flowchart", "graph", "stateDiagram", "erDiagram", "gantt", "pie", "journey", "gitGraph", "mindmap",
  "timeline", "quadrantChart", "requirementDiagram", "C4Context", "C4Container", "C4Component",
  "C4Dynamic", "C4Deployment", "sankey-beta", "xychart-beta", "block-beta", "packet-beta", "kanban",
  "architecture-beta", "zenuml",
]);

/**
 * Reads the option `lenient` and checks the other keys. A key outside `lenient` and `extra` rejects with E_INPUT.
 * An undefined value counts as an absent key.
 */
export function readLenient(options: Record<string, unknown>, extra: readonly string[]): boolean {
  let lenient = false;
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    if (key === "lenient") {
      if (typeof value !== "boolean") {
        throw new RenderError("E_INPUT", "option lenient must be true or false");
      }
      lenient = value;
    } else if (!extra.includes(key)) {
      throw new RenderError("E_INPUT", `mermaid takes no option ${key}`);
    }
  }
  return lenient;
}

/** The text of a request. The source is text for every Mermaid request, and a byte source is read as UTF-8. */
export function sourceText(source: string | Uint8Array): string {
  return typeof source === "string" ? source : new TextDecoder().decode(source);
}

/** An input error that names its source line. */
export function inputError(line: number, message: string): RenderError {
  return new RenderError("E_INPUT", `line ${line}: ${message}`, { line });
}

/**
 * Handles a construct that the grammar does not accept. Without lenient it rejects with E_INPUT on its line.
 * With lenient it records a warning on its line and returns, so that the caller can skip the construct.
 */
export function outside(ctx: Context, line: number, text: string, why: string): void {
  if (!ctx.lenient) {
    throw inputError(line, `${why}: "${text}"`);
  }
  ctx.warnings.push(`line ${line}: skipped the unsupported construct "${text}"`);
}

/**
 * Prepares a source. It reads the options, removes blank lines, comment lines, directives and front matter,
 * and reads the header. A whole Mermaid type that the native layouts do not draw rejects with E_UNSUPPORTED.
 */
export function prepare(source: string, options: Record<string, unknown>, extra: readonly string[] = []): Source {
  const ctx: Context = { lenient: readLenient(options, extra), warnings: [] };
  const raw = source.split(/\r?\n/);
  const content: ContentLine[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const number = index + 1;
    const text = (raw[index] ?? "").trim();
    if (text === "") continue;
    if (content.length === 0 && text === "---") {
      const close = raw.findIndex((line, at) => at > index && line.trim() === "---");
      if (close < 0) {
        throw inputError(number, "the front matter is not closed by a line of three dashes");
      }
      outside(ctx, number, text, "the front matter is outside the supported grammar");
      index = close;
      continue;
    }
    if (text.startsWith("%%{")) {
      outside(ctx, number, text, "a directive is outside the supported grammar");
      continue;
    }
    if (text.startsWith("%%")) continue;
    content.push({ number, text });
  }

  const head = content[0];
  if (head === undefined) {
    throw new RenderError("E_INPUT", "the source names no Mermaid diagram type");
  }
  const word = head.text.split(/\s+/)[0] ?? "";
  const kind = HEADERS.get(head.text);
  if (kind !== undefined) {
    return { kind, headerLine: head.number, lines: content.slice(1), lenient: ctx.lenient, warnings: ctx.warnings };
  }
  if (OTHER_TYPES.has(word)) {
    throw new RenderError(
      "E_UNSUPPORTED",
      `line ${head.number}: ${word} diagrams need the browser stage, which this release does not build; ` +
        "the native layouts draw classDiagram, stateDiagram-v2 and sequenceDiagram",
      { line: head.number },
    );
  }
  if (HEADERS.has(word)) {
    throw inputError(head.number, `the header ${word} takes no other text on its line`);
  }
  throw inputError(head.number, `"${head.text}" does not name a Mermaid diagram type that this release draws`);
}
