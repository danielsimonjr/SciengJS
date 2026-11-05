import { inputError } from "../errors.ts";
import { xmlSafe } from "../graph/text.ts";
import { outside, type ContentLine, type Source } from "./common.ts";

/** One declared state of a stateDiagram-v2. */
export interface StateDef {
  id: string;
  label: string;
  line: number;
}

/** One directed edge between states. The start and end markers are the text [*]. */
export interface StateTransition {
  from: string;
  to: string;
  label: string | undefined;
  line: number;
}

/** The parsed content of a stateDiagram-v2. */
export interface StateModel {
  direction: "TB" | "BT" | "LR" | "RL";
  states: StateDef[];
  transitions: StateTransition[];
}

const IDENT = "[A-Za-z_][A-Za-z0-9_]*";
const MARKER = `(\\[\\*\\]|${IDENT})`;
const RESERVED_WORDS = new Set<string>(["state", "note", "direction", "classDef", "class", "style"]);

const DIRECTION_LINE = /^direction[ \t]+(TB|BT|LR|RL)$/;
const COMPOSITE_OPENER = new RegExp(`^state[ \\t]+(?:${IDENT})[ \\t]?\\{$`);
const TRANSITION_LINE = new RegExp(`^${MARKER}[ \\t]+-->[ \\t]+${MARKER}(?:[ \\t]+:[ \\t]+(.+))?$`);
const QUOTED_STATE_LINE = new RegExp(`^state[ \\t]+"([^"]+)"[ \\t]+as[ \\t]+(${IDENT})$`);
const NAMED_STATE_LINE = new RegExp(`^state[ \\t]+(${IDENT})$`);
const BARE_STATE_LINE = new RegExp(`^${IDENT}$`);

interface ParsedTransition {
  from: string;
  to: string;
  label: string | undefined;
}

function readTransition(text: string): ParsedTransition | null {
  const match = TRANSITION_LINE.exec(text);
  if (match === null) {
    return null;
  }
  const raw = match[3];
  if (raw !== undefined && raw.trim().length === 0) {
    return null;
  }
  return { from: match[1], to: match[2], label: raw === undefined ? undefined : raw.trim() };
}

function declareState(states: Map<string, StateDef>, id: string, line: ContentLine, label?: string): void {
  const existing = states.get(id);
  if (existing === undefined) {
    states.set(id, { id, label: label ?? id, line: line.number });
    return;
  }
  if (label !== undefined) {
    existing.label = label;
  }
}

/** Parses the content lines of a state diagram. A line outside the grammar rejects with E_INPUT. In lenient mode the line is skipped and a warning names it. */
export function parseStateDiagram(src: Source): StateModel {
  const states = new Map<string, StateDef>();
  const transitions: StateTransition[] = [];
  let direction: StateModel["direction"] = "TB";
  let sawDirection = false;

  for (let index = 0; index < src.lines.length; index += 1) {
    const line = src.lines[index];
    const text = line.text;

    const directionMatch = DIRECTION_LINE.exec(text);
    if (directionMatch !== null) {
      if (sawDirection) {
        outside(src, line.number, text, "a second direction line is outside the supported grammar");
        continue;
      }
      direction = directionMatch[1] as StateModel["direction"];
      sawDirection = true;
      continue;
    }

    if (COMPOSITE_OPENER.test(text)) {
      outside(src, line.number, text, "a composite state is outside the supported grammar");
      let depth = 1;
      let cursor = index + 1;
      while (cursor < src.lines.length && depth > 0) {
        const skipped = src.lines[cursor].text;
        if (skipped.includes("{")) {
          depth += 1;
        }
        if (skipped === "}") {
          depth -= 1;
        }
        cursor += 1;
      }
      index = cursor - 1;
      continue;
    }

    const transition = readTransition(text);
    if (transition !== null) {
      if (transition.from === "[*]" && transition.to === "[*]") {
        outside(src, line.number, text, "a start marker cannot also be an end marker");
        continue;
      }
      transitions.push({ from: transition.from, to: transition.to, label: transition.label, line: line.number });
      if (transition.from !== "[*]") {
        declareState(states, transition.from, line);
      }
      if (transition.to !== "[*]") {
        declareState(states, transition.to, line);
      }
      continue;
    }

    const quoted = QUOTED_STATE_LINE.exec(text);
    if (quoted !== null) {
      declareState(states, quoted[2], line, quoted[1]);
      continue;
    }

    const named = NAMED_STATE_LINE.exec(text);
    if (named !== null) {
      declareState(states, named[1], line);
      continue;
    }

    if (BARE_STATE_LINE.test(text) && !RESERVED_WORDS.has(text)) {
      declareState(states, text, line);
      continue;
    }

    outside(src, line.number, text, "a construct is outside the supported grammar");
  }

  if (states.size === 0 && transitions.length === 0) {
    throw inputError(src.headerLine, "the diagram holds no state or transition");
  }

  return { direction, states: [...states.values()], transitions };
}

function escapeDotText(text: string): string {
  return xmlSafe(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Builds the DOT source of a parsed state diagram. Each state is a rounded box. */
export function stateToDot(model: StateModel): string {
  const lines: string[] = [
    "digraph stateDiagram {",
    `  rankdir=${model.direction};`,
    "  node [shape=box, style=rounded];",
  ];
  if (model.transitions.some((transition) => transition.from === "[*]")) {
    lines.push('  "start*" [shape=circle, style=filled, fillcolor=black, width=0.25, label=""];');
  }
  if (model.transitions.some((transition) => transition.to === "[*]")) {
    lines.push('  "end*" [shape=doublecircle, style=filled, fillcolor=black, width=0.2, label=""];');
  }
  for (const state of model.states) {
    lines.push(`  "${escapeDotText(state.id)}" [label="${escapeDotText(state.label)}"];`);
  }
  for (const transition of model.transitions) {
    const from = transition.from === "[*]" ? "start*" : transition.from;
    const to = transition.to === "[*]" ? "end*" : transition.to;
    const label = transition.label === undefined ? "" : ` [label="${escapeDotText(transition.label)}"]`;
    lines.push(`  "${escapeDotText(from)}" -> "${escapeDotText(to)}"${label};`);
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}
