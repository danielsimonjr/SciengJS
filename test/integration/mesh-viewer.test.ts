import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../../src/index.ts";
import { renderHtmlPage } from "../../src/browser/render.ts";
import { THREE_MODULES } from "../../src/browser/pinned.ts";
import { pinnedThree } from "../../src/mesh/pinned-three.ts";
import { readCad, writeGlb } from "../../src/mesh/index.ts";
import { viewerPageHtml } from "../../src/mesh/viewer.ts";
import { checkPage } from "../support/page-checker.ts";
import { decodePng } from "../support/png-decode.ts";
import { readGlb } from "../support/glb-reader.ts";

const browserPath = process.env.SCIENG_BROWSER ?? "";
const haveBrowser = browserPath !== "" && existsSync(browserPath);
const ASSETS = new URL("../../assets/", import.meta.url).href;
const CORPUS = fileURLToPath(new URL("../corpus/mesh/", import.meta.url));
const STEP = new Uint8Array(readFileSync(CORPUS + "red_cube_blue_cylinder.step"));
const BREP = new Uint8Array(readFileSync(CORPUS + "cylinder1.brep"));

// CI must name a browser and must never skip these tests. Locally a missing browser skips them with a reason.
if (process.env.CI && !haveBrowser) {
  throw new Error(`SCIENG_BROWSER must name an existing browser in CI, got "${browserPath}"`);
}
if (!haveBrowser) {
  console.log(`mesh viewer browser tests skipped: SCIENG_BROWSER is ${browserPath === "" ? "not set" : `not an existing file (${browserPath})`}`);
}

/** The count of pixels that differ from the first pixel, which is the page background. */
function foregroundPixels(rgba: Uint8Array): number {
  let n = 0;
  for (let i = 4; i < rgba.length; i += 4) {
    if (Math.abs(rgba[i]! - rgba[0]!) + Math.abs(rgba[i + 1]! - rgba[1]!) + Math.abs(rgba[i + 2]! - rgba[2]!) > 12) n += 1;
  }
  return n;
}

/** The count of distinct colours of the image, at four bits per channel. */
function distinctColours(rgba: Uint8Array): number {
  const seen = new Set<number>();
  for (let i = 0; i < rgba.length; i += 4) seen.add(((rgba[i]! >> 4) << 8) | ((rgba[i + 1]! >> 4) << 4) | (rgba[i + 2]! >> 4));
  return seen.size;
}

/** Draws the viewer page of the STEP sample after a script ran inside the module, where render and the viewer API are in scope. */
async function drawWith(action: string): Promise<{ rgba: Uint8Array; blocked: string[] }> {
  const glb = writeGlb(await readCad("step", STEP, "millimeter"));
  const html = viewerPageHtml(glb, { controls: false }).replace(
    'window.__sciengDone = { ok: true, svg: "" };',
    `${action}; render(); window.__sciengDone = { ok: true, svg: "" };`,
  );
  const out = await renderHtmlPage({
    html,
    format: "png",
    width: 400,
    height: 300,
    scale: 1,
    browser: browserPath,
    timeoutMs: 60000,
    pinned: pinnedThree(ASSETS),
    awaitReady: true,
  });
  return { rgba: decodePng(out.bytes).rgba, blocked: out.blocked };
}

describe.skipIf(!haveBrowser)("mesh viewer in the browser", () => {
  for (const [type, source] of [["step", STEP], ["brep", BREP]] as const) {
    test(`${type} renders to a png that is valid and not one flat colour`, async () => {
      const result = await render({ type, source, format: "png", options: { width: 320, height: 240 } }, { browser: browserPath });
      expect(result.mime).toBe("image/png");
      expect(result.warnings).toEqual([]);
      const png = decodePng(result.bytes);
      expect([png.width, png.height]).toEqual([320, 240]);
      expect(distinctColours(png.rgba)).toBeGreaterThan(3);
      expect(foregroundPixels(png.rgba)).toBeGreaterThan(500);
    }, 90000);
  }

  test("the png of the step sample shows the red cube and the blue cylinder", async () => {
    const result = await render({ type: "step", source: STEP, format: "png", options: {} }, { browser: browserPath });
    const { rgba } = decodePng(result.bytes);
    let red = 0;
    let blue = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const [r, g, b] = [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!];
      if (r > g + 60 && r > b + 60) red += 1;
      if (b > r + 40 && b > g + 20) blue += 1;
    }
    expect(red).toBeGreaterThan(500);
    expect(blue).toBeGreaterThan(500);
  }, 90000);

  test("the render requests no address except the pinned modules", async () => {
    const out = await drawWith("");
    expect(out.blocked).toEqual([]);
  }, 90000);

  test("a section plane removes part of the model", async () => {
    const whole = await drawWith("");
    const cut = await drawWith("window.__sciengViewer.setSection(0, true, 0.3)");
    expect(foregroundPixels(cut.rgba)).toBeLessThan(foregroundPixels(whole.rgba) * 0.9);
    expect(foregroundPixels(cut.rgba)).toBeGreaterThan(100);
  }, 90000);

  test("the exploded view moves the parts apart", async () => {
    const whole = await drawWith("");
    const exploded = await drawWith("window.__sciengViewer.setExplode(1)");
    let differing = 0;
    for (let i = 0; i < whole.rgba.length; i += 4) {
      if (whole.rgba[i] !== exploded.rgba[i] || whole.rgba[i + 2] !== exploded.rgba[i + 2]) differing += 1;
    }
    expect(differing).toBeGreaterThan(500);
  }, 90000);

  test("the html page passes the page checker with the pinned modules fulfilled and the panel in place", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sciengjs-viewer-"));
    try {
      const result = await render({ type: "step", source: STEP, format: "html", options: {} }, {});
      const htmlPath = join(dir, "viewer.html");
      writeFileSync(htmlPath, result.bytes);
      const check = await checkPage({ browserPath, htmlPath, pinned: pinnedThree(ASSETS), drawingSelectors: ["#sciengjs-controls"], settleMs: 1500 });
      expect(check.problems).toEqual([]);
      expect(THREE_MODULES.length).toBe(pinnedThree(ASSETS).size);
      const text = new TextDecoder().decode(result.bytes);
      const glb = new Uint8Array(Buffer.from(/const GLB_BASE64 = "([^"]+)"/.exec(text)![1]!, "base64"));
      expect(readGlb(glb).primitives.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});
