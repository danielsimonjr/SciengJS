import { afterAll, describe, expect, test } from "bun:test";
import { makeAssetsFolder, makeScratch, realFiles, removeScratch } from "../support/assets-fixture.ts";
import { renderIsolated } from "../support/test-registry.ts";
import { blockNetwork } from "../support/network-guard.ts";

const CLASS = 'classDiagram\nclass Animal\nAnimal : +String home "http://127.0.0.1:9/page.png"';
const STATE = 'stateDiagram-v2\n[*] --> Still\nStill --> Busy : "http://127.0.0.1:9/s.png"';
const SEQUENCE = 'sequenceDiagram\nAlice->>Bob: <image href="http://127.0.0.1:9/i.png"/>';

const scratch = makeScratch("scieng-mermaid-network-");
const ASSETS = makeAssetsFolder(scratch, "assets", realFiles());
afterAll(() => removeScratch(scratch));

describe("mermaid native layouts with allowNetwork none", () => {
  test("class, state and sequence renders open no connection, and a URL in a label stays text", async () => {
    const attempts: string[] = [];
    const restore = blockNetwork(attempts);
    try {
      for (const source of [CLASS, STATE, SEQUENCE]) {
        const result = await renderIsolated({ type: "mermaid", source, format: "svg" }, { allowNetwork: "none" });
        const svg = new TextDecoder().decode(result.bytes);
        expect(svg).toContain("<svg");
        expect(svg).not.toContain("<image");
        expect(svg).not.toContain('href="');
      }
      const png = await renderIsolated({ type: "mermaid", source: SEQUENCE, format: "png" }, { allowNetwork: "none", assetsUrl: ASSETS });
      expect(png.bytes[0]).toBe(0x89);
    } finally {
      restore();
    }
    expect(attempts).toEqual([]);
  });
});
