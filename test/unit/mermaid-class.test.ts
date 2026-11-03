import { describe, expect, test } from "bun:test";
import { RenderError } from "../../src/errors.ts";
import { prepare } from "../../src/mermaid/common.ts";
import { classToDot, parseClassDiagram, type ClassModel, type Marker } from "../../src/mermaid/class.ts";
import { dotToSvg } from "../../src/graph/dot.ts";

function parse(source: string, options: Record<string, unknown> = {}): ClassModel {
  return parseClassDiagram(prepare(source, options));
}

/** Runs a function that must throw a RenderError, and returns that error. */
function rejection(fn: () => unknown): RenderError {
  try {
    fn();
  } catch (err) {
    if (err instanceof RenderError) return err;
    throw err;
  }
  throw new Error("expected a RenderError, but the call returned");
}

/** Each arrow token of the grammar, with the dash style and the marker at each end. */
const ARROWS: [token: string, dashed: boolean, tail: Marker, head: Marker][] = [
  ["<|--", false, "triangle", "none"],
  ["*--", false, "filled-diamond", "none"],
  ["o--", false, "diamond", "none"],
  ["<--", false, "arrow", "none"],
  ["<|..", true, "triangle", "none"],
  ["<..", true, "arrow", "none"],
  ["--|>", false, "none", "triangle"],
  ["--*", false, "none", "filled-diamond"],
  ["--o", false, "none", "diamond"],
  ["-->", false, "none", "arrow"],
  ["..|>", true, "none", "triangle"],
  ["..>", true, "none", "arrow"],
  ["--", false, "none", "none"],
  ["..", true, "none", "none"],
];

describe("classDiagram: class declarations and members", () => {
  test("class Animal declares one class whose label is its name and has no members", () => {
    const m = parse("classDiagram\nclass Animal");
    expect(m.classes).toEqual([{ name: "Animal", generic: undefined, members: [], line: 2 }]);
    expect(m.relations).toEqual([]);
  });

  test("a class body holds the members in order, and the closing brace ends the body", () => {
    const m = parse("classDiagram\nclass Animal {\n  +int age\n  +isMammal() void\n}\nclass Dog");
    expect(m.classes[0]).toEqual({ name: "Animal", generic: undefined, members: ["+int age", "+isMammal() void"], line: 2 });
    expect(m.classes[1]).toEqual({ name: "Dog", generic: undefined, members: [], line: 6 });
  });

  test("a member line adds a member to a class, and members keep their declaration order", () => {
    const m = parse("classDiagram\nclass Animal {\n+int age\n}\nAnimal : +eat() void\nAnimal : +name string");
    expect(m.classes[0]?.members).toEqual(["+int age", "+eat() void", "+name string"]);
  });

  test("a member line names a class that is not declared yet, and the class takes that line", () => {
    const m = parse("classDiagram\nDog : +bark() void");
    expect(m.classes).toEqual([{ name: "Dog", generic: undefined, members: ["+bark() void"], line: 2 }]);
  });

  test("a generic class name keeps its name and its generic argument", () => {
    const m = parse("classDiagram\nclass Shape~T~");
    expect(m.classes[0]).toEqual({ name: "Shape", generic: "T", members: [], line: 2 });
  });

  test("a class body may open on the declaration line", () => {
    const m = parse("classDiagram\nclass Animal{\n+int age\n}");
    expect(m.classes[0]?.members).toEqual(["+int age"]);
  });
});

