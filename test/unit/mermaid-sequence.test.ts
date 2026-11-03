import { describe, expect, test } from "bun:test";
import { rejection } from "../support/rejections.ts";
import { prepare } from "../../src/mermaid/common.ts";
import { parseSequenceDiagram, type SeqEvent, type SequenceModel } from "../../src/mermaid/sequence.ts";
import { layoutSequence } from "../../src/mermaid/sequence-layout.ts";

function parse(source: string, options: Record<string, unknown> = {}): SequenceModel {
  return parseSequenceDiagram(prepare(source, options));
}

function parseWithWarnings(source: string, options: Record<string, unknown>): { model: SequenceModel; warnings: string[] } {
  const src = prepare(source, options);
  const model = parseSequenceDiagram(src);
  return { model, warnings: src.warnings };
}

type Block = Extract<SeqEvent, { kind: "block" }>;

/** The elements of a drawing that carry data-scieng-kind=kind, with their tag name and attributes. */
function elementsOf(svg: string, kind: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const tag of svg.matchAll(/<([A-Za-z]+)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)) {
    const attrs: Record<string, string> = { tag: tag[1]! };
    for (const pair of tag[2]!.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[pair[1]!] = pair[2]!;
    if (attrs["data-scieng-kind"] === kind) out.push(attrs);
  }
  return out;
}

const ARROW_TOKENS: [token: string, dashed: boolean, arrowhead: boolean][] = [
  ["->", false, false],
  ["-->", true, false],
  ["->>", false, true],
  ["-->>", true, true],
];

describe("sequenceDiagram: participants", () => {
  test("participant A declares a participant whose label is its id", () => {
    const m = parse("sequenceDiagram\nparticipant A");
    expect(m.participants).toEqual([{ id: "A", label: "A", line: 2 }]);
  });

  test("participant A as Alice takes the alias as the label", () => {
    const m = parse("sequenceDiagram\nparticipant A as Alice");
    expect(m.participants).toEqual([{ id: "A", label: "Alice", line: 2 }]);
  });

  test("actor B is a participant with its id as the label", () => {
    const m = parse("sequenceDiagram\nactor B");
    expect(m.participants).toEqual([{ id: "B", label: "B", line: 2 }]);
  });

  test("a message names an undeclared participant, which takes the column of its first appearance", () => {
    const m = parse("sequenceDiagram\nBob->>Alice: hi");
    expect(m.participants.map((p) => p.id)).toEqual(["Bob", "Alice"]);
  });

  test("a declaration after an implicit creation sets the label and keeps the column", () => {
    const m = parse("sequenceDiagram\nA->>B: x\nparticipant B as Bob");
    expect(m.participants).toEqual([
      { id: "A", label: "A", line: 2 },
      { id: "B", label: "Bob", line: 2 },
    ]);
  });
});

