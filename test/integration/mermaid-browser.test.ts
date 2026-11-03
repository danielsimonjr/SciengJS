import { describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { render } from "../../src/index.ts";

const browserPath = process.env.SCIENG_BROWSER ?? "";
const haveBrowser = browserPath !== "" && existsSync(browserPath);

// CI must name a browser and must never skip these tests. Locally a missing browser skips them with a reason.
if (process.env.CI && !haveBrowser) {
  throw new Error(`SCIENG_BROWSER must name an existing browser in CI, got "${browserPath}"`);
}
if (!haveBrowser) {
  console.log(`mermaid browser tests skipped: SCIENG_BROWSER is ${browserPath === "" ? "not set" : `not an existing file (${browserPath})`}`);
}

const FLOWCHART = "flowchart LR\nA[Start] --> B{Choose}\nB -->|yes| C[Done]";
const GANTT = "gantt\ndateFormat YYYY-MM-DD\ntitle Plan\nsection Work\nDesign :a1, 2026-01-01, 5d\nBuild :after a1, 4d";

/** A folder under a temporary root that holds the pinned Mermaid file, as the build copies it. */
function assetsWithMermaid(): { root: string; url: string } {
  const root = mkdtempSync(join(tmpdir(), "sciengjs-mermaid-assets-"));
  const folder = join(root, "assets");
  mkdirSync(folder, { recursive: true });
  const source = createRequire(import.meta.url).resolve("mermaid/dist/mermaid.min.js");
  copyFileSync(source, join(folder, "mermaid.min.js"));
  return { root, url: pathToFileURL(folder).href + "/" };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

describe.skipIf(!haveBrowser)("mermaid types other than the native three, through the browser stage", () => {
  const assets = assetsWithMermaid();

  test("a flowchart renders to svg, with no request refused and no warning", async () => {
    const result = await render(
      { type: "mermaid", source: FLOWCHART, format: "svg" },
      { browser: browserPath, assetsUrl: assets.url },
    );
    expect(result.backend).toBe("mermaid/browser/chromium");
    expect(new TextDecoder().decode(result.bytes)).toContain("<svg");
    expect(result.warnings).toEqual([]);
  }, 120000);

  test("a gantt chart renders to png", async () => {
    const result = await render(
      { type: "mermaid", source: GANTT, format: "png" },
      { browser: browserPath, assetsUrl: assets.url },
    );
    expect(result.mime).toBe("image/png");
    expect([...result.bytes.slice(0, 4)]).toEqual(PNG_SIGNATURE);
    expect(result.warnings).toEqual([]);
  }, 120000);

  test("a gantt chart renders to pdf", async () => {
    const result = await render(
      { type: "mermaid", source: GANTT, format: "pdf" },
      { browser: browserPath, assetsUrl: assets.url },
    );
    expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe("%PDF-");
  }, 120000);

  test("a Mermaid syntax error of a browser type rejects with E_INPUT", async () => {
    await expect(
      render({ type: "mermaid", source: "notADiagram\nA --> B", format: "svg" }, { browser: browserPath, assetsUrl: assets.url }),
    ).rejects.toMatchObject({ code: "E_INPUT" });
  }, 120000);

  test("dot to pdf renders through the browser stage", async () => {
    const result = await render(
      { type: "dot", source: "digraph G { a -> b }", format: "pdf" },
      { browser: browserPath },
    );
    expect(result.backend).toBe("graph/viz+browser/chromium");
    expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe("%PDF-");
  }, 120000);

  test("the native class diagram still renders with no browser path", async () => {
    const result = await render({ type: "mermaid", source: "classDiagram\nclass A", format: "svg" }, { browser: undefined });
    expect(result.backend).toBe("mermaid/native");
  });
});
