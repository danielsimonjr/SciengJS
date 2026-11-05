import { describe, expect, test } from "bun:test";
import { prepare, readLenient } from "../../src/mermaid/common.ts";
import { rejection } from "../support/rejections.ts";

describe("Mermaid header detection", () => {
  test("classDiagram, classDiagram-v2, stateDiagram-v2 and sequenceDiagram name their kind", () => {
    expect(prepare("classDiagram\nclass A", {}).kind).toBe("class");
    expect(prepare("classDiagram-v2\nclass A", {}).kind).toBe("class");
    expect(prepare("stateDiagram-v2\n[*] --> A", {}).kind).toBe("state");
    expect(prepare("sequenceDiagram\nA->>B: hi", {}).kind).toBe("sequence");
  });

  test("blank lines and comment lines before the header are skipped, and the header keeps its line number", () => {
    const p = prepare("\n%% a comment\n   \nsequenceDiagram\nA->>B: hi", {});
    expect(p.kind).toBe("sequence");
    expect(p.headerLine).toBe(4);
    expect(p.lines).toEqual([{ number: 5, text: "A->>B: hi" }]);
  });

  test("a known Mermaid type that the native layouts do not draw rejects with E_UNSUPPORTED", () => {
    const err = rejection(() => prepare("flowchart TD\nA-->B", {}));
    expect(err.code).toBe("E_UNSUPPORTED");
    expect(err.message).toContain("flowchart");
  });

  test("E_UNSUPPORTED is not lifted by lenient: a whole type is never skipped", () => {
    const err = rejection(() => prepare("flowchart TD\nA-->B", { lenient: true }));
    expect(err.code).toBe("E_UNSUPPORTED");
  });

  test("an unknown first word rejects with E_INPUT on the line that holds it", () => {
    const err = rejection(() => prepare("\nhello world\nA->B", {}));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("the header keyword must stand alone on its line", () => {
    const err = rejection(() => prepare("sequenceDiagram title Demo\nA->>B: hi", {}));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(1);
  });

  test("a source with no content line rejects with E_INPUT", () => {
    const err = rejection(() => prepare("%% only a comment\n\n", {}));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("no Mermaid diagram type");
  });
});

describe("Mermaid source lines", () => {
  test("CRLF line ends give the same numbers and texts as LF line ends", () => {
    const p = prepare("classDiagram\r\nclass A\r\n  class B  \r\n", {});
    expect(p.lines).toEqual([
      { number: 2, text: "class A" },
      { number: 3, text: "class B" },
    ]);
  });

  test("a directive line rejects with E_INPUT on its line, because a directive is outside the grammar", () => {
    const err = rejection(() => prepare("%%{init: {\"theme\": \"dark\"}}%%\nclassDiagram\nclass A", {}));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(1);
  });

  test("a directive after the header rejects on its own line", () => {
    const err = rejection(() => prepare("classDiagram\n%%{init: {}}%%\nclass A", {}));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("lenient skips a directive, keeps the diagram and names the skipped line in a warning", () => {
    const p = prepare("%%{init: {}}%%\nclassDiagram\nclass A", { lenient: true });
    expect(p.kind).toBe("class");
    expect(p.warnings).toEqual(['line 1: skipped the unsupported construct "%%{init: {}}%%"']);
  });

  test("front matter rejects with E_INPUT on its opening line", () => {
    const err = rejection(() => prepare("---\ntitle: Demo\n---\nclassDiagram\nclass A", {}));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(1);
  });

  test("lenient skips front matter through its closing line", () => {
    const p = prepare("---\ntitle: Demo\n---\nclassDiagram\nclass A", { lenient: true });
    expect(p.kind).toBe("class");
    expect(p.headerLine).toBe(4);
    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toContain("line 1");
  });

  test("front matter that is never closed rejects with E_INPUT even when lenient", () => {
    const err = rejection(() => prepare("---\ntitle: Demo\nclassDiagram\nclass A", { lenient: true }));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(1);
  });
});

describe("Mermaid options", () => {
  test("lenient is false by default and true when the caller sets it", () => {
    expect(readLenient({}, [])).toBe(false);
    expect(readLenient({ lenient: true }, [])).toBe(true);
    expect(readLenient({ lenient: false }, [])).toBe(false);
  });

  test("lenient must be a boolean", () => {
    const err = rejection(() => readLenient({ lenient: "yes" }, []));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("lenient");
  });

  test("an unknown option rejects with E_INPUT and names the key", () => {
    const err = rejection(() => readLenient({ theme: "dark" }, []));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("theme");
  });

  test("an option that the caller lists as extra is accepted, and lenient still applies", () => {
    expect(readLenient({ scale: 2, lenient: true }, ["scale"])).toBe(true);
  });
});
