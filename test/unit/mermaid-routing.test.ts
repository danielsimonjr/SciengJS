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
