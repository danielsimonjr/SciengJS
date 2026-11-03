import { describe, expect, test } from "bun:test";
import { rejection } from "../support/rejections.ts";
import { prepare } from "../../src/mermaid/common.ts";
import { parseStateDiagram, stateToDot, type StateModel } from "../../src/mermaid/state.ts";
import { dotToSvg } from "../../src/graph/dot.ts";

function parse(source: string, options: Record<string, unknown> = {}): StateModel {
  return parseStateDiagram(prepare(source, options));
}

function parseWithWarnings(source: string, options: Record<string, unknown>): { model: StateModel; warnings: string[] } {
  const src = prepare(source, options);
  const model = parseStateDiagram(src);
  return { model, warnings: src.warnings };
}

describe("stateDiagram-v2: states and transitions", () => {
  test("a start transition names the start marker as its source and declares its target state", () => {
    const m = parse("stateDiagram-v2\n[*] --> Still");
    expect(m.transitions).toEqual([{ from: "[*]", to: "Still", label: undefined, line: 2 }]);
    expect(m.states).toEqual([{ id: "Still", label: "Still", line: 2 }]);
  });

  test("an end transition names the end marker as its target", () => {
    const m = parse("stateDiagram-v2\nStill --> [*]");
    expect(m.transitions).toEqual([{ from: "Still", to: "[*]", label: undefined, line: 2 }]);
  });

  test("a transition between two states takes its label after the colon", () => {
    const m = parse("stateDiagram-v2\nA --> B : go");
    expect(m.transitions).toEqual([{ from: "A", to: "B", label: "go", line: 2 }]);
  });

  test("a bare identifier declares a state", () => {
    const m = parse("stateDiagram-v2\nIdle");
    expect(m.states).toEqual([{ id: "Idle", label: "Idle", line: 2 }]);
    expect(m.transitions).toEqual([]);
  });

  test("a state with a quoted label and an alias takes the label as its text and the alias as its id", () => {
    const m = parse('stateDiagram-v2\nstate "Waiting for input" as Wait');
    expect(m.states).toEqual([{ id: "Wait", label: "Waiting for input", line: 2 }]);
  });

  test("a state declared with a name only uses the name as its label", () => {
    const m = parse("stateDiagram-v2\nstate Busy");
    expect(m.states).toEqual([{ id: "Busy", label: "Busy", line: 2 }]);
  });

  test("a label declaration after a transition gives that implicit state its label", () => {
    const m = parse('stateDiagram-v2\nA --> B\nstate "Bee" as B');
    expect(m.states).toEqual([
      { id: "A", label: "A", line: 2 },
      { id: "B", label: "Bee", line: 2 },
    ]);
  });

  test("states that transitions name are created in first-seen order", () => {
    const m = parse("stateDiagram-v2\nZ --> Y\nY --> X");
    expect(m.states.map((s) => s.id)).toEqual(["Z", "Y", "X"]);
  });

  test("the direction defaults to TB, and a direction line sets LR or RL", () => {
    expect(parse("stateDiagram-v2\nA").direction).toBe("TB");
    expect(parse("stateDiagram-v2\ndirection LR\nA").direction).toBe("LR");
    expect(parse("stateDiagram-v2\ndirection RL\nA").direction).toBe("RL");
  });
});

