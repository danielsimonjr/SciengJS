import { afterAll, describe, expect, test } from "bun:test";
import { dotToSvg } from "../../src/graph/dot.ts";
import { classToDot, parseClassDiagram, type ClassModel } from "../../src/mermaid/class.ts";
import { xmlSafe } from "../../src/graph/text.ts";
import { prepare } from "../../src/mermaid/common.ts";
import { renderMermaidSvg } from "../../src/mermaid/render.ts";
import type { SequenceModel } from "../../src/mermaid/sequence.ts";
import { layoutSequence } from "../../src/mermaid/sequence-layout.ts";
import { stateToDot, type StateModel } from "../../src/mermaid/state.ts";
import { svgToPng } from "../../src/raster/index.ts";
import { makeAssetsFolder, makeScratch, realFiles, removeScratch } from "../support/assets-fixture.ts";

const scratch = makeScratch("scieng-mermaid-xml-");
const ASSETS = makeAssetsFolder(scratch, "assets", realFiles());
afterAll(() => removeScratch(scratch));

/**
 * The first code point that XML 1.0 does not allow, written as U+ and four hex digits, or "" when none is found.
 * The ranges are those of the Char production, written here without the helper under test.
 */
function firstForbiddenChar(text: string): string {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const allowed =
      cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
    if (!allowed) return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return "";
}

/** The error that resvg raises for the SVG, or "" when resvg accepts it. resvg is the XML parser of the PNG output. */
async function resvgError(svg: string): Promise<string> {
  try {
    await svgToPng(svg, { scale: 1, maxMemoryMb: 1024, assetsUrl: ASSETS });
    return "";
  } catch (err) {
    return String(err);
  }
}

/** Asserts that the SVG holds no forbidden code point and that resvg parses it. */
async function expectWellFormed(svg: string): Promise<void> {
  expect(firstForbiddenChar(svg)).toBe("");
  expect(await resvgError(svg)).toBe("");
}

const WARNING = "each character outside the XML 1.0 range is shown as U+FFFD";

describe("xmlSafe", () => {
  test("a code point that XML 1.0 forbids becomes U+FFFD", () => {
    expect(xmlSafe("a\u{1}b\u{0}c\u{8}d\u{b}e\u{c}f\u{e}g\u{1f}h\u{fffe}i\u{ffff}j")).toBe(
      "a\u{fffd}b\u{fffd}c\u{fffd}d\u{fffd}e\u{fffd}f\u{fffd}g\u{fffd}h\u{fffd}i\u{fffd}j",
    );
  });

  test("a lone surrogate becomes U+FFFD, and a surrogate pair survives", () => {
    expect(xmlSafe("x\ud800y\udc00z")).toBe("x\u{fffd}y\u{fffd}z");
    expect(xmlSafe("\u{1f600}")).toBe("\u{1f600}");
  });

  test("tab, line feed, carriage return, DEL, both edges of each allowed range and astral characters pass unchanged", () => {
    const kept = "a\tb\nc\rd\u{7f} \u{e9} \u{4e2d} \u{d7ff} \u{e000} \u{e001} \u{fffc} \u{fffd} \u{10000} \u{10ffff} \u{1f600}";
    expect(xmlSafe(kept)).toBe(kept);
  });
});

describe("prepare warns once for each line that holds a forbidden character", () => {
  test("each kept line with a forbidden character gives one warning with its line number", () => {
    const src = prepare("sequenceDiagram\nA->>B: a\u{1}b\nA->>B: c\u{2}\u{3}d", {});
    expect(src.warnings).toEqual([`line 2: ${WARNING}`, `line 3: ${WARNING}`]);
  });

  test("the warning is the same in lenient mode and in strict mode", () => {
    expect(prepare("sequenceDiagram\nA->>B: a\u{1}b", { lenient: true }).warnings).toEqual([`line 2: ${WARNING}`]);
    expect(prepare("sequenceDiagram\nA->>B: a\u{1}b", {}).warnings).toEqual([`line 2: ${WARNING}`]);
  });

  test("a comment line with a forbidden character is dropped, so it gives no warning", () => {
    expect(prepare("%% a\u{1}\nsequenceDiagram\nA->>B: x", {}).warnings).toEqual([]);
  });

  test("a valid U+FFFD in the source is not forbidden, so it gives no warning", () => {
    expect(prepare("sequenceDiagram\nA->>B: x\u{fffd}y", {}).warnings).toEqual([]);
  });

  test("a clean source gives no warning", () => {
    expect(prepare("sequenceDiagram\nA->>B: hi", {}).warnings).toEqual([]);
  });
});

