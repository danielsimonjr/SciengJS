import { describe, expect, test } from "bun:test";
import { compareSvg, normalizeSvg } from "../support/svg-compare.ts";

const EXPECTED = `<?xml version="1.0"?>
<!-- generated -->
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">
  <defs><linearGradient id="gradA"><stop offset="0"/></linearGradient></defs>
  <rect x="10.0000004" y="5" width="30" height="20" fill="url(#gradA)" id="box1"/>
  <text x="12.5" y="30">label</text>
</svg>`;

describe("normalizeSvg", () => {
  test("drops the XML declaration and comments", () => {
    const out = normalizeSvg(EXPECTED);
    expect(out).not.toContain("<?xml");
    expect(out).not.toContain("generated");
  });

  test("renumbers ids and their references in order of first appearance", () => {
    const out = normalizeSvg(EXPECTED);
    expect(out).toContain('id="id1"');
    expect(out).toContain('id="id2"');
    expect(out).toContain("url(#id1)");
    expect(out).not.toContain("gradA");
    expect(out).not.toContain("box1");
  });

  test("rounds numbers to three decimals and drops trailing zeros", () => {
    const out = normalizeSvg('<svg><rect x="1.0004" y="2.50000" width="3.0" height="-0.0001"/></svg>');
    expect(out).toContain('x="1"');
    expect(out).toContain('y="2.5"');
    expect(out).toContain('width="3"');
    expect(out).toContain('height="0"');
  });

  test("sorts the attributes of each tag", () => {
    const out = normalizeSvg('<svg><rect width="1" height="2" x="3"/></svg>');
    expect(out).toContain('<rect height="2" width="1" x="3"/>');
  });

  test("gives one new id to every occurrence of the same original id", () => {
    const out = normalizeSvg('<svg><a id="a"/><b id="b"/><c id="a"/></svg>');
    expect(out).toBe('<svg><a id="id1"/><b id="id2"/><c id="id1"/></svg>');
  });
});

describe("compareSvg", () => {
  test("accepts an equivalent SVG with other ids, attribute order and number precision", () => {
    const actual = `<svg height="50" width="100" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g9"><stop offset="0"/></linearGradient></defs>
      <rect fill="url(#g9)" id="r7" height="20" width="30" y="5" x="10"/>
      <text y="30" x="12.5">label</text></svg>`;
    const result = compareSvg(actual, EXPECTED);
    expect(result.equal).toBe(true);
  });

  test("rejects an SVG whose rectangle width changed", () => {
    const actual = EXPECTED.replace('width="30"', 'width="31"');
    const result = compareSvg(actual, EXPECTED);
    expect(result.equal).toBe(false);
    expect(result.diff).toBeDefined();
  });

  test("rejects an SVG whose label text changed", () => {
    const actual = EXPECTED.replace(">label<", ">Label<");
    expect(compareSvg(actual, EXPECTED).equal).toBe(false);
  });

  test("rejects a number that differs in the third decimal", () => {
    const actual = '<svg><rect x="1.2341"/></svg>';
    const expected = '<svg><rect x="1.2349"/></svg>';
    expect(compareSvg(actual, expected).equal).toBe(false);
  });
});