describe("stateDiagram-v2: rejections name the source line", () => {
  test("an unknown construct rejects with E_INPUT on its line", () => {
    const err = rejection(() => parse("stateDiagram-v2\nA --> B\nnote right of A"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(3);
    expect(err.message).toContain("outside the supported grammar");
  });

  test("a composite state rejects with E_INPUT on the line that opens it", () => {
    const err = rejection(() => parse("stateDiagram-v2\nstate Outer {\nInner\n}"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a fork stereotype rejects with E_INPUT", () => {
    const err = rejection(() => parse("stateDiagram-v2\nstate Split <<fork>>"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a transition with no target rejects with E_INPUT", () => {
    const err = rejection(() => parse("stateDiagram-v2\nA -->"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a colon with no label text rejects with E_INPUT", () => {
    const err = rejection(() => parse("stateDiagram-v2\nA --> B :"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a start marker on the target side of a start transition rejects with E_INPUT", () => {
    const err = rejection(() => parse("stateDiagram-v2\n[*] --> [*]"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a bare start marker rejects with E_INPUT, because it declares no state", () => {
    const err = rejection(() => parse("stateDiagram-v2\n[*]"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("an arrow other than the transition arrow rejects with E_INPUT", () => {
    const err = rejection(() => parse("stateDiagram-v2\nA --- B"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a classDef line rejects with E_INPUT, because styles are outside the grammar", () => {
    const err = rejection(() => parse("stateDiagram-v2\nclassDef hot fill:#f00"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a state line with no name rejects with E_INPUT", () => {
    const err = rejection(() => parse("stateDiagram-v2\nstate"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a stray closing brace rejects with E_INPUT", () => {
    const err = rejection(() => parse("stateDiagram-v2\nA\n}"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(3);
  });

  test("a diagram with no state and no transition rejects with E_INPUT on the header line", () => {
    const err = rejection(() => parse("stateDiagram-v2\n%% nothing"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(1);
    expect(err.message).toContain("holds no state");
  });
});

describe("stateDiagram-v2: lenient skips a construct with a warning", () => {
  test("lenient skips a note, keeps the transitions around it and warns on its line", () => {
    const { model, warnings } = parseWithWarnings("stateDiagram-v2\nA --> B\nnote right of A\nB --> C", { lenient: true });
    expect(model.transitions.map((t) => [t.from, t.to])).toEqual([
      ["A", "B"],
      ["B", "C"],
    ]);
    expect(warnings).toEqual(['line 3: skipped the unsupported construct "note right of A"']);
  });

  test("lenient ignores a second direction line, keeps the first direction and warns on the line", () => {
    const { model, warnings } = parseWithWarnings("stateDiagram-v2\ndirection LR\ndirection RL\nA", { lenient: true });
    expect(model.direction).toBe("LR");
    expect(warnings).toEqual(['line 3: skipped the unsupported construct "direction RL"']);
  });

  test("lenient skips a transition from the start marker to the end marker and keeps the others", () => {
    const { model, warnings } = parseWithWarnings("stateDiagram-v2\n[*] --> [*]\nA --> B", { lenient: true });
    expect(model.transitions.map((t) => [t.from, t.to])).toEqual([["A", "B"]]);
    expect(warnings).toEqual(['line 2: skipped the unsupported construct "[*] --> [*]"']);
  });

  test("a second header line rejects with E_INPUT on its line", () => {
    const err = rejection(() => parse("stateDiagram-v2\nstateDiagram-v2\nA"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("lenient skips a composite state with its whole body, and warns once on the opening line", () => {
    const { model, warnings } = parseWithWarnings(
      "stateDiagram-v2\nstate Outer {\nInner --> Deep\nstate Inner2 {\nX --> Y\n}\n}\nA --> B",
      { lenient: true },
    );
    expect(model.states.map((s) => s.id)).toEqual(["A", "B"]);
    expect(warnings).toEqual(['line 2: skipped the unsupported construct "state Outer {"']);
  });
});

describe("stateDiagram-v2: DOT output", () => {
  test("a state is a box node with its label", () => {
    const dot = stateToDot(parse('stateDiagram-v2\nstate "Waiting" as Wait'));
    expect(dot).toContain('"Wait" [label="Waiting"];');
  });

  test("the start and end markers are one circle node each, however many transitions name them", () => {
    const dot = stateToDot(parse("stateDiagram-v2\n[*] --> A\n[*] --> B\nA --> [*]"));
    expect(dot.split('"start*" [shape=circle, style=filled, fillcolor=black, width=0.25, label=""];').length - 1).toBe(1);
    expect(dot).toContain('"end*" [shape=doublecircle, style=filled, fillcolor=black, width=0.2, label=""];');
    expect(dot).toContain('"start*" -> "A";');
    expect(dot).toContain('"A" -> "end*";');
  });

  test("a transition with a label gives an edge with the label", () => {
    const dot = stateToDot(parse("stateDiagram-v2\nA --> B : go"));
    expect(dot).toContain('"A" -> "B" [label="go"];');
  });

  test("a transition without a label gives a bare edge", () => {
    const dot = stateToDot(parse("stateDiagram-v2\nA --> B"));
    expect(dot).toContain('"A" -> "B";');
  });

  test("the direction becomes rankdir", () => {
    expect(stateToDot(parse("stateDiagram-v2\ndirection LR\nA"))).toContain("rankdir=LR;");
  });

  test("a quote in a label cannot inject an attribute of the graph", async () => {
    const dot = stateToDot(parse('stateDiagram-v2\nA --> B : hi" image="evil.png'));
    const result = await dotToSvg(dot);
    expect(result.svg).not.toContain("<image");
    expect(result.svg).not.toContain('href="evil.png"');
    expect(result.svg).toContain("evil.png");
    expect(result.warnings).toEqual([]);
  });
});
