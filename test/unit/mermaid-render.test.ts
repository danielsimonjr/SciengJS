import { afterAll, describe, expect, test } from "bun:test";
import { makeAssetsFolder, makeScratch, realFiles, removeScratch } from "../support/assets-fixture.ts";
import { rejectionOf } from "../support/rejections.ts";
import { renderIsolated } from "../support/test-registry.ts";

const CLASS = "classDiagram\nclass Animal\nAnimal <|-- Dog";
const STATE = "stateDiagram-v2\n[*] --> Still\nStill --> [*]";
const SEQUENCE = "sequenceDiagram\nAlice->>Bob: Hello Bob\nBob-->>Alice: Hi Alice";
const NETWORK_NONE = { allowNetwork: "none" } as const;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const scratch = makeScratch("scieng-mermaid-png-");
const ASSETS = makeAssetsFolder(scratch, "assets", realFiles());
afterAll(() => removeScratch(scratch));

describe("mermaid through render: the native layouts draw three diagram types", () => {
  test("a class diagram renders to svg through the mermaid backend", async () => {
    const result = await renderIsolated({ type: "mermaid", source: CLASS, format: "svg" }, NETWORK_NONE);
    expect(result.mime).toBe("image/svg+xml");
    expect(result.backend).toBe("mermaid/native");
    const svg = new TextDecoder().decode(result.bytes);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Animal");
    expect(svg).toContain("Dog");
  });

  test("a state diagram renders to svg through the mermaid backend", async () => {
    const result = await renderIsolated({ type: "mermaid", source: STATE, format: "svg" }, NETWORK_NONE);
    expect(result.backend).toBe("mermaid/native");
    expect(new TextDecoder().decode(result.bytes)).toContain("Still");
  });

  test("a sequence diagram renders to svg with a lifeline for each participant", async () => {
    const result = await renderIsolated({ type: "mermaid", source: SEQUENCE, format: "svg" }, NETWORK_NONE);
    const svg = new TextDecoder().decode(result.bytes);
    expect(svg).toContain('data-scieng-kind="lifeline"');
    expect(svg).toContain("Hello Bob");
  });

  test("a sequence diagram renders to png with the PNG signature", async () => {
    const result = await renderIsolated({ type: "mermaid", source: SEQUENCE, format: "png" }, { ...NETWORK_NONE, assetsUrl: ASSETS });
    expect(result.mime).toBe("image/png");
    expect(result.backend).toBe("mermaid/native+raster/resvg");
    expect([...result.bytes.slice(0, 4)]).toEqual(PNG_SIGNATURE);
  });
});

describe("mermaid through render: rejections and lenient mode", () => {
  test("a flowchart with no browser path is refused with E_STAGE_MISSING, and the message names the browser stage", async () => {
    const err = await rejectionOf(renderIsolated({ type: "mermaid", source: "flowchart LR\nA --> B", format: "svg" }, NETWORK_NONE));
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(err.message).toContain("SCIENG_BROWSER");
  });

  test("an option other than lenient is refused with E_INPUT", async () => {
    const err = await rejectionOf(
      renderIsolated({ type: "mermaid", source: SEQUENCE, format: "svg", options: { scale: 2 } }, NETWORK_NONE),
    );
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("mermaid takes no option scale");
  });

  test("lenient must be a boolean", async () => {
    const err = await rejectionOf(
      renderIsolated({ type: "mermaid", source: SEQUENCE, format: "svg", options: { lenient: "yes" } }, NETWORK_NONE),
    );
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("option lenient must be true or false");
  });

  test("an out-of-grammar line is refused with E_INPUT on its line in strict mode", async () => {
    const err = await rejectionOf(
      renderIsolated({ type: "mermaid", source: "sequenceDiagram\nautonumber\nA->>B: x", format: "svg" }, NETWORK_NONE),
    );
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(2);
  });

  test("the same line is skipped in lenient mode, and the skip is a warning on its line", async () => {
    const result = await renderIsolated(
      { type: "mermaid", source: "sequenceDiagram\nautonumber\nA->>B: x", format: "svg", options: { lenient: true } },
      NETWORK_NONE,
    );
    expect(new TextDecoder().decode(result.bytes)).toContain("<svg");
    expect(result.warnings).toEqual(['line 2: skipped the unsupported construct "autonumber"']);
  });

  test("a class diagram keeps the parser warnings of its lenient skips", async () => {
    const result = await renderIsolated(
      { type: "mermaid", source: "classDiagram\nclass Animal\ntitle Demo", format: "svg", options: { lenient: true } },
      NETWORK_NONE,
    );
    expect(result.warnings).toEqual(['line 3: skipped the unsupported construct "title Demo"']);
  });

  test("a state diagram keeps the parser warnings of its lenient skips", async () => {
    const result = await renderIsolated(
      { type: "mermaid", source: "stateDiagram-v2\nA --> B\nnote right of A", format: "svg", options: { lenient: true } },
      NETWORK_NONE,
    );
    expect(result.warnings).toEqual(['line 3: skipped the unsupported construct "note right of A"']);
  });

  test("a png render keeps the parser warnings of its lenient skips", async () => {
    const result = await renderIsolated(
      { type: "mermaid", source: "sequenceDiagram\nautonumber\nA->>B: x", format: "png", options: { lenient: true } },
      { ...NETWORK_NONE, assetsUrl: ASSETS },
    );
    expect(result.warnings).toContain('line 2: skipped the unsupported construct "autonumber"');
  });

  test("a rasterFont that cannot be read is refused with E_CONFIG, and the png does not fall back to the bundled font", async () => {
    const err = await rejectionOf(
      renderIsolated({ type: "mermaid", source: SEQUENCE, format: "png" }, { allowNetwork: "none", rasterFont: "C:/no/such/font.ttf" }),
    );
    expect(err.code).toBe("E_CONFIG");
  });
});

describe("mermaid png: the bundled font and the WASM file come from assetsUrl", () => {
  test("a missing bundled font rejects with E_STAGE_MISSING and names the font file", async () => {
    const assetsUrl = makeAssetsFolder(scratch, "mermaid-no-font", { wasm: realFiles().wasm });
    const err = await rejectionOf(renderIsolated({ type: "mermaid", source: SEQUENCE, format: "png" }, { ...NETWORK_NONE, assetsUrl }));
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(err.message).toContain("LiberationSerif-Regular.ttf");
    expect(err.message).toContain("mermaid-no-font");
  });

  test("a missing WASM file rejects with E_STAGE_MISSING and names the file", async () => {
    const assetsUrl = makeAssetsFolder(scratch, "mermaid-no-wasm", { font: realFiles().font });
    const err = await rejectionOf(renderIsolated({ type: "mermaid", source: SEQUENCE, format: "png" }, { ...NETWORK_NONE, assetsUrl }));
    expect(err.code).toBe("E_STAGE_MISSING");
    expect(err.message).toContain("index_bg.wasm");
  });
});
