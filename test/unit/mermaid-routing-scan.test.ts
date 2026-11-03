import { describe, expect, test } from "bun:test";

import { routesToBrowser } from "../../src/mermaid/common.ts";

describe("routesToBrowser", () => {
  test("skips blank lines", () => {
    expect(routesToBrowser("\n\n   \n\t\nflowchart TD")).toBe(true);
    expect(routesToBrowser("\n\n   \n\t\nnotADiagram")).toBe(false);
  });

  test("skips %% comment lines", () => {
    expect(routesToBrowser("%% a comment\n%%another comment\nflowchart TD")).toBe(true);
  });

  test("skips %%{...}%% directives", () => {
    expect(routesToBrowser('%%{init: {"theme": "forest"}}%%\nflowchart TD')).toBe(true);
  });

  test("skips a leading --- front matter block", () => {
    expect(routesToBrowser("---\ntitle: Example\nscale: 2\n---\nflowchart TD")).toBe(true);
  });

  test("returns false when --- front matter is unclosed", () => {
    expect(routesToBrowser("---\ntitle: Example\ngantt")).toBe(false);
    expect(routesToBrowser("---\nflowchart TD")).toBe(false);
  });

  test("returns true only when the first word is in OTHER_TYPES", () => {
    expect(routesToBrowser("flowchart TD")).toBe(true);
    expect(routesToBrowser("graph LR")).toBe(true);
    expect(routesToBrowser("gantt")).toBe(true);
    expect(routesToBrowser("pie showData")).toBe(true);
    expect(routesToBrowser("  pie   show  ")).toBe(true);
  });

  test("returns false for classDiagram and for an unknown word", () => {
    expect(routesToBrowser("classDiagram\nAnimal <|-- Duck")).toBe(false);
    expect(routesToBrowser("notADiagram")).toBe(false);
  });

  test("returns false when only blanks, comments and directives remain", () => {
    expect(routesToBrowser("\n%% note\n\n%%{init: {}}%%\n   \n")).toBe(false);
  });

  test("supports CRLF line endings", () => {
    expect(routesToBrowser("%%{init: {}}%%\r\n---\r\ntitle: Example\r\n---\r\nflowchart TD\r\nA --> B")).toBe(true);
    expect(routesToBrowser("---\r\ntitle: Example\r\nclassDiagram")).toBe(false);
  });
});
