import { describe, expect, test } from "bun:test";
import { DEFAULT_ASSETS_URL } from "../../src/config.ts";
import { rejectionOf } from "../support/rejections.ts";
import { render } from "../../src/graph/backend-svg.ts";
import { dotSourceText, dotToSvg } from "../../src/graph/dot.ts";
import type { WorkerJob } from "../../src/worker/protocol.ts";

function request(source: string | Uint8Array, options: Record<string, unknown> = {}): WorkerJob["request"] {
  return { type: "dot", format: "svg", source, options, settings: { maxMemoryMb: 2048, rasterFont: undefined, assetsUrl: DEFAULT_ASSETS_URL } };
}

describe("dot to svg backend", () => {
  test("renders SVG bytes and carries the warnings of the stage", async () => {
    const out = await render(request('digraph G { stylesheet="x.css"; a -> b }'));
    const svg = new TextDecoder().decode(out.bytes);
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("x.css");
    expect(out.warnings).toHaveLength(1);
  });

  test("any option rejects with E_INPUT and names the option", async () => {
    const err = await rejectionOf(render(request("digraph G { a }", { scale: 2 })));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("scale");
  });

  test("a source given as bytes is read as UTF-8", async () => {
    const out = await render(request(new TextEncoder().encode("digraph G { a -> b }")));
    expect(new TextDecoder().decode(out.bytes)).toContain("<title>a</title>");
  });
});

describe("dotSourceText", () => {
  test("passes text through and decodes bytes as UTF-8", () => {
    expect(dotSourceText("digraph {}")).toBe("digraph {}");
    expect(dotSourceText(new TextEncoder().encode("digraph { é }"))).toBe("digraph { é }");
  });
});

describe("dotToSvg with a failing viz instance", () => {
  test("a failure with no error entries rejects with E_INPUT and a message, not a TypeError", async () => {
    const fake = async () => ({ render: () => ({ status: "failure", errors: [], output: undefined }) }) as never;
    const err = await rejectionOf(dotToSvg("digraph {}", fake));
    expect(err.code).toBe("E_INPUT");
    expect(err.message.length).toBeGreaterThan(10);
  });

  test("a failure with a warning entry only still names that entry", async () => {
    const fake = async () => ({ render: () => ({ status: "failure", errors: [{ level: "warning", message: "oops line 4" }] }) }) as never;
    const err = await rejectionOf(dotToSvg("digraph {}", fake));
    expect(err.message).toContain("oops");
    expect(err.line).toBe(4);
  });
});
