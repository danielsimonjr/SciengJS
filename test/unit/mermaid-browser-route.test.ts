import { expect, test } from "bun:test";
import { renderIsolated } from "../support/test-registry.ts";

const NONE = { allowNetwork: "none" as const };

test("a flowchart to svg without a browser path rejects with E_STAGE_MISSING", async () => {
  await expect(renderIsolated({ type: "mermaid", source: "flowchart LR\nA --> B", format: "svg" }, NONE)).rejects.toMatchObject({
    code: "E_STAGE_MISSING",
  });
});

test("a gantt to png without a browser path rejects with E_STAGE_MISSING", async () => {
  await expect(renderIsolated({ type: "mermaid", source: "gantt\ntitle T", format: "png" }, NONE)).rejects.toMatchObject({
    code: "E_STAGE_MISSING",
  });
});

test("a dot to pdf without a browser path rejects with E_STAGE_MISSING", async () => {
  await expect(renderIsolated({ type: "dot", source: "digraph G { a -> b }", format: "pdf" }, NONE)).rejects.toMatchObject({
    code: "E_STAGE_MISSING",
  });
});
