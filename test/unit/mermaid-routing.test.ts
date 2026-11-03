import { expect, test } from "bun:test";
import { routesToBrowser } from "../../src/mermaid/common.ts";

test("a native header routes to the native layouts", () => {
  expect(routesToBrowser("classDiagram\nclass A")).toBe(false);
  expect(routesToBrowser("stateDiagram-v2\n[*] --> A")).toBe(false);
  expect(routesToBrowser("sequenceDiagram\nA->>B: hi")).toBe(false);
});

test("any other header routes to the browser stage", () => {
  expect(routesToBrowser("flowchart LR\nA --> B")).toBe(true);
  expect(routesToBrowser("gantt\ntitle T")).toBe(true);
  expect(routesToBrowser("pie\n\"a\" : 1")).toBe(true);
});

test("comment lines and blank lines before the header do not change the route", () => {
  expect(routesToBrowser("%% note\n\n  gantt\ntitle T")).toBe(true);
  expect(routesToBrowser("%% note\nsequenceDiagram\nA->>B: hi")).toBe(false);
});

test("a source with no header routes to the native layouts, which then reject it", () => {
  expect(routesToBrowser("%% only a comment")).toBe(false);
});

test("a directive before a native header routes native and does not throw", () => {
  expect(routesToBrowser('%%{init: {"theme": "dark"}}%%\nclassDiagram\nclass A')).toBe(false);
});

test("front matter before a browser header routes to the browser stage", () => {
  expect(routesToBrowser("---\ntitle: T\n---\nflowchart LR\nA --> B")).toBe(true);
  expect(routesToBrowser("---\ntitle: T\n---\nclassDiagram\nclass A")).toBe(false);
});

test("an unclosed front matter does not throw and stays on the native path, which rejects it", () => {
  expect(routesToBrowser("---\ntitle: T\nflowchart LR")).toBe(false);
  expect(routesToBrowser("---\nflowchart LR")).toBe(false);
});

test("only a first word in the list of other types routes to the browser stage", () => {
  expect(routesToBrowser("notADiagram\nA --> B")).toBe(false);
  expect(routesToBrowser("classDiagram extra")).toBe(false);
  expect(routesToBrowser("graph TD\nA --> B")).toBe(true);
  expect(routesToBrowser("flowchart")).toBe(true);
});
