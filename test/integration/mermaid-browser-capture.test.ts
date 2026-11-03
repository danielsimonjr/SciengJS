import { describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { render } from "../../src/index.ts";
import { mermaidPageHtml } from "../../src/browser/page.ts";
import { MERMAID_CDN_URL } from "../../src/browser/pinned.ts";
import { renderHtmlPage } from "../../src/browser/render.ts";
import { pinnedMermaid } from "../../src/mermaid/browser.ts";

const browserPath = process.env.SCIENG_BROWSER ?? "";
const haveBrowser = browserPath !== "" && existsSync(browserPath);

// CI must name a browser and must never skip these tests. Locally a missing browser skips them with a reason.
if (process.env.CI && !haveBrowser) {
  throw new Error(`SCIENG_BROWSER must name an existing browser in CI, got "${browserPath}"`);
}
if (!haveBrowser) {
  console.log(`mermaid capture tests skipped: SCIENG_BROWSER is ${browserPath === "" ? "not set" : `not an existing file (${browserPath})`}`);
}

const WIDE_GANTT = [
  "gantt",
  "dateFormat YYYY-MM-DD",
  "title A long plan",
  "section Work",
  "Design :a1, 2026-01-01, 90d",
  "Build :after a1, 120d",
  "Test :after a1, 200d",
].join("\n");
const INJECTION = ["flowchart LR", 'A["</script><script>window.x=1</script>"] --> B'].join("\n");

/** A folder under a temporary root that holds the pinned Mermaid file, as the build copies it. */
function assetsWithMermaid(): string {
  const folder = join(mkdtempSync(join(tmpdir(), "sciengjs-capture-assets-")), "assets");
  mkdirSync(folder, { recursive: true });
  copyFileSync(createRequire(import.meta.url).resolve("mermaid/dist/mermaid.min.js"), join(folder, "mermaid.min.js"));
  return pathToFileURL(folder).href + "/";
}

const pngWidth = (bytes: Uint8Array): number => new DataView(bytes.buffer, bytes.byteOffset).getUint32(16);
const viewBoxWidth = (svg: string): number => Number(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) /.exec(svg)?.[1]);
const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe.skipIf(!haveBrowser)("the capture of a Mermaid diagram in the browser stage", () => {
  const assetsUrl = assetsWithMermaid();
  const settings = { browser: browserPath, assetsUrl };

  test("the svg of a browser type has an explicit width and height from its viewBox", async () => {
    const svg = text((await render({ type: "mermaid", source: WIDE_GANTT, format: "svg" }, settings)).bytes);
    const width = Math.ceil(viewBoxWidth(svg));
    expect(width).toBeGreaterThan(300);
    expect(svg).toMatch(new RegExp(`<svg[^>]* width="${width}"`));
    expect(svg).toMatch(/<svg[^>]* height="\d+"/);
  }, 120000);

  test("a wide gantt png is as wide as its viewBox times the scale", async () => {
    const width = Math.ceil(viewBoxWidth(text((await render({ type: "mermaid", source: WIDE_GANTT, format: "svg" }, settings)).bytes)));
    const one = await render({ type: "mermaid", source: WIDE_GANTT, format: "png" }, settings);
    expect(pngWidth(one.bytes)).toBe(width);
    const two = await render({ type: "mermaid", source: WIDE_GANTT, format: "png", options: { scale: 2 } }, settings);
    expect(pngWidth(two.bytes)).toBe(width * 2);
  }, 180000);

  test("a png option other than scale and lenient rejects with E_INPUT that names the option", async () => {
    await expect(render({ type: "mermaid", source: WIDE_GANTT, format: "png", options: { width: 800 } }, settings)).rejects.toMatchObject({
      code: "E_INPUT",
      message: "mermaid takes no option width",
    });
  });

  test("a png scale that is not a positive number rejects with E_INPUT", async () => {
    await expect(render({ type: "mermaid", source: WIDE_GANTT, format: "png", options: { scale: 0 } }, settings)).rejects.toMatchObject({
      code: "E_INPUT",
    });
  });

  test("a node label that closes the script element renders as text and holds no script", async () => {
    const out = await render({ type: "mermaid", source: INJECTION + "\n%% <!-- a comment opener", format: "svg" }, settings);
    expect(text(out.bytes)).not.toContain("<script");
    expect(out.warnings).toEqual([]);
  }, 120000);

  test("the injection source does not run its script in the page", async () => {
    const html = mermaidPageHtml(INJECTION, MERMAID_CDN_URL).replace(
      "window.__sciengDone = { ok: true, svg: out };",
      "window.__sciengDone = { ok: true, svg: String(window.x) };",
    );
    expect(html).toContain("String(window.x)");
    const out = await renderHtmlPage({ html, format: "svg", awaitDone: true, browser: browserPath, timeoutMs: 60000, pinned: pinnedMermaid(assetsUrl) });
    expect(text(out.bytes)).toBe("undefined");
  }, 120000);

  test("a URL other than the pinned one is refused while a pinned map is present", async () => {
    const other = MERMAID_CDN_URL.replace("11.17.2", "11.0.0");
    const html =
      `<!DOCTYPE html><html><body><script src="${other}"></script>` +
      "<script>window.__sciengDone = { ok: true, svg: typeof mermaid };</script></body></html>";
    const out = await renderHtmlPage({ html, format: "svg", awaitDone: true, browser: browserPath, timeoutMs: 60000, pinned: pinnedMermaid(assetsUrl) });
    expect(text(out.bytes)).toBe("undefined");
    expect(out.blocked).toEqual([other]);
  }, 120000);

  test("a page whose pinned build is refused rejects with E_INTERNAL, not E_INPUT", async () => {
    await expect(
      renderHtmlPage({ html: mermaidPageHtml("flowchart LR\nA --> B", MERMAID_CDN_URL), format: "svg", awaitDone: true, browser: browserPath, timeoutMs: 60000 }),
    ).rejects.toMatchObject({ code: "E_INTERNAL" });
  }, 120000);
});
