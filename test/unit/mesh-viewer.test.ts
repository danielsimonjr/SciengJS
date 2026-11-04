import { describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderWithRegistry } from "../../src/core.ts";
import { DEFAULT_REGISTRY } from "../../src/registry.ts";
import { THREE_MAIN_URL, THREE_MODULES } from "../../src/browser/pinned.ts";
import { viewerPageHtml } from "../../src/mesh/viewer.ts";
import { pinnedThree } from "../../src/mesh/pinned-three.ts";
import { ISOLATED_CONFIG_DEPS } from "../support/test-registry.ts";
import { readGlb } from "../support/glb-reader.ts";

const CORPUS = fileURLToPath(new URL("../corpus/mesh/", import.meta.url));
const ASSETS = new URL("../../assets/", import.meta.url).href;
const STEP = new Uint8Array(readFileSync(CORPUS + "red_cube_blue_cylinder.step"));
const IGES = new Uint8Array(readFileSync(CORPUS + "cube-10x10mm.igs"));
const BREP = new Uint8Array(readFileSync(CORPUS + "cylinder1.brep"));

const renderHtml = async (type: "step" | "iges" | "brep", source: Uint8Array): Promise<string> => {
  const result = await renderWithRegistry({ type, source, format: "html" }, {}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
  expect(result.mime).toBe("text/html; charset=utf-8");
  return new TextDecoder().decode(result.bytes);
};

/** The glb that the page embeds, decoded from its base64 text. */
function embeddedGlb(html: string): Uint8Array {
  const match = /const GLB_BASE64 = "([A-Za-z0-9+/=]+)";/.exec(html);
  expect(match).not.toBeNull();
  return new Uint8Array(Buffer.from(match![1]!, "base64"));
}

describe("mesh to html", () => {
  test("the registry holds the html and png pairs of step, iges and brep, and each module file exists", () => {
    for (const type of ["step", "iges", "brep"]) {
      for (const format of ["html", "png"]) {
        const entry = DEFAULT_REGISTRY[`${type}:${format}`];
        expect(entry).toBeDefined();
        expect(existsSync(fileURLToPath(entry!.moduleUrl))).toBe(true);
      }
    }
  });

  for (const [type, source] of [["step", STEP], ["iges", IGES], ["brep", BREP]] as const) {
    test(`${type} renders to a viewer page with the pinned modules and an embedded glb`, async () => {
      const html = await renderHtml(type, source);
      expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
      const doc = readGlb(embeddedGlb(html));
      expect(doc.primitives.length).toBeGreaterThan(0);
      for (const m of THREE_MODULES) {
        expect(html).toContain(`<link rel="modulepreload" href="${m.url}" integrity="${m.sri}" crossorigin="anonymous">`);
      }
    });
  }

  test("the import map names the pinned three module and holds one integrity value per pinned module", async () => {
    const html = await renderHtml("brep", BREP);
    const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/.exec(html)![1]!) as {
      imports: Record<string, string>;
      integrity: Record<string, string>;
    };
    expect(map.imports).toEqual({ three: THREE_MAIN_URL });
    expect(Object.keys(map.integrity).sort()).toEqual(THREE_MODULES.map((m) => m.url).sort());
    for (const m of THREE_MODULES) expect(map.integrity[m.url]).toBe(m.sri);
  });

  test("the only URLs in the page are the pinned modules", async () => {
    const html = await renderHtml("step", STEP);
    const urls = new Set(html.match(/https?:\/\/[^"'\s<>)]+/g) ?? []);
    const allowed = new Set(THREE_MODULES.map((m) => m.url));
    expect([...urls].filter((u) => !allowed.has(u))).toEqual([]);
  });

  test("the embedded glb keeps the face colours as materials", async () => {
    const doc = readGlb(embeddedGlb(await renderHtml("step", STEP)));
    const colours = doc.materials.map((m) => m.baseColorFactor.slice(0, 3).map((v) => Math.round(v * 100) / 100).join(","));
    // The red cube and the blue cylinder: one material is red-dominant and one is blue-dominant.
    const parsed = colours.map((c) => c.split(",").map(Number) as [number, number, number]);
    expect(parsed.some(([r, g, b]) => r > g && r > b)).toBe(true);
    expect(parsed.some(([r, g, b]) => b > r && b > g)).toBe(true);
  });

  test("the page has the orbit, section plane and exploded view code, and a title with markup is escaped", () => {
    const html = viewerPageHtml(new Uint8Array([1, 2, 3, 4]), { title: "<b>&" });
    expect(html).toContain("<title>&lt;b&gt;&amp;</title>");
    for (const word of ["OrbitControls", "clippingPlanes", "setExplode", "setSection", "sciengjs-controls"]) {
      expect(html).toContain(word);
    }
  });

  test("the png page hides the panel", () => {
    expect(viewerPageHtml(new Uint8Array(4), { controls: false })).toContain("const SHOW_CONTROLS = false;");
    expect(viewerPageHtml(new Uint8Array(4))).toContain("const SHOW_CONTROLS = true;");
  });

  test("an option that the glb render does not take rejects with E_INPUT", async () => {
    const result = renderWithRegistry({ type: "brep", source: BREP, format: "html", options: { width: 10 } }, {}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
    await expect(result).rejects.toMatchObject({ code: "E_INPUT" });
  });
});

describe("the pinned Three.js files in the assets folder", () => {
  test("pinnedThree returns every pinned URL with the bytes of its file", () => {
    const map = pinnedThree(ASSETS);
    expect([...map.keys()]).toEqual(THREE_MODULES.map((m) => m.url));
  });

  test("a missing file rejects with E_STAGE_MISSING", () => {
    const dir = mkdtempSync(join(tmpdir(), "sciengjs-three-"));
    try {
      expect(() => pinnedThree(pathToFileURL(dir).href)).toThrow(expect.objectContaining({ code: "E_STAGE_MISSING" }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a file with other bytes rejects with E_INTEGRITY", () => {
    const dir = mkdtempSync(join(tmpdir(), "sciengjs-three-"));
    try {
      for (const m of THREE_MODULES) copyFileSync(fileURLToPath(new URL(m.file, ASSETS)), join(dir, m.file));
      writeFileSync(join(dir, THREE_MODULES[1]!.file), "export {};");
      expect(() => pinnedThree(pathToFileURL(dir).href)).toThrow(expect.objectContaining({ code: "E_INTEGRITY" }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
