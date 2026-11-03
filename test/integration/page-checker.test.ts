import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkPage, WARM_UP_START_TIMEOUT_MS, warmBrowser } from "../support/page-checker.ts";
import { processesHolding } from "../support/process-list.ts";

const FIXTURES = fileURLToPath(new URL("../fixtures/pages/", import.meta.url));
const browserPath = process.env.SCIENG_BROWSER ?? "";
const haveBrowser = browserPath !== "" && existsSync(browserPath);
// The warm-up check waits up to the warm-up budget for the port and again for the page load. Its teardown takes up to
// 60 s more: 20 s to close, 10 s to stop and 30 s to remove the profile. The last 20 s are spare.
const WARM_UP_TEST_TIMEOUT_MS = 2 * WARM_UP_START_TIMEOUT_MS + 80000;

// CI must name a browser and must never skip these tests. Locally a missing browser skips them with a reason.
if (process.env.CI && !haveBrowser) {
  throw new Error(`SCIENG_BROWSER must name an existing browser in CI, got "${browserPath}"`);
}
if (!haveBrowser) {
  console.log(`page checker tests skipped: SCIENG_BROWSER is ${browserPath === "" ? "not set" : `not an existing file (${browserPath})`}`);
}

describe.skipIf(!haveBrowser)("page checker", () => {
  // The first start of a browser on a fresh runner can take longer than a timed check allows. This check starts the
  // browser once, with its own budget, before the timed checks. It is a normal test: a failed start fails it with the
  // start evidence, and its duration is logged.
  test("the browser starts once before the timed checks", async () => {
    await warmBrowser(
      () => checkPage({ browserPath, htmlPath: `${FIXTURES}good.html`, startTimeoutMs: WARM_UP_START_TIMEOUT_MS }),
      (line) => console.log(line),
    );
  }, WARM_UP_TEST_TIMEOUT_MS);

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

/** The longest wait for the browser helper processes to exit after a check returns. */
const LEAK_WAIT_MS = 5000;
const LEAK_POLL_MS = 250;

describe.skipIf(!haveBrowser)("page checker teardown", () => {
  test("leaves no running process that holds this check's profile folder", async () => {
    let profile = "";
    await checkPage({ browserPath, htmlPath: `${FIXTURES}good.html`, onProfile: (path) => (profile = path) });
    expect(profile).not.toBe("");
    // Renderer and GPU helpers can outlive the parent for a moment, so the listing is polled up to the bound.
    const deadline = Date.now() + LEAK_WAIT_MS;
    let held = processesHolding(profile);
    while (held.length > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, LEAK_POLL_MS));
      held = processesHolding(profile);
    }
    expect(held).toEqual([]);
  }, 60000);
});
