import { describe, expect, test } from "bun:test";
import { dropImageElements, stripImageAttributes } from "../../src/graph/image.ts";

describe("stripImageAttributes", () => {
  test("removes an image attribute of a node and reports its line and file", () => {
    const r = stripImageAttributes('digraph G { a [image="x.png"] }');
    expect(r.source).not.toContain("image");
    expect(r.source).toContain("a [");
    expect(r.removed).toEqual([{ line: 1, file: "x.png" }]);
  });

  test("keeps the other attributes of the list", () => {
    const r = stripImageAttributes('digraph G { a [label="A", image="x.png", shape=box] }');
    expect(r.source).toContain('label="A"');
    expect(r.source).toContain("shape=box");
    expect(r.source).not.toContain("image");
    expect(r.removed).toEqual([{ line: 1, file: "x.png" }]);
  });

  test("removes the last attribute of a list and keeps the rest", () => {
    const r = stripImageAttributes('digraph G { a [shape=box, image="x.png"] }');
    expect(r.source).toContain("shape=box");
    expect(r.source).not.toContain("image");
    expect(r.removed).toEqual([{ line: 1, file: "x.png" }]);
  });

  test("removes a graph-level image statement with its semicolon", () => {
    const r = stripImageAttributes('digraph G { image="g.png"; a -> b }');
    expect(r.source).not.toContain("image");
    expect(r.source).toContain("a -> b");
    expect(r.source.replace(/\s+/g, " ")).toBe("digraph G { a -> b }");
    expect(r.removed).toEqual([{ line: 1, file: "g.png" }]);
  });

  test("removes an image default of a node statement", () => {
    const r = stripImageAttributes('digraph G { node [image="n.png", shape=box]; a -> b }');
    expect(r.source).not.toContain("image");
    expect(r.source).toContain("shape=box");
    expect(r.removed).toEqual([{ line: 1, file: "n.png" }]);
  });

  test("removes a quoted image key", () => {
    const r = stripImageAttributes('digraph G { a ["image"="q.png"] }');
    expect(r.source).not.toContain("image");
    expect(r.removed).toEqual([{ line: 1, file: "q.png" }]);
  });

  test("removes an image value given as an HTML string", () => {
    const r = stripImageAttributes("digraph G { a [image=<pic.png>] }");
    expect(r.source).not.toContain("image");
    expect(r.removed).toEqual([{ line: 1, file: "pic.png" }]);
  });

  test("keeps keys that only contain the word image", () => {
    const src = 'digraph G { a [Image="A", images="B", image_file="C", imagepos="D"] }';
    const r = stripImageAttributes(src);
    expect(r.source).toBe(src);
    expect(r.removed).toEqual([]);
  });

  test("does not touch the word image inside a quoted string, a comment or a preprocessor line", () => {
    const src = 'digraph G {\n  a [label="image=\\"x.png\\""];\n  // image="c.png"\n  /* image="b.png" */\n# image="p.png"\n}\n';
    const r = stripImageAttributes(src);
    expect(r.source).toBe(src);
    expect(r.removed).toEqual([]);
  });

  test("does not touch the word image inside an HTML label", () => {
    const src = "digraph G { a [label=<<TABLE><TR><TD>image=\"h.png\"</TD></TR></TABLE>>] }";
    const r = stripImageAttributes(src);
    expect(r.source).toBe(src);
    expect(r.removed).toEqual([]);
  });

  test("does not take image as a key when it is a value", () => {
    const src = "digraph G { a [label=image]; b [shape=box] }";
    expect(stripImageAttributes(src).source).toBe(src);
  });

  test("reports the line of each removed attribute and keeps every line", () => {
    const src = 'digraph G {\n  a [\n    label="A",\n    image="one.png"\n  ];\n  b [image="two.png"];\n}\n';
    const r = stripImageAttributes(src);
    expect(r.removed).toEqual([
      { line: 4, file: "one.png" },
      { line: 6, file: "two.png" },
    ]);
    expect(r.source).not.toContain("image");
    expect(r.source.split("\n").length).toBe(src.split("\n").length);
  });

  test("keeps a newline inside a removed range, so the line count does not change", () => {
    const src = 'digraph G {\n  a [image="x.png"\n    , label="A"];\n}\n';
    const r = stripImageAttributes(src);
    expect(r.source.split("\n").length).toBe(src.split("\n").length);
    expect(r.source.split("\n")[2]!.trim()).toBe('label="A"];');
  });

  test("returns the source unchanged when it has no image attribute", () => {
    const src = "digraph G { a -> b [label=\"x\"] }";
    const r = stripImageAttributes(src);
    expect(r.source).toBe(src);
    expect(r.removed).toEqual([]);
  });

  test("does not throw on an unterminated quoted string", () => {
    expect(() => stripImageAttributes('digraph G { a [image="x.png')).not.toThrow();
  });
  test("removes a comment between the value and the separator together with the attribute", () => {
    const r = stripImageAttributes('digraph G { image="x.png" /* c */ ; a }');
    expect(r.source.replace(/\s+/g, " ")).toBe("digraph G { a }");
    expect(r.removed).toEqual([{ line: 1, file: "x.png" }]);
  });

  test("keeps a non-ASCII file name whole, because DOT identifiers take bytes from 0x80", () => {
    const r = stripImageAttributes("digraph G { a [image=café.png] }");
    expect(r.removed).toEqual([{ line: 1, file: "café.png" }]);
    expect(r.source).not.toContain("café");
  });

  test("reads a # after leading spaces as a token, because only a # in column one starts a preprocessor line", () => {
    const r = stripImageAttributes('digraph G {\n  # image="p.png"\n}\n');
    expect(r.removed).toEqual([{ line: 2, file: "p.png" }]);
  });
});

describe("dropImageElements", () => {
  test("removes a self-closing image element and counts it", () => {
    const img = '<image xlink:href="probe-image.png" width="10px" height="10px" preserveAspectRatio="xMinYMin meet" x="22" y="-23"/>';
    const r = dropImageElements(`<svg><g>${img}<ellipse cx="1"/></g></svg>`);
    expect(r.svg).toBe('<svg><g><ellipse cx="1"/></g></svg>');
    expect(r.dropped).toBe(1);
  });

  test("removes an image element with a closing tag", () => {
    const r = dropImageElements('<svg><image href="a.png" width="1" height="1"></image><rect/></svg>');
    expect(r.svg).toBe("<svg><rect/></svg>");
    expect(r.dropped).toBe(1);
  });

  test("keeps text, class names and other elements that contain the word image", () => {
    const svg = '<svg><text>image</text><g class="image"/><images/><imagemap/></svg>';
    const r = dropImageElements(svg);
    expect(r.svg).toBe(svg);
    expect(r.dropped).toBe(0);
  });
});
