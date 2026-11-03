import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "../../src/index.ts";

const README = fileURLToPath(new URL("../../README.md", import.meta.url));

describe("README: the Mermaid example", () => {
  test("the example source renders to an SVG sequence diagram with no warning", async () => {
    const text = readFileSync(README, "utf8");
    const section = text.slice(text.indexOf("## Mermaid"), text.indexOf("## Roadmap"));
    const captured = /const source = "([^"]*)";/.exec(section)?.[1];
    expect(captured).toBeDefined();
    const source = JSON.parse(`"${captured}"`) as string;
    const result = await render({ type: "mermaid", source, format: "svg" }, {});
    const svg = new TextDecoder().decode(result.bytes);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Hello Bob");
    expect(result.warnings).toEqual([]);
  });
});