describe("the sequence path writes well-formed XML", () => {
  test("a control character in an alias, a message, a note and a block gives well-formed XML", async () => {
    const source = [
      "sequenceDiagram",
      "participant A as Al\u{1}ice",
      "A->>B: hi\u{1}there\u{0}x",
      "Note over A: n\u{2}ote",
      "loop l\u{3}oop",
      "B-->>A: y\u{4}",
      "end",
    ].join("\n");
    const r = await renderMermaidSvg(source, {});
    await expectWellFormed(r.svg);
    expect(r.svg).toContain("Al\u{fffd}ice");
    expect(r.svg).toContain("hi\u{fffd}there\u{fffd}x");
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  test("a control character reaches the layout through the builder, and the markup characters stay escaped", async () => {
    const model: SequenceModel = {
      participants: [{ id: "A\u{1}", label: "x\u{2}<&>\"'", line: 1 }],
      events: [
        {
          kind: "message",
          from: "A\u{1}",
          to: "A\u{1}",
          token: "->>",
          dashed: false,
          arrowhead: true,
          text: "a\u{3}&b",
          activateTarget: false,
          deactivateSource: false,
          line: 2,
        },
      ],
    };
    const svg = layoutSequence(model);
    await expectWellFormed(svg);
    expect(svg).toContain("x\u{fffd}&lt;&amp;&gt;&quot;&apos;");
    expect(svg).toContain("a\u{fffd}&amp;b");
  });
});

describe("the state path writes well-formed XML", () => {
  test("a control character in a quoted state label and in a transition label gives well-formed XML", async () => {
    const source = 'stateDiagram-v2\nstate "a\u{1}b" as S\nS --> T : x\u{2}y\nT --> [*]';
    const r = await renderMermaidSvg(source, {});
    await expectWellFormed(r.svg);
    expect(r.svg).toContain("a\u{fffd}b");
    expect(r.svg).toContain("x\u{fffd}y");
  });

  test("a control character reaches the DOT source through the builder, and the SVG of that source is well-formed", async () => {
    const model: StateModel = {
      direction: "TB",
      states: [{ id: "S", label: "a\u{1}b", line: 2 }],
      transitions: [{ from: "S", to: "S", label: "l\u{2}", line: 3 }],
    };
    const dot = stateToDot(model);
    expect(firstForbiddenChar(dot)).toBe("");
    await expectWellFormed((await dotToSvg(dot)).svg);
  });
});

describe("the class path writes well-formed XML", () => {
  const source = 'classDiagram\nclass A\nA : x\u{1}y\nA "1\u{2}" --> "*" B : l\u{3}bl';

  test("a control character in a member, a cardinality and a relation label stays out of the DOT source", () => {
    const dot = classToDot(parseClassDiagram(prepare(source, {})));
    expect(firstForbiddenChar(dot)).toBe("");
    expect(dot).toContain("x\u{fffd}y");
    expect(dot).toContain("l\u{fffd}bl");
  });

  test("the SVG of that source is well-formed XML and names each replaced character in a warning", async () => {
    const r = await renderMermaidSvg(source, {});
    await expectWellFormed(r.svg);
    expect(r.warnings).toContain(`line 3: ${WARNING}`);
    expect(r.warnings).toContain(`line 4: ${WARNING}`);
  });

  test("a control character reaches the DOT source through the builder too", () => {
    const model: ClassModel = {
      direction: "TB",
      classes: [{ name: "A", generic: undefined, members: ["+x\u{1}"], line: 1 }],
      relations: [
        {
          from: "A",
          to: "B",
          token: "-->",
          arrow: { dashed: false, tail: "none", head: "arrow" },
          fromCardinality: "1\u{2}",
          toCardinality: undefined,
          label: "l\u{3}",
          line: 2,
        },
      ],
    };
    expect(firstForbiddenChar(classToDot(model))).toBe("");
  });
});
