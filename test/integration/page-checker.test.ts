import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkPage } from "../support/page-checker.ts";

const FIXTURES = fileURLToPath(new URL("../fixtures/pages/", import.meta.url));
const browserPath = process.env.SCIENG_BROWSER ?? "";
const haveBrowser = browserPath !== "" && existsSync(browserPath);

// CI must name a browser and must never skip these tests. Locally a missing browser skips them with a reason.
if (process.env.CI && !haveBrowser) {
  throw new Error(`SCIENG_BROWSER must name an existing browser in CI, got "${browserPath}"`);
}
if (!haveBrowser) {
  console.log(`page checker tests skipped: SCIENG_BROWSER is ${browserPath === "" ? "not set" : `not an existing file (${browserPath})`}`);
}

describe.skipIf(!haveBrowser)("page checker", () => {
  test("passes a good drawing", async () => {
    const result = await checkPage({
      browserPath,
      htmlPath: `${FIXTURES}good.html`,
      drawingSelectors: ["#drawing"],
    });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  }, 60000);

  test("fails a page with a script error", async () => {
    const result = await checkPage({ browserPath, htmlPath: `${FIXTURES}script-error.html` });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("deliberate defect in the drawing script"))).toBe(true);
  }, 60000);

  test("fails a page whose drawing is empty", async () => {
    const result = await checkPage({
      browserPath,
      htmlPath: `${FIXTURES}empty-drawing.html`,
      drawingSelectors: ["#drawing"],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.startsWith("empty drawing: #drawing"))).toBe(true);
  }, 60000);
});

// Runs without a browser: a path that does not exist must reject with a message that names the path.
test("rejects a browser path that does not exist, and names the path", async () => {
  const missing = `${FIXTURES}no-such-browser.exe`;
  let message = "";
  try {
    await checkPage({ browserPath: missing, htmlPath: `${FIXTURES}good.html` });
  } catch (err) {
    message = (err as Error).message;
  }
  expect(message).toContain("no-such-browser.exe");
  expect(message).toContain("browser");
}, 20000);

// Runs without a browser: a file that exists but cannot run must reject with the path in the message.
test("rejects a browser path that exists but cannot start, and names the path", async () => {
  const notABrowser = `${FIXTURES}good.html`;
  let message = "";
  try {
    await checkPage({ browserPath: notABrowser, htmlPath: `${FIXTURES}good.html` });
  } catch (err) {
    message = (err as Error).message;
  }
  expect(message).toContain("cannot start the browser");
  expect(message).toContain("good.html");
}, 20000);

describe.skipIf(!haveBrowser)("page checker on svg drawings", () => {
  test("fails an svg with no drawn child", async () => {
    const result = await checkPage({ browserPath, htmlPath: `${FIXTURES}empty-svg.html`, drawingSelectors: ["#drawing"] });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.startsWith("empty drawing: #drawing"))).toBe(true);
  }, 60000);

  test("fails an svg whose drawn child has a zero box", async () => {
    const result = await checkPage({ browserPath, htmlPath: `${FIXTURES}zero-box-svg.html`, drawingSelectors: ["#drawing"] });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.startsWith("empty drawing: #drawing"))).toBe(true);
  }, 60000);

  test("fails an svg whose only child is an empty foreignObject", async () => {
    const result = await checkPage({ browserPath, htmlPath: `${FIXTURES}empty-foreignobject.html`, drawingSelectors: ["#drawing"] });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.startsWith("empty drawing: #drawing"))).toBe(true);
  }, 60000);
});
