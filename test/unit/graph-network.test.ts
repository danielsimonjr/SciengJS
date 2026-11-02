import { describe, expect, test } from "bun:test";
import { dotToSvg } from "../../src/graph/dot.ts";
import { render } from "../../src/index.ts";

const SOURCE = [
  "digraph G {",
  '  a [image="http://127.0.0.1:9/img.png"];',
  '  b [URL="http://127.0.0.1:9/page"];',
  "  c [label=<<TABLE><TR><TD><IMG SRC=\"http://127.0.0.1:9/i.png\"/></TD></TR></TABLE>>];",
  "}",
  "",
].join("\n");

describe("graph stage with allowNetwork none", () => {
  test("the public render of a source with image, URL and HTML IMG succeeds under allowNetwork none", async () => {
    const result = await render({ type: "dot", source: SOURCE, format: "svg" }, { allowNetwork: "none" });
    expect(result.mime).toBe("image/svg+xml");
    expect(new TextDecoder().decode(result.bytes)).toContain("<svg");
  });

  test("the backend opens no request and no socket: fetch and WebSocket would throw and must not be called", async () => {
    const realFetch = globalThis.fetch;
    const realWebSocket = globalThis.WebSocket;
    const attempts: string[] = [];
    globalThis.fetch = (async (input: unknown) => {
      attempts.push(`fetch ${String(input)}`);
      throw new Error("network is off");
    }) as unknown as typeof fetch;
    globalThis.WebSocket = class {
      constructor(url: string) {
        attempts.push(`WebSocket ${url}`);
        throw new Error("network is off");
      }
    } as unknown as typeof WebSocket;
    try {
      const r = await dotToSvg(SOURCE);
      expect(r.svg).toContain("<svg");
      expect(attempts).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
      globalThis.WebSocket = realWebSocket;
    }
  });
});
