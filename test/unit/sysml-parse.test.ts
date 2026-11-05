import { describe, expect, test } from "bun:test";
import { RenderError } from "../../src/errors.ts";
import { tokenize } from "../../src/sysml/tokens.ts";
import { parseSysml, type SysmlModel } from "../../src/sysml/parse.ts";

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

/** Parses a source that must be accepted. A rejection fails the test with its message. */
function accepted(source: string, lenient = false): SysmlModel {
  try {
    return parseSysml(source, lenient);
  } catch (err) {
    throw new Error(`expected the source to parse, got: ${(err as Error).message}`);
  }
}

/** Asserts an E_INPUT rejection on a line, with a part of the message. */
function rejects(source: string, line: number, part: string, lenient = false): void {
  const err = rejection(() => parseSysml(source, lenient));
  expect(err.code).toBe("E_INPUT");
  expect(err.message).toContain(`line ${line}:`);
  expect(err.message).toContain(part);
}

describe("sysml tokens", () => {
  test("the longest symbol wins: :> is one token and .. is one token", () => {
    expect(tokenize("a:>b [1..*]").map((t) => t.value)).toEqual(["a", ":>", "b", "[", "1", "..", "*", "]"]);
    expect(tokenize("a : b").map((t) => t.value)).toEqual(["a", ":", "b"]);
    expect(tokenize("a.b").map((t) => t.value)).toEqual(["a", ".", "b"]);
  });

  test("each token keeps its line and its column", () => {
    const tokens = tokenize("part def A;\n  port def P;");
    expect(tokens[0]).toEqual({ kind: "name", value: "part", line: 1, column: 1 });
    expect(tokens[4]).toEqual({ kind: "name", value: "port", line: 2, column: 3 });
  });

  test("numbers, strings and names have their kinds", () => {
    const tokens = tokenize('x 12 3.5 "a b"');
    expect(tokens.map((t) => t.kind)).toEqual(["name", "number", "number", "string"]);
    expect(tokens[3]!.value).toBe("a b");
  });

  test("a string keeps an escaped quote and an escaped backslash", () => {
    expect(tokenize('"a\\"b\\\\c"')[0]!.value).toBe('a"b\\c');
  });

  test("line comments and block comments are skipped and keep the line count", () => {
    const tokens = tokenize("// one\n/* two\nthree */ x");
    expect(tokens).toEqual([{ kind: "name", value: "x", line: 3, column: 10 }]);
  });

  test("an unclosed comment, an unclosed string and an unknown symbol reject with the line", () => {
    expect(rejection(() => tokenize("x\n/* open")).message).toContain("line 2:");
    expect(rejection(() => tokenize('x\n\n"open')).message).toContain("line 3:");
    const err = rejection(() => tokenize("a\nb # c"));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("line 2:");
    expect(err.message).toContain('"#"');
  });

  test("a string cannot run over a line end", () => {
    expect(rejection(() => tokenize('"a\nb"')).message).toContain("line 1:");
  });
});

