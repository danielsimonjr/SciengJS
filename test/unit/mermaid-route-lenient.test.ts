import { expect, test } from "bun:test";
import { renderIsolated } from "../support/test-registry.ts";

const NONE = { allowNetwork: "none" as const };

test("a directive before a native class diagram renders with lenient and warns", async () => {
  const out = await renderIsolated(
    { type: "mermaid", source: '%%{init: {"theme": "dark"}}%%\nclassDiagram\nclass A', format: "svg", options: { lenient: true } },
    NONE,
  );
  expect(out.backend).toBe("mermaid/native");
  expect(out.warnings.join("\n")).toContain("line 1: skipped the unsupported construct");
});

test("a directive before a native class diagram without lenient rejects with E_INPUT on line 1", async () => {
  await expect(
    renderIsolated({ type: "mermaid", source: "%%{init: {}}%%\nclassDiagram\nclass A", format: "svg" }, NONE),
  ).rejects.toMatchObject({ code: "E_INPUT", line: 1 });
});

test("an unknown header rejects with E_INPUT, not with a browser error", async () => {
  await expect(renderIsolated({ type: "mermaid", source: "notADiagram\nA --> B", format: "svg" }, NONE)).rejects.toMatchObject({
    code: "E_INPUT",
  });
});

test("the mermaid svg and png capabilities say which types need the browser stage", async () => {
  const { capabilities } = await import("../../src/index.ts");
  const caps = await capabilities();
  for (const format of ["svg", "png"]) {
    const cap = caps.find((c) => c.type === "mermaid" && c.format === format);
    expect(cap?.note).toBe("types other than class, state and sequence need the browser stage");
  }
});

test("a native png takes the option scale, and scale 2 doubles the pixel width", async () => {
  const req = { type: "mermaid" as const, source: "classDiagram\nclass A", format: "png" as const };
  const width = (b: Uint8Array): number => new DataView(b.buffer, b.byteOffset).getUint32(16);
  const one = await renderIsolated(req, NONE);
  const two = await renderIsolated({ ...req, options: { scale: 2 } }, NONE);
  expect(Math.abs(width(two.bytes) - 2 * width(one.bytes))).toBeLessThanOrEqual(1);
  await expect(renderIsolated({ ...req, options: { scale: -1 } }, NONE)).rejects.toMatchObject({ code: "E_INPUT" });
});

test("a mermaid png scale over the html png limit rejects with E_INPUT on both routes", async () => {
  for (const source of ["classDiagram\nclass A", "gantt\ntitle T"]) {
    await expect(renderIsolated({ type: "mermaid", source, format: "png", options: { scale: 9 } }, NONE)).rejects.toMatchObject({
      code: "E_INPUT",
      message: "option scale must not be more than 8",
    });
  }
});
