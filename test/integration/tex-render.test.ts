import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { renderTex } from "../../src/tex/render.ts";
import { texBuildOrSkip } from "../support/tex-engine.ts";
import { rejectionOf } from "../support/rejections.ts";

const build = texBuildOrSkip("test/integration/tex-render.test.ts");
const run = build ? test : test.skip;
const CIRCUIT = new URL("../../trials/t6-etex-build/samples/circuit.tex", import.meta.url);
/** The first 16 hex digits of the SVG hash of the T6 trial. */
const T6_HASH = "f3896ab85341d476";

describe("tex render of the circuit sample", () => {
  run("renders circuit.tex to the SVG of the T6 trial", async () => {
    const source = readFileSync(CIRCUIT, "utf8");
    const opts = { engine: build!.engine, format: build!.format, tree: build!.tree, source, jobName: "circuit", timeoutMs: 60000 };
    const first = await renderTex(opts);
    const hash = createHash("sha256").update(first.svg).digest("hex").slice(0, 16);
    console.log(`tex render: first run ${first.texMs.toFixed(0)} ms TeX + ${first.svgMs.toFixed(0)} ms SVG, sha256/16 ${hash}`);
    expect(first.glyphs).toBe(10);
    expect(first.missing).toEqual([]);
    expect((first.svg.match(/<path\b/g) ?? []).length).toBeGreaterThanOrEqual(10);
    expect(first.svg).not.toContain("<text");
    expect(first.svg).not.toContain("font-family");
    expect(hash).toBe(T6_HASH);
    expect(first.ignoredSpecials).toEqual(["papersize=165.18846pt,105.37454pt", "ps::%%HiResBoundingBox:"]);
    const warm: number[] = [];
    for (let i = 0; i < 3; i++) {
      const again = await renderTex(opts);
      expect(again.svg).toBe(first.svg);
      warm.push(again.texMs + again.svgMs);
    }
    console.log(`tex render: warm runs ${warm.map((w) => w.toFixed(0)).join(", ")} ms`);
  });

  run("the tree stays as it was: nothing written to the bundle tree", async () => {
    await renderTex({ engine: build!.engine, format: build!.format, tree: build!.tree, source: readFileSync(CIRCUIT, "utf8"), jobName: "circuit" });
    expect(build!.tree.written.size).toBe(0);
  });

  run("a source with a TeX error and no output rejects with E_INPUT and the line", async () => {
    const source = "\\documentclass{standalone}\n\\begin{document}\n\\undefinedmacro\n\\end{document}\n";
    const err = await rejectionOf(renderTex({ engine: build!.engine, format: build!.format, tree: build!.tree, source, jobName: "bad", timeoutMs: 60000 }));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("Undefined control sequence");
    expect(err.line).toBe(3);
  });
});
