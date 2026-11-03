import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { render } from "../../src/index.ts";
import { renderHtmlPage } from "../../src/browser/render.ts";
import { PROFILE_PREFIX } from "../../src/browser/profile.ts";

const browserPath = process.env.SCIENG_BROWSER ?? "";
const haveBrowser = browserPath !== "" && existsSync(browserPath);

// CI must name a browser and must never skip these tests. Locally a missing browser skips them with a reason.
if (process.env.CI && !haveBrowser) {
  throw new Error(`SCIENG_BROWSER must name an existing browser in CI, got "${browserPath}"`);
}
if (!haveBrowser) {
  console.log(`browser render tests skipped: SCIENG_BROWSER is ${browserPath === "" ? "not set" : `not an existing file (${browserPath})`}`);
}

// A page that asks for one image and one script on an address that no route reaches.
const NETWORK_PAGE = `<!DOCTYPE html><html><body><p id="drawing">x</p>
<img src="http://t4.sciengjs.invalid/image.png">
<script src="http://t4.sciengjs.invalid/script.js"></script></body></html>`;

// A page that fills a canvas of 2000 by 1500 CSS pixels with noise, so that the screenshot is large.
const BIG_PAGE = `<!DOCTYPE html><html><body style="margin:0"><canvas id="c" width="2000" height="1500"></canvas>
<script>
const c = document.getElementById("c").getContext("2d");
const img = c.createImageData(2000, 1500);
let s = 2463534242;
for (let i = 0; i < img.data.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; img.data[i] = s & 255; }
c.putImageData(img, 0, 0);
</script></body></html>`;

/** Reads the width and height that the IHDR chunk of a PNG holds. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function profilesLeft(): string[] {
  return readdirSync(tmpdir()).filter((name) => name.startsWith(PROFILE_PREFIX));
}

describe.skipIf(!haveBrowser)("browser stage", () => {
  test("renders a page to png at the requested device pixels", async () => {
    const result = await render(
      { type: "html", format: "png", source: NETWORK_PAGE, options: { width: 400, height: 300, scale: 1 } },
      { browser: browserPath },
    );
    expect(result.mime).toBe("image/png");
    expect(pngSize(result.bytes)).toEqual({ width: 400, height: 300 });
  }, 60000);

  test("a 4000 by 3000 device pixel screenshot arrives whole", async () => {
    const result = await render(
      { type: "html", format: "png", source: BIG_PAGE, options: { width: 2000, height: 1500, scale: 2 } },
      { browser: browserPath },
    );
    expect(pngSize(result.bytes)).toEqual({ width: 4000, height: 3000 });
    // A complete PNG ends with the IEND chunk: a 4-byte length (zero), the type, then a 4-byte CRC.
    const end = result.bytes.length;
    expect(Buffer.from(result.bytes.subarray(end - 8, end - 4)).toString("latin1")).toBe("IEND");
  }, 120000);

  test("renders a page to pdf", async () => {
    const result = await render(
      { type: "html", format: "pdf", source: NETWORK_PAGE },
      { browser: browserPath },
    );
    expect(result.mime).toBe("application/pdf");
    expect(Buffer.from(result.bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  }, 60000);

  test("refuses the two requests of the network page and still draws it", async () => {
    const result = await renderHtmlPage({ html: NETWORK_PAGE, width: 400, height: 300, scale: 1, format: "png", browser: browserPath, timeoutMs: 60000 });
    expect(result.blocked.length).toBe(2);
    expect(result.blocked.every((url) => url.includes("t4.sciengjs.invalid"))).toBe(true);
    expect(pngSize(result.bytes)).toEqual({ width: 400, height: 300 });
  }, 60000);

  test("leaves no profile folder behind", async () => {
    const before = profilesLeft();
    await render({ type: "html", format: "png", source: NETWORK_PAGE, options: { width: 200, height: 100 } }, { browser: browserPath });
    expect(profilesLeft()).toEqual(before);
  }, 60000);
});
