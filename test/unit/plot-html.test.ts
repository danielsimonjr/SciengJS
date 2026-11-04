import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { capabilitiesWithRegistry, renderWithRegistry } from "../../src/core.ts";
import { DEFAULT_REGISTRY } from "../../src/registry.ts";
import { PLOTLY_CDN_URL, PLOTLY_SHA256, PLOTLY_SRI, PLOTLY_VERSION } from "../../src/browser/pinned.ts";
import { ISOLATED_CONFIG_DEPS } from "../support/test-registry.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ROOT = join(import.meta.dir, "..", "..");

function figureWith(label: string): string {
  return JSON.stringify({ data: [{ type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], name: label }], layout: { title: { text: label } } });
}

async function renderHtml(source: string): Promise<string> {
  const result = await renderWithRegistry({ type: "plot", format: "html", source, options: {} }, {}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
  return new TextDecoder().decode(result.bytes);
}

describe("plot to html", () => {
  test("the registry holds plot html and the module file exists", () => {
    const entry = DEFAULT_REGISTRY["plot:html"];
    expect(entry?.backend).toBe("plot/plotly");
    expect(existsSync(fileURLToPath(entry!.moduleUrl))).toBe(true);
  });

  test("capabilities reports plot html as ready", async () => {
    const caps = await capabilitiesWithRegistry({}, DEFAULT_REGISTRY, ISOLATED_CONFIG_DEPS);
    expect(caps.find((c) => c.type === "plot" && c.format === "html")?.ready).toBe(true);
  });

  test("the page names the pinned Plotly URL with its SRI value", async () => {
    const html = await renderHtml(figureWith("a"));
    expect(html).toContain(`src="${PLOTLY_CDN_URL}"`);
    expect(PLOTLY_CDN_URL).toContain(`plotly.js-dist-min@${PLOTLY_VERSION}/`);
    expect(html).toContain(`integrity="${PLOTLY_SRI}"`);
    expect(html).toContain('crossorigin="anonymous"');
    expect(html).toContain("Plotly.newPlot");
  });

  test("the pinned Plotly version is the exact devDependency and the SRI matches the hash", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies["plotly.js-dist-min"]).toBe(PLOTLY_VERSION);
    expect(PLOTLY_SRI).toBe(`sha256-${Buffer.from(PLOTLY_SHA256, "hex").toString("base64")}`);
    const file = join(ROOT, "node_modules", "plotly.js-dist-min", "plotly.min.js");
    expect(createHash("sha256").update(readFileSync(file)).digest("hex")).toBe(PLOTLY_SHA256);
  });

  test("the figure round-trips inside the page", async () => {
    const html = await renderHtml(figureWith("round"));
    const match = /const fig = (\{.*\}); Plotly\.newPlot/.exec(html);
    expect(match).not.toBeNull();
    const fig = JSON.parse(match![1]!);
    expect(fig.data[0].name).toBe("round");
    expect(fig.data[0].x).toEqual([0, 1]);
    expect(fig.layout.title.text).toBe("round");
  });

  test("a closing script tag in a text label cannot break out of the script", async () => {
    const hostile = "</script><script>alert(1)</script>";
    const html = await renderHtml(figureWith(hostile));
    expect(html).not.toContain("</script><script>alert");
    expect(html).toContain("\u003c/script\u003e");
    const match = /const fig = (\{.*\}); Plotly\.newPlot/.exec(html);
    expect(JSON.parse(match![1]!).layout.title.text).toBe(hostile);
  });
});
