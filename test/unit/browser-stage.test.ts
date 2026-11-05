import { expect, test } from "bun:test";
import { capabilitiesWithRegistry } from "../../src/core.ts";
import { DEFAULT_REGISTRY } from "../../src/registry.ts";
import { render as renderPngBackend } from "../../src/browser/backend-png.ts";
import { render as renderPdfBackend } from "../../src/browser/backend-pdf.ts";
import type { WorkerJob } from "../../src/worker/protocol.ts";
import { ISOLATED_CONFIG_DEPS, renderIsolated } from "../support/test-registry.ts";
import { testSettings } from "../support/settings.ts";

function job(options: Record<string, unknown>, browser?: string): WorkerJob["request"] {
  return {
    type: "html",
    format: "png",
    source: "<p>x</p>",
    options,
    settings: testSettings({ assetsUrl: "file:///unused/", browser }),
  };
}

test("html to png and html to pdf are in the registry", () => {
  expect(DEFAULT_REGISTRY["html:png"]?.backend).toBe("browser/chromium");
  expect(DEFAULT_REGISTRY["html:pdf"]?.backend).toBe("browser/chromium");
});

test("html to png and html to pdf reject with E_STAGE_MISSING when no browser path is configured", async () => {
  await expect(renderIsolated({ type: "html", format: "png", source: "<p>x</p>" })).rejects.toMatchObject({
    code: "E_STAGE_MISSING",
  });
  await expect(renderIsolated({ type: "html", format: "pdf", source: "<p>x</p>" })).rejects.toMatchObject({
    code: "E_STAGE_MISSING",
  });
});

test("capabilities reports html to png and html to pdf as not ready without a browser", async () => {
  const caps = await capabilitiesWithRegistry({}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
  for (const format of ["png", "pdf"] as const) {
    const cap = caps.find((c) => c.type === "html" && c.format === format);
    expect(cap?.ready).toBe(false);
    expect(cap?.reason).toContain("SCIENG_BROWSER");
  }
});

test("a browser path that does not exist rejects with E_STAGE_MISSING and names the path", async () => {
  let error: unknown;
  try {
    await renderPngBackend(job({}, "C:/no-such-dir/no-such-chrome.exe"));
  } catch (err) {
    error = err;
  }
  expect(error).toMatchObject({ code: "E_STAGE_MISSING" });
  expect((error as Error).message).toContain("no-such-chrome.exe");
});

test("the png and pdf backends reject an unknown or invalid option with E_INPUT before they start a browser", async () => {
  await expect(renderPngBackend(job({ bogus: 1 }, "C:/x/chrome.exe"))).rejects.toMatchObject({ code: "E_INPUT" });
  await expect(renderPngBackend(job({ scale: -1 }, "C:/x/chrome.exe"))).rejects.toMatchObject({ code: "E_INPUT" });
  await expect(renderPdfBackend({ ...job({ width: 0 }, "C:/x/chrome.exe"), format: "pdf" })).rejects.toMatchObject({
    code: "E_INPUT",
  });
});

test("the png backend rejects with E_STAGE_MISSING when the browser path is unset", async () => {
  await expect(renderPngBackend(job({}))).rejects.toMatchObject({ code: "E_STAGE_MISSING" });
});
