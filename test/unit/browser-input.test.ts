import { expect, test } from "bun:test";
import {
  blockedWarnings,
  browserPathOf,
  DEFAULT_HEIGHT,
  DEFAULT_SCALE,
  DEFAULT_WIDTH,
  htmlSource,
  MAX_BLOCKED_WARNINGS,
  MAX_DEVICE_PIXELS,
  MAX_SCALE,
  MAX_SIDE,
  MAX_WARNING_URL_CHARS,
  parsePdfOptions,
  parsePngOptions,
} from "../../src/browser/input.ts";

const inputError = { code: "E_INPUT" };

test("the png options default to 800 by 600 at scale 1", () => {
  expect(parsePngOptions({})).toEqual({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, scale: DEFAULT_SCALE });
  expect([DEFAULT_WIDTH, DEFAULT_HEIGHT, DEFAULT_SCALE]).toEqual([800, 600, 1]);
});

test("the png options keep valid values", () => {
  expect(parsePngOptions({ width: 1, height: 2, scale: 0.5 })).toEqual({ width: 1, height: 2, scale: 0.5 });
});

test("the png options reject an unknown key, a bad width, height or scale", () => {
  expect(() => parsePngOptions({ bogus: 1 })).toThrow(expect.objectContaining(inputError));
  for (const width of [0, -1, 1.5, "10", Number.NaN]) {
    expect(() => parsePngOptions({ width })).toThrow(expect.objectContaining(inputError));
    expect(() => parsePngOptions({ height: width })).toThrow(expect.objectContaining(inputError));
  }
  for (const scale of [0, -1, Number.POSITIVE_INFINITY, Number.NaN, "2"]) {
    expect(() => parsePngOptions({ scale })).toThrow(expect.objectContaining(inputError));
  }
});

test("the png options accept each limit and reject one step past it", () => {
  expect(MAX_SIDE).toBe(16384);
  expect(MAX_SCALE).toBe(8);
  expect(parsePngOptions({ width: MAX_SIDE, height: 1 }).width).toBe(MAX_SIDE);
  expect(parsePngOptions({ height: MAX_SIDE, width: 1 }).height).toBe(MAX_SIDE);
  expect(parsePngOptions({ scale: MAX_SCALE, width: 1, height: 1 }).scale).toBe(MAX_SCALE);
  expect(() => parsePngOptions({ width: MAX_SIDE + 1, height: 1 })).toThrow(expect.objectContaining(inputError));
  expect(() => parsePngOptions({ height: MAX_SIDE + 1, width: 1 })).toThrow(expect.objectContaining(inputError));
  expect(() => parsePngOptions({ scale: MAX_SCALE + 0.01, width: 1, height: 1 })).toThrow(
    expect.objectContaining(inputError),
  );
});

test("the png options reject a device pixel count over the budget and accept the budget", () => {
  expect(MAX_DEVICE_PIXELS).toBe(64 * 1024 * 1024);
  // 8192 x 8192 at scale 1 is exactly the budget.
  expect(parsePngOptions({ width: 8192, height: 8192, scale: 1 }).width).toBe(8192);
  // One more CSS row is over the budget.
  expect(() => parsePngOptions({ width: 8192, height: 8193, scale: 1 })).toThrow(expect.objectContaining(inputError));
  // The scale counts in both directions: 4096 x 4096 at scale 2 is the budget, at 2.01 it is over.
  expect(parsePngOptions({ width: 4096, height: 4096, scale: 2 }).scale).toBe(2);
  expect(() => parsePngOptions({ width: 4096, height: 4096, scale: 2.01 })).toThrow(expect.objectContaining(inputError));
});

test("the pdf options take no key", () => {
  expect(() => parsePdfOptions({})).not.toThrow();
  expect(() => parsePdfOptions({ width: 1 })).toThrow(expect.objectContaining(inputError));
});

test("the html source is text; bytes reject with E_INPUT", () => {
  expect(htmlSource("<p>x</p>")).toBe("<p>x</p>");
  expect(() => htmlSource(new Uint8Array([1]))).toThrow(expect.objectContaining(inputError));
});

test("a missing or empty browser path rejects with E_STAGE_MISSING", () => {
  expect(browserPathOf("C:/chrome.exe")).toBe("C:/chrome.exe");
  for (const value of [undefined, ""]) {
    expect(() => browserPathOf(value)).toThrow(expect.objectContaining({ code: "E_STAGE_MISSING" }));
  }
});

test("a blocked warning names the URL", () => {
  expect(blockedWarnings(["http://a.invalid/x"])).toEqual([
    "the page requested http://a.invalid/x; the browser stage refused the request",
  ]);
  expect(blockedWarnings([])).toEqual([]);
});

test("the blocked warnings stop at the cap and count the rest", () => {
  expect(MAX_BLOCKED_WARNINGS).toBe(50);
  const urls = Array.from({ length: MAX_BLOCKED_WARNINGS + 7 }, (_, i) => `http://a.invalid/${i}`);
  const out = blockedWarnings(urls);
  expect(out.length).toBe(MAX_BLOCKED_WARNINGS + 1);
  expect(out[MAX_BLOCKED_WARNINGS - 1]).toContain(`/${MAX_BLOCKED_WARNINGS - 1};`);
  expect(out[MAX_BLOCKED_WARNINGS]).toBe("the browser stage refused 7 more requests");
  expect(blockedWarnings(urls.slice(0, MAX_BLOCKED_WARNINGS)).length).toBe(MAX_BLOCKED_WARNINGS);
});

test("a blocked warning cuts a long URL and escapes control characters", () => {
  expect(MAX_WARNING_URL_CHARS).toBe(200);
  const long = `http://a.invalid/${"x".repeat(500)}`;
  const [cut] = blockedWarnings([long]);
  expect(cut).toBe(`the page requested ${long.slice(0, MAX_WARNING_URL_CHARS)}...; the browser stage refused the request`);
  const exact = long.slice(0, MAX_WARNING_URL_CHARS);
  expect(blockedWarnings([exact])[0]).toBe(`the page requested ${exact}; the browser stage refused the request`);
  const [escaped] = blockedWarnings(["http://a.invalid/\n\r\t\u001b\u007f\u2028"]);
  expect(escaped).toBe(
    "the page requested http://a.invalid/\\u000a\\u000d\\u0009\\u001b\\u007f\\u2028; the browser stage refused the request",
  );
});