describe("sysml grammar: definitions", () => {
  test("package holds definitions and nested packages", () => {
    const m = accepted("package P { package Q { part def A; } port def B; }");
    expect(m.partDefs.map((d) => d.name)).toEqual(["A"]);
    expect(m.portDefs.map((d) => d.name)).toEqual(["B"]);
  });

  test("definitions can sit outside any package", () => {
    const m = accepted("part def A; interface def I; requirement def R;");
    expect(m.partDefs.length).toBe(1);
    expect(m.interfaceDefs.map((d) => d.name)).toEqual(["I"]);
    expect(m.requirementDefs.map((d) => d.name)).toEqual(["R"]);
  });

  test("part def with a body holds attributes, parts, ports, connections and interfaces", () => {
    const m = accepted(`
      port def P;
      interface def I;
      part def E { port p : P; }
      part def V {
        attribute mass : Real = 1200;
        attribute name = "car";
        attribute flag;
        part e : E [2];
        port q : P;
        connect e.p to q;
        interface link : I connect e.p to q;
      }`);
    const v = m.partDefs.find((d) => d.name === "V")!;
    expect(v.attributes).toEqual([
      { name: "mass", type: "Real", value: "1200", line: 6 },
      { name: "name", type: undefined, value: '"car"', line: 7 },
      { name: "flag", type: undefined, value: undefined, line: 8 },
    ]);
    expect(v.parts).toEqual([{ name: "e", type: "E", multiplicity: "2", line: 9 }]);
    expect(v.ports).toEqual([{ name: "q", type: "P", line: 10 }]);
    expect(v.connections).toEqual([
      { name: undefined, def: undefined, from: { part: "e", port: "p" }, to: { part: undefined, port: "q" }, line: 11 },
      { name: "link", def: "I", from: { part: "e", port: "p" }, to: { part: undefined, port: "q" }, line: 12 },
    ]);
  });

  test("multiplicity takes [n], [n..m] and [n..*]", () => {
    const m = accepted("part def W; part def V { part a : W [1]; part b : W [0..4]; part c : W [1..*]; part d : W; }");
    expect(m.partDefs[1]!.parts.map((p) => p.multiplicity)).toEqual(["1", "0..4", "1..*", undefined]);
  });

  test("an attribute value can be a name", () => {
    expect(accepted("part def V { attribute c = red; }").partDefs[0]!.attributes[0]!.value).toBe("red");
  });

  test(":> names the base of a part def and of a requirement def", () => {
    const m = accepted("part def A; part def B :> A; requirement def R; requirement def S :> R;");
    expect(m.partDefs[1]!.base).toBe("A");
    expect(m.requirementDefs[1]!.base).toBe("R");
  });

  test("port def and interface def hold attributes", () => {
    const m = accepted("port def P { attribute v : Real; } interface def I { attribute r; }");
    expect(m.portDefs[0]!.attributes.map((a) => a.name)).toEqual(["v"]);
    expect(m.interfaceDefs[0]!.attributes.map((a) => a.name)).toEqual(["r"]);
  });

  test("a reference can come before its definition", () => {
    const m = accepted("part def V { part e : E; } part def E;");
    expect(m.partDefs[0]!.parts[0]!.type).toBe("E");
  });

  test("a part usage gets the ports of its type and of the bases of its type", () => {
    accepted("port def P; part def A { port a : P; } part def B :> A; part def V { part b : B; port v : P; connect b.a to v; }");
  });
});

describe("sysml grammar: requirements and satisfy", () => {
  test("requirement usages nest and get addresses", () => {
    const m = accepted(`
      requirement def Safety { attribute level = 3; requirement brakes; }
      requirement top : Safety { requirement inner { requirement deep; } }`);
    expect(m.requirementDefs[0]!.children.map((r) => r.address)).toEqual(["Safety.brakes"]);
    expect(m.requirements.map((r) => r.address)).toEqual(["top"]);
    expect(m.requirements[0]!.def).toBe("Safety");
    expect(m.requirements[0]!.children[0]!.address).toBe("top.inner");
    expect(m.requirements[0]!.children[0]!.children[0]!.address).toBe("top.inner.deep");
    expect(m.requirementDefs[0]!.attributes[0]!.value).toBe("3");
  });

  test("satisfy names a requirement and a path, at package level and in a part def", () => {
    const m = accepted(`
      package P {
        requirement def R { requirement sub; }
        requirement top;
        part def E;
        part def V {
          part e : E;
          satisfy R by e;
          satisfy top by V;
        }
        satisfy R.sub by V.e;
        satisfy top by E;
      }`);
    expect(m.satisfies.map((s) => [s.requirement, s.path])).toEqual([
      ["R", "V.e"],
      ["top", "V"],
      ["R.sub", "V.e"],
      ["top", "E"],
    ]);
  });
});

