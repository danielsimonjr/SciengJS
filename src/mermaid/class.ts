import { inputError, outside, type ContentLine, type Source } from "./common.ts";

/** The shape at one end of a class relation: none, an open arrow, a triangle, or a diamond that is filled or open. */
export type Marker = "none" | "arrow" | "triangle" | "diamond" | "filled-diamond";

/** The line style of a class relation and the marker at each end. The tail is the end at the first class. */
export interface ClassArrow {
  dashed: boolean;
  tail: Marker;
  head: Marker;
}

/** One class of the diagram: its name, its generic parameter, its members and the line that declares it. */
export interface ClassDef {
  name: string;
  generic: string | undefined;
  members: string[];
  line: number;
}

/** One relation between two classes. It holds the arrow, the cardinality at each end, the label and the source line. */
export interface ClassRelation {
  from: string;
  to: string;
  token: string;
  arrow: ClassArrow;
  fromCardinality: string | undefined;
  toCardinality: string | undefined;
  label: string | undefined;
  line: number;
}

/** A parsed class diagram: its direction, its classes and its relations. */
export interface ClassModel {
  direction: "TB" | "BT" | "LR" | "RL";
  classes: ClassDef[];
  relations: ClassRelation[];
}

const ARROW_SPECS: readonly (readonly [token: string, arrow: ClassArrow])[] = [
  ["<|--", { dashed: false, tail: "triangle", head: "none" }],
  ["*--", { dashed: false, tail: "filled-diamond", head: "none" }],
  ["o--", { dashed: false, tail: "diamond", head: "none" }],
  ["<--", { dashed: false, tail: "arrow", head: "none" }],
  ["<|..", { dashed: true, tail: "triangle", head: "none" }],
  ["<..", { dashed: true, tail: "arrow", head: "none" }],
  ["--|>", { dashed: false, tail: "none", head: "triangle" }],
  ["--*", { dashed: false, tail: "none", head: "filled-diamond" }],
  ["--o", { dashed: false, tail: "none", head: "diamond" }],
  ["-->", { dashed: false, tail: "none", head: "arrow" }],
  ["..|>", { dashed: true, tail: "none", head: "triangle" }],
  ["..>", { dashed: true, tail: "none", head: "arrow" }],
  ["--", { dashed: false, tail: "none", head: "none" }],
  ["..", { dashed: true, tail: "none", head: "none" }],
];

const ARROW_TABLE = new Map<string, ClassArrow>(ARROW_SPECS);