describe("sequenceDiagram: messages", () => {
  for (const [token, dashed, arrowhead] of ARROW_TOKENS) {
    test(`the arrow ${token} gives dashed=${dashed} and arrowhead=${arrowhead}`, () => {
      const m = parse(`sequenceDiagram\nA ${token} B: hello`);
      expect(m.events).toEqual([
        expect.objectContaining({ kind: "message", from: "A", to: "B", token, dashed, arrowhead, text: "hello", line: 2 }),
      ]);
    });
  }

  test("spaces around the arrow are optional", () => {
    const m = parse("sequenceDiagram\nA ->> B : hi");
    expect(m.events[0]).toMatchObject({ kind: "message", from: "A", to: "B", text: "hi" });
  });

  test("the text after the colon is trimmed", () => {
    const m = parse("sequenceDiagram\nA->>B:  hello  ");
    expect(m.events[0]).toMatchObject({ text: "hello" });
  });

  test("a + marker after the arrow sets activateTarget, and a - marker sets deactivateSource", () => {
    const m = parse("sequenceDiagram\nA->>+B: hi\nB-->>-A: bye");
    expect(m.events[0]).toMatchObject({ activateTarget: true, deactivateSource: false });
    expect(m.events[1]).toMatchObject({ activateTarget: false, deactivateSource: true });
  });

  test("a self message has the same participant as source and target", () => {
    const m = parse("sequenceDiagram\nA->>A: think");
    expect(m.events[0]).toMatchObject({ from: "A", to: "A" });
  });

  test("a - marker whose sender is not active rejects with E_INPUT on its line", () => {
    const err = rejection(() => parse("sequenceDiagram\nA->>B: hi\nB-->>-A: bye"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(3);
  });
});

describe("sequenceDiagram: notes", () => {
  test("Note left of A gives a left note on A", () => {
    const m = parse("sequenceDiagram\nNote left of A: think");
    expect(m.events[0]).toMatchObject({ kind: "note", position: "left", ids: ["A"], text: "think", line: 2 });
  });

  test("Note right of A gives a right note on A", () => {
    const m = parse("sequenceDiagram\nNote right of A: think");
    expect(m.events[0]).toMatchObject({ kind: "note", position: "right", ids: ["A"] });
  });

  test("Note over A gives a note over one participant", () => {
    const m = parse("sequenceDiagram\nNote over A: spans");
    expect(m.events[0]).toMatchObject({ kind: "note", position: "over", ids: ["A"] });
  });

  test("Note over A,B gives a note over two participants, in the order written", () => {
    const m = parse("sequenceDiagram\nNote over A,B: spans both");
    expect(m.events[0]).toMatchObject({ kind: "note", position: "over", ids: ["A", "B"] });
  });
});

describe("sequenceDiagram: activations", () => {
  test("activate A and deactivate A give an activate event and a deactivate event", () => {
    const source = "sequenceDiagram\nactivate A\ndeactivate A";
    expect(() => parse(source)).not.toThrow();
    const m = parse(source);
    expect(m.events).toEqual([
      { kind: "activate", id: "A", line: 2 },
      { kind: "deactivate", id: "A", line: 3 },
    ]);
  });

  test("deactivate of a participant that is not active rejects with E_INPUT on its line", () => {
    const err = rejection(() => parse("sequenceDiagram\nA->>B: x\ndeactivate B"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(3);
  });

  test("an activation left open at the end of the diagram closes on its own, with no error", () => {
    const m = parse("sequenceDiagram\nA->>+B: hi");
    expect(m.events).toHaveLength(1);
  });
});

describe("sequenceDiagram: blocks", () => {
  test("loop ... end holds its events in one branch, labelled by the loop text", () => {
    const m = parse("sequenceDiagram\nloop Every minute\nA->>B: ping\nend");
    const block = m.events[0] as Block;
    expect(block).toMatchObject({ kind: "block", type: "loop", line: 2 });
    expect(block.branches).toHaveLength(1);
    expect(block.branches[0]).toMatchObject({ label: "Every minute", line: 2 });
    expect(block.branches[0]!.events).toHaveLength(1);
  });

  test("alt, else and end give two branches, each with its label", () => {
    const source = "sequenceDiagram\nalt ok\nA->>B: yes\nelse fail\nA->>B: no\nend";
    expect(() => parse(source)).not.toThrow();
    const m = parse(source);
    const block = m.events[0] as Block;
    expect(block.type).toBe("alt");
    expect(block.branches.map((b) => b.label)).toEqual(["ok", "fail"]);
    expect(block.branches[1]!.line).toBe(4);
  });

  test("else with no text is a branch with an empty label", () => {
    const m = parse("sequenceDiagram\nalt ok\nA->>B: yes\nelse\nA->>B: no\nend");
    const block = m.events[0] as Block;
    expect(block.branches[1]!.label).toBe("");
  });

  test("par, and and end give parallel branches", () => {
    const m = parse("sequenceDiagram\npar first\nA->>B: one\nand second\nA->>C: two\nend");
    const block = m.events[0] as Block;
    expect(block.type).toBe("par");
    expect(block.branches.map((b) => b.label)).toEqual(["first", "second"]);
  });

  test("a loop with no text has an empty label", () => {
    const m = parse("sequenceDiagram\nloop\nA->>B: x\nend");
    expect((m.events[0] as Block).branches[0]!.label).toBe("");
  });

  test("a loop inside an alt keeps its own events and nests in the branch", () => {
    const m = parse("sequenceDiagram\nalt ok\nloop again\nA->>B: x\nend\nelse no\nA->>B: y\nend");
    const outer = m.events[0] as Block;
    const inner = outer.branches[0]!.events[0] as Block;
    expect(inner).toMatchObject({ kind: "block", type: "loop" });
    expect(inner.branches[0]!.events).toHaveLength(1);
    expect(outer.branches).toHaveLength(2);
  });
});

describe("sequenceDiagram: hyphenated ids", () => {
  test("a participant id may hold hyphens between its letters and digits", () => {
    expect(() => parse("sequenceDiagram\nUser-1->>Web-2: hi")).not.toThrow();
    const m = parse("sequenceDiagram\nUser-1->>Web-2: hi");
    expect(m.participants.map((p) => p.id)).toEqual(["User-1", "Web-2"]);
    expect(m.events[0]).toMatchObject({ kind: "message", from: "User-1", to: "Web-2", text: "hi" });
  });

  test("an arrow next to a hyphenated id still reads as the arrow", () => {
    expect(() => parse("sequenceDiagram\nA-->B: x\nA-1->>B-2: x\nA->>+B: hi\nB-->>-A-1: bye")).not.toThrow();
    expect(parse("sequenceDiagram\nA-->B: x").events[0]).toMatchObject({ from: "A", to: "B", token: "-->", dashed: true, arrowhead: false });
    expect(parse("sequenceDiagram\nA-1->>B-2: x").events[0]).toMatchObject({ from: "A-1", to: "B-2", token: "->>", arrowhead: true });
    expect(rejection(() => parse("sequenceDiagram\nA->>-B: x")).line).toBe(2);
    const m = parse("sequenceDiagram\nA->>+B: hi\nB-->>-A-1: bye");
    expect(m.events[1]).toMatchObject({ kind: "message", from: "B", to: "A-1", deactivateSource: true });
  });

  test("a hyphenated id works in a note, an activation and a deactivation", () => {
    expect(() => parse("sequenceDiagram\nactivate User-1\nNote over User-1: hi\ndeactivate User-1")).not.toThrow();
    const m = parse("sequenceDiagram\nactivate User-1\nNote over User-1: hi\ndeactivate User-1");
    expect(m.participants.map((p) => p.id)).toEqual(["User-1"]);
    expect(m.events.map((e) => e.kind)).toEqual(["activate", "note", "deactivate"]);
  });
});

describe("sequenceDiagram: rejections name the source line", () => {
  test("an unknown construct rejects with E_INPUT on its line", () => {
    const err = rejection(() => parse("sequenceDiagram\nA->>B: x\ntitle Demo"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(3);
    expect(err.message).toContain("outside the supported grammar");
  });

  test("an unknown arrow token rejects with E_INPUT", () => {
    const err = rejection(() => parse("sequenceDiagram\nA-xB: x"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a message with no colon rejects with E_INPUT", () => {
    const err = rejection(() => parse("sequenceDiagram\nA->>B"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a message with blank text rejects with E_INPUT", () => {
    const err = rejection(() => parse("sequenceDiagram\nA->>B:   "));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("else outside an alt block rejects with E_INPUT", () => {
    const err = rejection(() => parse("sequenceDiagram\nloop x\nA->>B: y\nelse\nend"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(4);
  });

  test("and outside a par block rejects with E_INPUT", () => {
    const err = rejection(() => parse("sequenceDiagram\nalt x\nA->>B: y\nand\nend"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(4);
  });

  test("end with no open block rejects with E_INPUT", () => {
    const err = rejection(() => parse("sequenceDiagram\nA->>B: y\nend"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(3);
  });

  test("a block that no end closes rejects on the line that opens it", () => {
    const err = rejection(() => parse("sequenceDiagram\nloop x\nA->>B: y"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
    expect(err.message).toContain("not closed");
  });

  test("autonumber rejects with E_INPUT, because numbering is outside the grammar", () => {
    const err = rejection(() => parse("sequenceDiagram\nautonumber\nA->>B: x"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a note with an unknown position rejects with E_INPUT", () => {
    const err = rejection(() => parse("sequenceDiagram\nNote under A: x"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a note with no text rejects with E_INPUT", () => {
    const err = rejection(() => parse("sequenceDiagram\nNote over A:"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a participant id that starts with a digit rejects with E_INPUT", () => {
    const err = rejection(() => parse("sequenceDiagram\nparticipant 1A"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("participant A as with no alias text rejects with E_INPUT", () => {
    const err = rejection(() => parse("sequenceDiagram\nparticipant A as"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("an opt block rejects with E_INPUT on its line, because opt is outside the grammar", () => {
    const err = rejection(() => parse("sequenceDiagram\nA->>B: x\nopt maybe\nA->>B: y\nend"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(3);
    expect(err.message).toContain("a block is outside the supported grammar");
  });
  test("a diagram with no participant and no message rejects with E_INPUT on the header line", () => {
    const err = rejection(() => parse("sequenceDiagram\n%% nothing"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(1);
    expect(err.message).toContain("holds no participant or message");
  });
});

describe("sequenceDiagram: lenient skips a construct with a warning", () => {
  test("lenient skips an autonumber line and warns on its line", () => {
    const { model, warnings } = parseWithWarnings("sequenceDiagram\nautonumber\nA->>B: x", { lenient: true });
    expect(model.events).toHaveLength(1);
    expect(warnings).toEqual(['line 2: skipped the unsupported construct "autonumber"']);
  });

  test("lenient skips an opt block with its body and its end, and warns once on the opening line", () => {
    const { model, warnings } = parseWithWarnings("sequenceDiagram\nA->>B: x\nopt maybe\nB->>A: y\nend\nA->>B: z", { lenient: true });
    expect(model.events.map((e) => (e.kind === "message" ? e.text : e.kind))).toEqual(["x", "z"]);
    expect(warnings).toEqual(['line 3: skipped the unsupported construct "opt maybe"']);
  });

  test("lenient keeps a block that no end closes, runs it to the end and warns on its opening line", () => {
    const { model, warnings } = parseWithWarnings("sequenceDiagram\nloop x\nA->>B: y", { lenient: true });
    expect((model.events[0] as Block).branches[0]!.events).toHaveLength(1);
    expect(warnings).toEqual(["line 2: the loop block is not closed by an end line; it runs to the end of the source"]);
  });
  test("lenient skips a block nested in a skipped block, and only the outer end closes the skip", () => {
    const { model, warnings } = parseWithWarnings(
      "sequenceDiagram\nopt maybe\nloop x\nA->>B: y\nend\nend\nA->>B: z",
      { lenient: true },
    );
    expect(model.events.map((e) => (e.kind === "message" ? e.text : e.kind))).toEqual(["z"]);
    expect(warnings).toEqual(['line 2: skipped the unsupported construct "opt maybe"']);
  });
});

describe("sequenceDiagram: layout of the drawing", () => {
  test("the drawing is an SVG document with a width, a height and a viewBox", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nA->>B: hi"));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="');
  });

  test("one column per participant: the lifelines keep the declaration order and the x order", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nparticipant A\nparticipant B\nparticipant C\nA->>B: x"));
    const lifelines = elementsOf(svg, "lifeline");
    expect(lifelines.map((l) => l["data-scieng-id"])).toEqual(["A", "B", "C"]);
    const xs = lifelines.map((l) => Number(l["x1"]));
    expect(xs[0]! < xs[1]! && xs[1]! < xs[2]!).toBe(true);
    expect(elementsOf(svg, "participant")).toHaveLength(3);
  });

  test("one row per message: the rows increase in source order and no two share a row", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nA->>B: one\nB-->>A: two\nA->>B: three"));
    const rows = elementsOf(svg, "message").map((e) => Number(e["data-scieng-row"]));
    expect(rows).toHaveLength(3);
    expect(rows[0]! < rows[1]! && rows[1]! < rows[2]!).toBe(true);
    expect(elementsOf(svg, "message").map((e) => e["data-scieng-line"])).toEqual(["2", "3", "4"]);
  });

  test("a self message is drawn as a path, so the loop of the arrow is visible", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nA->>A: think"));
    const [message] = elementsOf(svg, "message");
    expect(message?.tag).toBe("path");
  });

  test("an activation is a narrow box of width 10 on its lifeline, with a height", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nA->>+B: hi\nB-->>-A: bye"));
    const [activation] = elementsOf(svg, "activation");
    expect(activation?.tag).toBe("rect");
    expect(activation?.["width"]).toBe("10");
    expect(Number(activation?.["height"])).toBeGreaterThan(0);
  });

  test("a note is a box with its text inside it", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nA->>B: x\nNote over A,B: Watch out"));
    expect(elementsOf(svg, "note")).toHaveLength(1);
    expect(svg).toContain(">Watch out</text>");
  });

  test("a loop frame encloses its rows, and an alt with two branches draws one divider", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nloop again\nA->>B: x\nend"));
    const [frame] = elementsOf(svg, "block");
    const [message] = elementsOf(svg, "message");
    const y = Number(message?.["y1"]);
    expect(frame?.["data-scieng-type"]).toBe("loop");
    expect(Number(frame?.["y"])).toBeLessThan(y);
    expect(Number(frame?.["y"]) + Number(frame?.["height"])).toBeGreaterThan(y);
    const alt = layoutSequence(parse("sequenceDiagram\nalt ok\nA->>B: x\nelse fail\nA->>B: y\nend"));
    expect(elementsOf(alt, "divider")).toHaveLength(1);
  });

  test("a block header and the first message label of that block keep a text line apart", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nloop again\nA->>B: x\nend"));
    const headerY = Number(/<text x="\d+" y="(\d+)"[^>]*>loop again<\/text>/.exec(svg)?.[1]);
    const labelY = Number(/<text x="\d+" y="(\d+)"[^>]*>x<\/text>/.exec(svg)?.[1]);
    expect(labelY - headerY).toBeGreaterThanOrEqual(14);
  });
  test("message text is escaped, so markup in a message cannot become an element", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nA->>B: <b>bold</b> & more"));
    expect(svg).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; more");
    expect(svg).not.toContain("<b>");
  });

  test("every message keeps its source line in data-scieng-line", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nparticipant A\nA->>B: first\nNote over A: between\nB-->>A: back"));
    expect(elementsOf(svg, "message").map((e) => e["data-scieng-line"])).toEqual(["3", "5"]);
  });
  test("adjacent columns are exactly 180 px apart when the labels are short", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nparticipant A\nparticipant B\nparticipant C\nA->>B: x"));
    const xs = elementsOf(svg, "lifeline").map((l) => Number(l["x1"]));
    expect(xs[1]! - xs[0]!).toBe(180);
    expect(xs[2]! - xs[1]!).toBe(180);
  });
  test("the lifelines start under the participant boxes, and the boxes start at the top margin", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nA->>B: x"));
    const [lifeline] = elementsOf(svg, "lifeline");
    expect(Number(lifeline?.["y1"])).toBe(56);
    const [box] = elementsOf(svg, "participant");
    expect(Number(box?.["y"])).toBe(20);
    expect(box?.["height"]).toBe("36");
  });
  test("the first message row is 86 and consecutive rows are 30 px apart", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nA->>B: one\nB-->>A: two"));
    const [first, second] = elementsOf(svg, "message").map((e) => Number(e["y1"]));
    expect(first).toBe(86);
    expect(second! - first!).toBe(30);
  });
  test("an activation is as tall as the rows between its activating and its deactivating message", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nA->>+B: hi\nB-->>-A: bye"));
    const [activation] = elementsOf(svg, "activation");
    expect(activation?.["y"]).toBe("86");
    expect(activation?.["height"]).toBe("30");
  });
  test("a note over two participants spans both columns with a 30 px margin on each side", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nA->>B: x\nNote over A,B: Watch out"));
    const [note] = elementsOf(svg, "note");
    expect(note?.["x"]).toBe("40");
    expect(note?.["width"]).toBe("240");
  });
  test("a loop frame spans every participant with a block side margin of 30 px", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nloop again\nA->>B: x\nend"));
    const [frame] = elementsOf(svg, "block");
    expect(frame?.["x"]).toBe("40");
    expect(frame?.["width"]).toBe("240");
  });
  test("a participant box is as wide as its label at 8 px a character, plus 20 px of padding", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nparticipant A as Long Name 12\nA->>A: x"));
    const [box] = elementsOf(svg, "participant");
    expect(box?.["width"]).toBe("116");
  });
  test("the root element keeps a margin of 20 px around the drawing", () => {
    const svg = layoutSequence(parse("sequenceDiagram\nA->>B: hi"));
    expect(svg).toContain('width="320" height="136"');
    expect(svg).toContain('viewBox="0 0 320 136"');
  });
});