describe("sysml rejections", () => {
  test("an unknown keyword rejects with its line", () => {
    rejects("part def A;\naction def B;", 2, '"action"');
  });

  test("doc, import, alias, state and item are outside the subset", () => {
    for (const word of ["doc", "import", "alias", "state", "item"]) rejects(`${word} x;`, 1, `"${word}"`);
  });

  test("a qualified name is outside the subset", () => {
    rejects("part def A;\npart def V { part a : P::A; }", 2, "::");
  });

  test("a statement in a place that the grammar does not allow rejects", () => {
    rejects("part x : A;", 1, "not allowed");
    rejects("part def A;\nport def P { port p : P; }", 2, "not allowed");
    rejects("requirement def R { part def A; }", 1, "not allowed");
    rejects("part def A { requirement r; }", 1, "not allowed");
    rejects("connect a.b to c.d;", 1, "not allowed");
    rejects("attribute x;", 1, "not allowed");
    rejects("interface i : I connect a.b to c.d;", 1, "not allowed");
    rejects("port p : P;", 1, "not allowed");
  });

  test("an unclosed block rejects with the line of its start", () => {
    rejects("\npackage P {\n part def A;", 2, "not closed");
    rejects("part def A {\n attribute x;", 1, "not closed");
  });

  test("a missing semicolon and a stray symbol reject", () => {
    rejects("part def A\npart def B;", 2, "expected");
    rejects("part def A;\n}", 2, "}");
    rejects("part def A;\n;", 2, ";");
  });

  test("a name defined twice rejects", () => {
    rejects("part def A;\nport def A;", 2, "A is defined twice");
    rejects("requirement r;\nrequirement def r;", 2, "r is defined twice");
    rejects("part def V { attribute a; part a : V; }", 1, "a is defined twice");
  });

  test("a type that names no definition of the correct kind rejects", () => {
    rejects("part def V {\n part e : E; }", 2, "E names no part def");
    rejects("port def P;\npart def V {\n part e : P; }", 3, "P names no part def");
    rejects("part def V {\n port p : V; }", 2, "V names no port def");
    rejects("part def V { port p : P; }\nport def P; part def W {\n interface i : P connect p to p; }", 3, "P names no interface def");
    rejects("requirement r :\n X;", 1, "X names no requirement def");
  });

  test("a base of another kind rejects", () => {
    rejects("port def P;\npart def A :> P;", 2, "P names no part def");
    rejects("part def A;\nrequirement def R :> A;", 2, "A names no requirement def");
  });

  test("a specialization cycle rejects", () => {
    rejects("part def A :> B;\npart def B :> A;", 1, "cycle");
  });

  test("a connect end that names no part or no port rejects", () => {
    const head = "port def P; part def E { port p : P; } part def V { part e : E; port q : P;\n";
    rejects(`${head} connect x.p to q; }`, 2, "x names no part of V");
    rejects(`${head} connect e.z to q; }`, 2, "z names no port of e");
    rejects(`${head} connect e.p to z; }`, 2, "z names no port of V");
  });

  test("a satisfy with an unknown requirement or an unknown path rejects", () => {
    const head = "requirement def R; part def V { part e : V; }\n";
    rejects(`${head}satisfy Q by V;`, 2, "Q names no requirement");
    rejects(`${head}satisfy R by W;`, 2, "W names no part def");
    rejects(`${head}satisfy R by V.z;`, 2, "z names no part of V");
    rejects(`${head}satisfy R.x by V;`, 2, "R.x names no requirement");
    rejects(`${head}satisfy R by a.b.c;`, 2, "a.b.c");
  });

  test("a source with no definition and no requirement rejects", () => {
    rejects("// nothing\npackage P { }", 1, "no definition");
    rejects("", 1, "no definition");
  });
});

describe("sysml lenient mode", () => {
  test("a statement with an unknown keyword is skipped to its semicolon, with a warning", () => {
    const m = accepted("part def A;\naction run;\npart def B;", true);
    expect(m.partDefs.map((d) => d.name)).toEqual(["A", "B"]);
    expect(m.warnings).toEqual(['line 2: skipped the unsupported statement "action"']);
  });

  test("a statement with an unknown keyword is skipped to its closed block", () => {
    const m = accepted("action def X { a { b; } c; }\npart def A { doc; attribute x; }", true);
    expect(m.partDefs[0]!.attributes.map((a) => a.name)).toEqual(["x"]);
    expect(m.warnings.length).toBe(2);
  });

  test("an unknown statement that is not closed still rejects", () => {
    rejects("part def A;\naction x {", 2, "not closed", true);
    rejects("part def A;\naction x", 2, "not closed", true);
  });

  test("the other rejections stay errors in lenient mode", () => {
    rejects("part def A;\nport def A;", 2, "defined twice", true);
    rejects("part x : A;", 1, "not allowed", true);
  });
});
