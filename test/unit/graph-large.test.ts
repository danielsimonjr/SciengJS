import { describe, expect, test } from "bun:test";
import { render } from "../../src/index.ts";

/** A generated graph of 100 nodes and 199 edges. Its layout is the slow case of trial T1. */
function largeGraph(nodes: number): string {
  const lines = ["digraph Large {"];
  for (let i = 0; i < nodes - 1; i += 1) lines.push(`  n${i} -> n${i + 1};`);
  for (let i = 0; i < nodes; i += 1) {
    const j = (i * 37 + 11) % nodes;
    if (j !== i) lines.push(`  n${i} -> n${j};`);
  }
  lines.push("}");
  return lines.join("\n");
}

describe("a large graph", () => {
  // The default timeout of 60000 ms covers the corpus graphs. A graph of 100 nodes sets its own limit.
  test("a 100-node graph renders with its own time limit and draws every node", async () => {
    const result = await render(
      { type: "dot", source: largeGraph(100), format: "svg" },
      { timeoutMs: 120000 },
    );
    const svg = new TextDecoder().decode(result.bytes);
    expect((svg.match(/class="node"/g) ?? []).length).toBe(100);
    expect(result.warnings).toEqual([]);
  }, 150000);
});