describe("classDiagram: relations", () => {
  for (const [token, dashed, tail, head] of ARROWS) {
    test(`the arrow ${token} gives dashed=${dashed}, tail ${tail}, head ${head}`, () => {
      const m = parse(`classDiagram\nA ${token} B`);
      expect(m.relations).toHaveLength(1);
      const rel = m.relations[0]!;
      expect(rel.token).toBe(token);
      expect(rel.arrow).toEqual({ dashed, tail, head });
      expect(rel.from).toBe("A");
      expect(rel.to).toBe("B");
    });
  }

  test("a relation declares the classes that it names, in the order they first appear", () => {
    const m = parse("classDiagram\nZebra <|-- Horse\nHorse --> Zebra");
    expect(m.classes.map((c) => c.name)).toEqual(["Zebra", "Horse"]);
    expect(m.classes[0]?.line).toBe(2);
  });

  test("a quoted cardinality at each end becomes fromCardinality and toCardinality", () => {
    const rel = parse('classDiagram\nCustomer "1" --> "many" Ticket').relations[0]!;
    expect(rel.fromCardinality).toBe("1");
    expect(rel.toCardinality).toBe("many");
  });

  test("a label after the colon names the relation", () => {
    const rel = parse("classDiagram\nDriver --> Car : drives").relations[0]!;
    expect(rel.label).toBe("drives");
    expect(rel.fromCardinality).toBeUndefined();
  });

  test("the label colon may stand next to the class name with no space, as well as with one", () => {
    expect(() => parse("classDiagram\nDriver --> Car: drives")).not.toThrow();
    expect(() => parse("classDiagram\nDriver --> Car:drives")).not.toThrow();
    expect(parse("classDiagram\nDriver --> Car: drives").relations[0]!.label).toBe("drives");
    expect(parse("classDiagram\nDriver --> Car:drives").relations[0]!.label).toBe("drives");
  });

  test("a cardinality and a label may both be given", () => {
    const rel = parse('classDiagram\nPerson "1" o-- "*" Pet : owns').relations[0]!;
    expect(rel.arrow.tail).toBe("diamond");
    expect(rel.fromCardinality).toBe("1");
    expect(rel.toCardinality).toBe("*");
    expect(rel.label).toBe("owns");
  });

  test("the default direction is TB, and a direction line sets LR, RL, BT or TB", () => {
    expect(parse("classDiagram\nclass A").direction).toBe("TB");
    expect(parse("classDiagram\ndirection LR\nclass A").direction).toBe("LR");
    expect(parse("classDiagram\ndirection RL\nclass A").direction).toBe("RL");
    expect(parse("classDiagram\ndirection BT\nclass A").direction).toBe("BT");
  });
});

