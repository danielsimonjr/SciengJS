/**
 * The gallery on real corpus fixtures that need no browser and no TeX bundles. The two fixtures are rendered by
 * the public render, the page is written to a temporary folder, and the command line is run.
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { galleryPage, listFixtures, renderFixture, type GalleryResult } from "../support/gallery.ts";

const CORPUS = fileURLToPath(new URL("../corpus", import.meta.url));
const CLI = fileURLToPath(new URL("../corpus/gallery.ts", import.meta.url));

describe("gallery on real fixtures without a browser or TeX", () => {
  test("renders two svg fixtures and writes a page that embeds both", async () => {
    const wanted = listFixtures(CORPUS).filter(
      (e) => e.format === "svg" && ((e.type === "dot" && e.file === "basic.dot") || (e.type === "plot" && e.file === "line.json")),
    );
    expect(wanted.map((e) => e.file).sort()).toEqual(["basic.dot", "line.json"]);
    const results: GalleryResult[] = [];
    for (const entry of wanted) results.push(await renderFixture(entry, {}));
    expect(results.map((r) => r.status)).toEqual(["rendered", "rendered"]);
    const page = galleryPage(results, { engine: "1.0.8", browser: false, tex: false });
    const folder = mkdtempSync(join(tmpdir(), "gallery-int-"));
    try {
      const out = join(folder, "gallery.html");
      await Bun.write(out, page);
      const written = readFileSync(out, "utf8");
      expect(written).toContain("<h3>basic.dot</h3>");
      expect(written).toContain("<h3>line.json</h3>");
      expect(written.split("data:image/svg+xml;base64,").length - 1).toBe(2);
      expect(written).not.toContain('class="error"');
      expect(written).toContain("<p>2 fixtures, 2 rendered, 0 rejected, 0 skipped.");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test("the command line exits 2 without --out", () => {
    const run = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("usage:");
  });

  test("the command line writes gallery.html for one type and exits 0", () => {
    const folder = mkdtempSync(join(tmpdir(), "gallery-cli-"));
    try {
      const run = spawnSync(process.execPath, [CLI, "--out", folder, "--type", "plot"], { encoding: "utf8" });
      expect(run.status).toBe(0);
      const plots = listFixtures(CORPUS).filter((e) => e.type === "plot").length;
      expect(plots).toBeGreaterThan(0);
      expect(run.stdout).toContain(`total: ${plots} fixtures`);
      expect(existsSync(join(folder, "gallery.html"))).toBe(true);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test("the command line exits 2 when the value of --out is an option", () => {
    const folder = mkdtempSync(join(tmpdir(), "gallery-flag-"));
    try {
      const run = spawnSync(process.execPath, [CLI, "--out", "--type", "plot"], { cwd: folder, encoding: "utf8" });
      expect(run.status).toBe(2);
      expect(run.stderr).toContain("--out needs a folder");
      expect(readdirSync(folder)).toEqual([]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test("the command line uses one TeX cache folder for the run and removes it at exit", () => {
    const folder = mkdtempSync(join(tmpdir(), "gallery-cache-"));
    const temp = join(folder, "temp");
    const bundles = join(folder, "bundles");
    mkdirSync(temp);
    mkdirSync(bundles);
    try {
      const tikz = listFixtures(CORPUS).filter((e) => e.type === "tikz").length;
      expect(tikz).toBeGreaterThan(1);
      const run = spawnSync(process.execPath, [CLI, "--out", join(folder, "page"), "--type", "tikz"], {
        encoding: "utf8",
        env: { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp, SCIENG_TEX_BUNDLE_DIR: bundles },
      });
      expect(run.status).toBe(0);
      expect(run.stdout).toContain(`total: ${tikz} fixtures`);
      expect(readdirSync(temp)).toEqual([]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