const ARROW_PATTERN = [...ARROW_SPECS]
  .sort((left, right) => right[0].length - left[0].length)
  .map(([token]) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const IDENT_SOURCE = "[A-Za-z_][A-Za-z0-9_]*";

const RELATION_PATTERN = new RegExp(
  `^(${IDENT_SOURCE}) +(?:"([^"]*)" )?(${ARROW_PATTERN}) +(?:"([^"]*)" )?(${IDENT_SOURCE})(?: : (.+))?$`,
);

const MEMBER_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*) *:(.*)$/;
const CLASS_PATTERN = /^class ([A-Za-z_][A-Za-z0-9_]*)(?:~([A-Za-z0-9_ ,]+)~)?( *\{)?$/;
const DIRECTION_PATTERN = /^direction (TB|BT|LR|RL)$/;

/** Parses the content lines of a class diagram. A line outside the grammar rejects with E_INPUT. In lenient mode the line is skipped and a warning names it. */
export function parseClassDiagram(src: Source): ClassModel {
  let direction: ClassModel["direction"] = "TB";
  let sawDirection = false;
  const classes: ClassDef[] = [];
  const relations: ClassRelation[] = [];
  const byName = new Map<string, ClassDef>();
  let open: { name: string; line: number } | undefined;

  const ensureClass = (name: string, line: number): ClassDef => {
    const existing = byName.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const created: ClassDef = { name, generic: undefined, members: [], line };
    byName.set(name, created);
    classes.push(created);
    return created;
  };

  const lines: readonly ContentLine[] = src.lines;
  for (const line of lines) {
    const text = line.text;

    if (open !== undefined) {
      if (text === "}") {
        open = undefined;
      } else if (text.includes("{") || text.includes("}")) {
        outside(src, line.number, text, "a brace inside a class body is outside the supported grammar");
      } else {
        byName.get(open.name)!.members.push(text.trim());
      }
      continue;
    }

    const relation = RELATION_PATTERN.exec(text);
    if (relation !== null) {
      const from = relation[1]!;
      const to = relation[5]!;
      const token = relation[3]!;
      const arrow = ARROW_TABLE.get(token)!;
      const rawLabel = relation[6];
      relations.push({
        from,
        to,
        token,
        arrow: { dashed: arrow.dashed, tail: arrow.tail, head: arrow.head },
        fromCardinality: relation[2],
        toCardinality: relation[4],
        label: rawLabel === undefined ? undefined : rawLabel.trim(),
        line: line.number,
      });
      ensureClass(from, line.number);
      ensureClass(to, line.number);
      continue;
    }

    const member = MEMBER_PATTERN.exec(text);
    if (member !== null) {
      const memberText = member[2]!.trim();
      if (memberText !== "") {
        ensureClass(member[1]!, line.number).members.push(memberText);
        continue;
      }
    }

    const declaration = CLASS_PATTERN.exec(text);
    if (declaration !== null) {
      const name = declaration[1]!;
      const generic = declaration[2];
      const existing = byName.get(name);
      if (existing === undefined) {
        const created: ClassDef = { name, generic, members: [], line: line.number };
        byName.set(name, created);
        classes.push(created);
      } else if (generic !== undefined) {
        existing.generic = generic;
      }
      if (declaration[3] !== undefined) {
        open = { name, line: line.number };
      }
      continue;
    }

    const directionLine = DIRECTION_PATTERN.exec(text);
    if (directionLine !== null) {
      if (sawDirection) {
        outside(src, line.number, text, "a second direction line is outside the supported grammar");
        continue;
      }
      const value = directionLine[1];
      if (value === "TB" || value === "BT" || value === "LR" || value === "RL") {
        direction = value;
        sawDirection = true;
      }
      continue;
    }

    outside(src, line.number, text, "a construct is outside the supported grammar");
  }

  if (open !== undefined) {
    if (src.lenient) {
      src.warnings.push(
        `line ${open.line}: the body of class ${open.name} is not closed by a line with }; its members run to the end of the source`,
      );
    } else {
      throw inputError(open.line, `the body of class ${open.name} is not closed by a line with }`);
    }
  }

  if (classes.length === 0 && relations.length === 0) {
    throw inputError(src.headerLine, "the diagram holds no class or relation");
  }

  return { direction, classes, relations };
}

const DOT_MARKERS: Record<Marker, string> = {
  none: "none",
  arrow: "normal",
  triangle: "empty",
  diamond: "odiamond",
  "filled-diamond": "diamond",
};

function escapeDot(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function escapeRecord(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/[{}|<>"]/g, "\\$&");
}

function memberDisplay(text: string): string {
  return escapeRecord(text.replace(/~([^~]*)~/g, "<$1>"));
}

/** Builds the DOT source of a parsed class diagram. Each class is a record node. */
export function classToDot(model: ClassModel): string {
  const out: string[] = [];
  out.push("digraph classDiagram {");
  out.push(`  rankdir=${model.direction};`);
  out.push("  node [shape=record];");
  for (const cls of model.classes) {
    const display = cls.generic === undefined ? cls.name : `${cls.name}<${cls.generic}>`;
    const label =
      cls.members.length === 0
        ? escapeRecord(display)
        : `${escapeRecord(display)}|${cls.members.map((member) => `${memberDisplay(member)}\\l`).join("")}`;
    out.push(`  "${escapeDot(cls.name)}" [label="{${label}}"];`);
  }
  for (const rel of model.relations) {
    const attrs: string[] = [];
    if (rel.arrow.dashed) {
      attrs.push("style=dashed");
    }
    if (rel.arrow.tail === "none" && rel.arrow.head === "none") {
      attrs.push("dir=none");
    } else {
      attrs.push(
        "dir=both",
        `arrowtail=${DOT_MARKERS[rel.arrow.tail]}`,
        `arrowhead=${DOT_MARKERS[rel.arrow.head]}`,
      );
    }
    if (rel.fromCardinality !== undefined) {
      attrs.push(`taillabel="${escapeDot(rel.fromCardinality)}"`);
    }
    if (rel.toCardinality !== undefined) {
      attrs.push(`headlabel="${escapeDot(rel.toCardinality)}"`);
    }
    if (rel.label !== undefined) {
      attrs.push(`label="${escapeDot(rel.label)}"`);
    }
    out.push(`  "${escapeDot(rel.from)}" -> "${escapeDot(rel.to)}" [${attrs.join(", ")}];`);
  }
  out.push("}");
  return out.join("\n") + "\n";
}