describe("classDiagram: rejections name the source line", () => {
  test("an unknown construct rejects with E_INPUT on its line", () => {
    const err = rejection(() => parse("classDiagram\nclass A\nnamespace Demo {"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(3);
    expect(err.message).toContain("outside the supported grammar");
  });

  test("an unknown arrow token rejects with E_INPUT on its line", () => {
    const err = rejection(() => parse("classDiagram\nA ==> B"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a relation with no target rejects with E_INPUT", () => {
    const err = rejection(() => parse("classDiagram\nA -->"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a member line with no member text rejects with E_INPUT", () => {
    const err = rejection(() => parse("classDiagram\nclass A\nA :"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(3);
  });

  test("a body that no closing brace ends rejects with E_INPUT on the line that opens it", () => {
    const err = rejection(() => parse("classDiagram\nclass A {\n+int age"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
    expect(err.message).toContain("not closed");
  });

  test("a closing brace with no open body rejects with E_INPUT", () => {
    const err = rejection(() => parse("classDiagram\nclass A\n}"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(3);
  });

  test("a brace inside a body rejects with E_INPUT on the member line, so bodies never nest", () => {
    const err = rejection(() => parse("classDiagram\nclass A {\n+int age\nclass B {\n}"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(4);
  });

  test("a class name that starts with a digit rejects with E_INPUT", () => {
    const err = rejection(() => parse("classDiagram\nclass 1Bad"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a direction with an unknown value rejects with E_INPUT", () => {
    const err = rejection(() => parse("classDiagram\ndirection DIAG"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("a second direction line rejects with E_INPUT", () => {
    const err = rejection(() => parse("classDiagram\ndirection LR\ndirection TB\nclass A"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(3);
  });

  test("a style line rejects with E_INPUT, because styles are outside the grammar", () => {
    const err = rejection(() => parse("classDiagram\nclass A\nstyle A fill:#f9f"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(3);
  });

  test("a diagram with no class and no relation rejects with E_INPUT on the header line", () => {
    const err = rejection(() => parse("classDiagram\n%% nothing here"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(1);
    expect(err.message).toContain("holds no class");
  });
});

describe("classDiagram: lenient skips a construct with a warning", () => {
  test("lenient skips an unknown construct, keeps the other lines and names the line in a warning", () => {
    const m = parse("classDiagram\nclass A\nnamespace Demo {\nclass B", { lenient: true });
    expect(m.classes.map((c) => c.name)).toEqual(["A", "B"]);
  });

  test("lenient records a warning on the skipped line", () => {
    const { warnings } = parseWithWarnings("classDiagram\nclass A\nnamespace Demo {", { lenient: true });
    expect(warnings).toEqual(['line 3: skipped the unsupported construct "namespace Demo {"']);
  });

  test("lenient skips a relation with an unknown arrow", () => {
    const { model, warnings } = parseWithWarnings("classDiagram\nA ==> B\nA --> C", { lenient: true });
    expect(model.relations.map((r) => r.to)).toEqual(["C"]);
    expect(warnings).toEqual(['line 2: skipped the unsupported construct "A ==> B"']);
  });

  test("lenient keeps the members of a body that no brace closes, and warns on the opening line", () => {
    const { model, warnings } = parseWithWarnings("classDiagram\nclass A {\n+int age", { lenient: true });
    expect(model.classes[0]?.members).toEqual(["+int age"]);
    expect(warnings).toEqual(["line 2: the body of class A is not closed by a line with }; its members run to the end of the source"]);
  });
});

describe("classDiagram: DOT output", () => {
  test("each class is a record node: the name in the first field, one member per left-aligned line", () => {
    const dot = classToDot(parse("classDiagram\nclass Animal {\n+int age\n}\nclass Dog"));
    expect(dot).toContain('"Animal" [label="{Animal|+int age\\l}"];');
    expect(dot).toContain('"Dog" [label="{Dog}"];');
  });

  test("an inheritance relation puts the empty triangle at the parent and no arrow at the child", () => {
    const dot = classToDot(parse("classDiagram\nAnimal <|-- Dog"));
    expect(dot).toContain('"Animal" -> "Dog" [dir=both, arrowtail=empty, arrowhead=none];');
  });

  test("a dashed relation gets style dashed, and a plain link gets dir none", () => {
    const dot = classToDot(parse("classDiagram\nA ..> B\nA -- C"));
    expect(dot).toContain('"A" -> "B" [style=dashed, dir=both, arrowtail=none, arrowhead=normal];');
    expect(dot).toContain('"A" -> "C" [dir=none];');
  });

  test("the direction becomes rankdir", () => {
    expect(classToDot(parse("classDiagram\ndirection LR\nclass A"))).toContain("rankdir=LR;");
  });

  test("a cardinality and a label become edge attributes", () => {
    const dot = classToDot(parse('classDiagram\nCustomer "1" --> "*" Ticket : buys'));
    expect(dot).toContain('taillabel="1"');
    expect(dot).toContain('headlabel="*"');
    expect(dot).toContain('label="buys"');
  });

  test("a generic class shows its argument in angle brackets, with the brackets escaped in the record", () => {
    const dot = classToDot(parse("classDiagram\nclass Shape~T~"));
    expect(dot).toContain('"Shape" [label="{Shape\\<T\\>}"];');
  });

  test("a quote in a member cannot close the label, so no attribute of the graph is injected", async () => {
    const source = 'classDiagram\nclass A {\n+a" image="evil.png\n}';
    const dot = classToDot(parse(source));
    const result = await dotToSvg(dot);
    expect(result.svg).not.toContain("<image");
    expect(result.svg).not.toContain('href="evil.png"');
    expect(result.svg).toContain("evil.png");
    expect(result.warnings).toEqual([]);
  });
});

/** Parses a source, and returns the model with the warnings that the shared pre-pass and the parser recorded. */
function parseWithWarnings(source: string, options: Record<string, unknown>): { model: ClassModel; warnings: string[] } {
  const src = prepare(source, options);
  const model = parseClassDiagram(src);
  return { model, warnings: src.warnings };
}
