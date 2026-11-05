import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { makeAssetsFolder, makeScratch, realFiles, removeScratch } from "../support/assets-fixture.ts";
import { rejectionOf } from "../support/rejections.ts";
import { renderIsolated } from "../support/test-registry.ts";

const SOURCE = "part def Car { part wheel : Wheel [4]; } part def Wheel;";
const NONE = { allowNetwork: "none" } as const;
const BROWSER = process.env.SCIENG_BROWSER ?? "";
const haveBrowser = BROWSER !== "" && existsSync(BROWSER);
const scratch = makeScratch("scieng-sysml-png-");
const ASSETS = makeAssetsFolder(scratch, "assets", realFiles());
afterAll(() => removeScratch(scratch));

describe("sysml through render", () => {
  test("svg goes through the graph stage and names both blocks", async () => {
    const result = await renderIsolated({ type: "sysml", source: SOURCE, format: "svg" }, NONE);
    expect(result.mime).toBe("image/svg+xml");
    expect(result.backend).toBe("sysml/graph");
    const svg = new TextDecoder().decode(result.bytes);
    expect(svg).toContain("Car");
    expect(svg).toContain("wheel [4]");
  });

  test("png has the PNG signature and keeps the lenient warnings", async () => {
    const result = await renderIsolated(
      { type: "sysml", source: `${SOURCE}\naction x;`, format: "png", options: { lenient: true, scale: 2 } },
      { ...NONE, assetsUrl: ASSETS },
    );
    expect([...result.bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(result.backend).toBe("sysml/graph+raster/resvg");
    expect(result.warnings).toContain('line 2: skipped the unsupported statement "action"');
  });

  test("an input error keeps its code and its line through the worker", async () => {
    const err = await rejectionOf(renderIsolated({ type: "sysml", source: "part def A;\nstate s;", format: "svg" }, NONE));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("line 2:");
  });

  test("a png scale over the maximum rejects", async () => {
    const err = await rejectionOf(renderIsolated({ type: "sysml", source: SOURCE, format: "png", options: { scale: 1000 } }, { ...NONE, assetsUrl: ASSETS }));
    expect(err.code).toBe("E_INPUT");
  });

  test.skipIf(!haveBrowser)("pdf has the pdf signature", async () => {
    const result = await renderIsolated({ type: "sysml", source: SOURCE, format: "pdf" }, { ...NONE, browser: BROWSER });
    expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe("%PDF-");
    expect(result.backend).toBe("sysml/graph+browser/chromium");
  }, 60000);
});
