// The core TeX bundle loads once in the parent process. Each fresh render worker gets a copy of its files.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderWithRegistry } from "../../src/core.ts";
import { RenderError } from "../../src/errors.ts";
import { DEFAULT_REGISTRY, type Registry } from "../../src/registry.ts";
import { texCoreFiles } from "../../src/tex/bundles.ts";
import { loadCore } from "../../src/tex/stage.ts";
import { ISOLATED_CONFIG_DEPS, TEST_REGISTRY } from "../support/test-registry.ts";
import { testSettings } from "../support/settings.ts";

const STUB = TEST_REGISTRY["dot:svg"]!.moduleUrl;
const decode = (b: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(b));
/** The smallest valid WASM module: the magic number and version 1. */
const EMPTY_WASM = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);

describe("the preload of a registry entry", () => {
  test("the backend receives the files that the preload returns", async () => {
    const files = new Map([["a.tex", new Uint8Array([1, 2])]]);
    const registry: Registry = { "dot:svg": { backend: "test/fixed", moduleUrl: STUB, preload: async () => files } };
    const out = await renderWithRegistry({ type: "dot", format: "svg", source: "texcore" }, {}, registry, ISOLATED_CONFIG_DEPS);
    expect(decode(out.bytes)).toEqual(["a.tex"]);
  });

  test("an entry with no preload gives the backend no core files", async () => {
    const out = await renderWithRegistry({ type: "dot", format: "svg", source: "texcore" }, {}, TEST_REGISTRY, ISOLATED_CONFIG_DEPS);
    expect(decode(out.bytes)).toBeNull();
  });

  test("a preload error does not fail the render: the worker runs without the files and reports its own error", async () => {
    const registry: Registry = {
      "dot:svg": { backend: "test/fixed", moduleUrl: STUB, preload: async () => { throw new RenderError("E_STAGE_MISSING", "no core bundle"); } },
    };
    const out = await renderWithRegistry({ type: "dot", format: "svg", source: "texcore" }, {}, registry, ISOLATED_CONFIG_DEPS);
    expect(decode(out.bytes)).toBeNull();
  });
});

describe("the tikz preload", () => {
  test("a source with a GPL-only package loads no bundle", async () => {
    const preload = DEFAULT_REGISTRY["tikz:svg"]!.preload!;
    const source = String.raw`\usepackage{pgfplots}` + "\n" + String.raw`\begin{tikzpicture}\end{tikzpicture}`;
    expect(await preload(testSettings({ allowNetwork: "none" }), source)).toBeUndefined();
  });
});

describe("texCoreFiles", () => {
  test("the loader runs once per process; a second call returns the same files", async () => {
    let calls = 0;
    const load = async (): Promise<Map<string, Uint8Array>> => { calls++; return new Map([["x.tex", new Uint8Array([7])]]); };
    const settings = testSettings();
    const first = await texCoreFiles(settings, load);
    const second = await texCoreFiles(settings, load);
    expect(calls).toBe(1);
    expect(second).toBe(first);
  });
});

describe("loadCore with the files of the parent", () => {
  test("it builds the engine and the tree from settings.texCore and reads no cache", async () => {
    const texCore = new Map<string, Uint8Array>([
      ["engine.wasm", EMPTY_WASM],
      ["engine.symbols.json", new TextEncoder().encode("{}")],
      ["tex.pool", new Uint8Array([1])],
      ["scieng.fmt", new Uint8Array([2, 3])],
      ["a.tex", new Uint8Array([4])],
    ]);
    const empty = mkdtempSync(path.join(tmpdir(), "scieng-no-cache-"));
    const core = await loadCore(testSettings({ allowNetwork: "none", cacheDir: empty, texCore }));
    expect(core.format.bytes).toEqual(new Uint8Array([2, 3]));
    expect(core.tree.get("a.tex")).toEqual(new Uint8Array([4]));
    expect(core.tree.has("scieng.fmt")).toBe(false);
  });
});
