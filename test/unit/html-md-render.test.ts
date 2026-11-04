import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { capabilities, render, type SciengConfig } from "../../src/index.ts";
import { convertPage } from "../../src/html/md.ts";
import type { FetchImage } from "../../src/html/images.ts";

const decoder = new TextDecoder();
const browserPath = process.env.SCIENG_BROWSER ?? "";
const haveBrowser = browserPath !== "" && existsSync(browserPath);
if (!haveBrowser) {
  console.log(`html browser tests skipped: SCIENG_BROWSER is ${browserPath === "" ? "not set" : `not an existing file (${browserPath})`}`);
}

/** One html to md render through the public render function. */
async function md(source: string, options?: Record<string, unknown>, config?: Partial<SciengConfig>) {
  const out = await render({ type: "html", format: "md", source, options }, config);
  return { text: decoder.decode(out.bytes), mime: out.mime, backend: out.backend, warnings: out.warnings, assets: out.assets ?? [] };
}

const PNG_BYTES = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_B64 = Buffer.from(PNG_BYTES).toString("base64");
const REMOTE = "https://img.sciengjs.invalid/a.jpg";
const SCRIPT_PAGE = '<body><div id="d"></div><script>document.getElementById("d").textContent = "SCRIPT-BUILT";</script></body>';

describe("html to md through render()", () => {
  test("the markdown comes back with the text markdown mime", async () => {
    const out = await md("<h2>Title</h2><p>Body</p>");
    expect(out.text).toBe("## Title\n\nBody\n");
    expect(out.mime).toBe("text/markdown; charset=utf-8");
    expect(out.backend).toBe("html/md");
    expect(out.assets).toEqual([]);
  });

  test("capabilities lists html to md as ready in the html stage", async () => {
    const cap = (await capabilities()).find((c) => c.type === "html" && c.format === "md");
    expect(cap).toMatchObject({ stage: "html", ready: true });
  });

  test("an unknown option rejects with E_INPUT", async () => {
    await expect(md("<p>x</p>", { nope: 1 })).rejects.toMatchObject({ code: "E_INPUT" });
  });

  test("a data: image becomes image-1.png with no network", async () => {
    const out = await md(`<p><img alt="dot" src="data:image/png;base64,${PNG_B64}"></p>`, { downloadImages: true }, { allowNetwork: "none" });
    expect(out.text).toBe("![dot](image-1.png)\n");
    expect(out.assets.map((a) => a.name)).toEqual(["image-1.png"]);
    expect(out.assets[0]?.mime).toBe("image/png");
    expect(Array.from(out.assets[0]?.bytes ?? [])).toEqual(Array.from(PNG_BYTES));
    expect(out.warnings).toEqual([]);
  });

  test("a remote image is kept with a warning when the network rule denies it", async () => {
    const out = await md(`<p><img alt="x" src="${REMOTE}"></p>`, { downloadImages: true }, { allowNetwork: "tex-bundles" });
    expect(out.text).toBe(`![x](${REMOTE})\n`);
    expect(out.assets).toEqual([]);
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toContain(REMOTE);
  });

  test("a remote image is not downloaded without downloadImages", async () => {
    const out = await md(`<p><img alt="x" src="${REMOTE}"></p>`, undefined, { allowNetwork: "tex-bundles,images" });
    expect(out.text).toBe(`![x](${REMOTE})\n`);
    expect(out.warnings).toEqual([]);
  });

  test("without browser: true the script-built content is absent", async () => {
    const out = await md(SCRIPT_PAGE);
    expect(out.text).not.toContain("SCRIPT-BUILT");
  });

  test("browser: true without a browser executable rejects with E_STAGE_MISSING", async () => {
    if (process.env.SCIENG_BROWSER) return;
    await expect(md(SCRIPT_PAGE, { browser: true })).rejects.toMatchObject({ code: "E_STAGE_MISSING" });
  });

  (haveBrowser ? test : test.skip)("browser: true converts the script-built page to the script content", async () => {
    const out = await md(SCRIPT_PAGE, { browser: true }, { browser: browserPath });
    expect(out.text).toContain("SCRIPT-BUILT");
  });
});

describe("convertPage image download rules", () => {
  const ok = (mime: string): FetchImage => async () => ({ bytes: Uint8Array.from([1, 2, 3]), mime });

  test("an allowed remote image is fetched and saved as image-1 with its extension", async () => {
    const fetched: string[] = [];
    const fetchImage: FetchImage = async (url) => {
      fetched.push(url);
      return { bytes: Uint8Array.from([255, 216]), mime: "image/jpeg" };
    };
    const out = await convertPage(`<p><img alt="" src="${REMOTE}"></p>`, { downloadImages: true, allowNetwork: "tex-bundles,images", fetchImage });
    expect(fetched).toEqual([REMOTE]);
    expect(out.markdown).toBe("![](image-1.jpg)\n");
    expect(out.assets.map((a) => a.name)).toEqual(["image-1.jpg"]);
    expect(out.warnings).toEqual([]);
  });

  test("a denied remote image is never fetched", async () => {
    const fetched: string[] = [];
    const fetchImage: FetchImage = async (url) => {
      fetched.push(url);
      return { bytes: new Uint8Array(0), mime: "image/png" };
    };
    const out = await convertPage(`<img src="${REMOTE}">`, { downloadImages: true, allowNetwork: "tex-bundles", fetchImage });
    expect(fetched).toEqual([]);
    expect(out.markdown).toBe(`![](${REMOTE})\n`);
    expect(out.warnings).toHaveLength(1);
  });

  test("a failed download keeps the URL and warns", async () => {
    const fetchImage: FetchImage = async () => {
      throw new Error("offline");
    };
    const out = await convertPage(`<img src="${REMOTE}">`, { downloadImages: true, allowNetwork: "tex-bundles,images", fetchImage });
    expect(out.markdown).toBe(`![](${REMOTE})\n`);
    expect(out.warnings).toHaveLength(1);
  });

  test("a downloaded image of an unknown media type is named .bin", async () => {
    const out = await convertPage(`<img src="${REMOTE}">`, { downloadImages: true, allowNetwork: "tex-bundles,images", fetchImage: ok("application/x-odd") });
    expect(out.assets.map((a) => a.name)).toEqual(["image-1.bin"]);
  });
});
