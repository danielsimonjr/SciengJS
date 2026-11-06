import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { galleryPage, listFixtures, MAX_EMBED_BYTES, SKIP_REASONS, type GalleryEntry, type GalleryResult } from "../support/gallery.ts";

const META = { engine: "1.0.8", browser: false, tex: true };

function entry(over: Partial<GalleryEntry> = {}): GalleryEntry {
  return { type: "dot", file: "a.dot", path: "/corpus/dot/a.dot", format: "svg", ...over };
}

function rendered(over: Partial<GalleryEntry> & { bytes?: Uint8Array; mime?: string; warnings?: string[]; ms?: number } = {}): GalleryResult {
  const { bytes, mime, warnings, ms, ...rest } = over;
  return {
    ...entry(rest),
    status: "rendered",
    mime: mime ?? "image/svg+xml",
    backend: "graph/viz",
    bytes: bytes ?? new TextEncoder().encode("<svg/>"),
    ms: ms ?? 12,
    warnings: warnings ?? [],
  };
}

function rejected(code: string, message: string, over: Partial<GalleryEntry> = {}): GalleryResult {
  return { ...entry(over), status: "rejected", code, message, ms: 3 } as GalleryResult;
}

function skipped(reason: string, over: Partial<GalleryEntry> = {}): GalleryResult {
  return { ...entry(over), status: "skipped", reason } as GalleryResult;
}

const b64 = (text: string) => Buffer.from(text).toString("base64");

describe("listFixtures", () => {
  let root = "";
  function write(rel: string, text = "x") {
    const path = join(root, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
  }

  test("lists each fixture by extension, in the order of the input types and the output pairs", () => {
    root = mkdtempSync(join(tmpdir(), "gallery-list-"));
    try {
      write("dot/b.dot");
      write("dot/a.dot");
      write("dot/a.expected.svg");
      write("dot/notes.txt");
      write("sysml/s.sysml");
      write("sysml/approval.json", JSON.stringify({ entries: [{ source: "s.sysml", options: { view: "ibd", root: "V" }, approved: true }] }));
      write("mesh/c.igs");
      write("mesh/d.step");
      write("mesh/e.brep");
      write("mesh/large.json");
      write("mesh/README.md");
      write("cad/k.json");
      write("html/x.html");
      write("html/x.md");
      const entries = listFixtures(root);
      expect(entries.map((e) => `${e.type}/${e.file}/${e.format}`)).toEqual([
        "dot/a.dot/svg",
        "dot/a.dot/pdf",
        "dot/b.dot/svg",
        "dot/b.dot/pdf",
        "sysml/s.sysml/svg",
        "sysml/s.sysml/pdf",
        "step/d.step/png",
        "step/d.step/glb",
        "step/d.step/dxf",
        "iges/c.igs/png",
        "iges/c.igs/glb",
        "iges/c.igs/dxf",
        "brep/e.brep/png",
        "brep/e.brep/glb",
        "brep/e.brep/dxf",
        "cad/k.json/png",
        "cad/k.json/dxf",
        "cad/k.json/md",
        "cad/k.json/pdf",
        "html/x.html/png",
        "html/x.html/md",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reads the sysml options from approval.json and gives the others none", () => {
    root = mkdtempSync(join(tmpdir(), "gallery-opts-"));
    try {
      write("sysml/s.sysml");
      write("sysml/approval.json", JSON.stringify({ entries: [{ source: "s.sysml", options: { view: "ibd", root: "V" }, approved: true }] }));
      write("dot/a.dot");
      const entries = listFixtures(root);
      expect(entries.find((e) => e.type === "sysml")?.options).toEqual({ view: "ibd", root: "V" });
      expect(entries.find((e) => e.type === "dot")?.options).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns nothing for a folder that does not exist", () => {
    root = mkdtempSync(join(tmpdir(), "gallery-empty-"));
    try {
      expect(listFixtures(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("galleryPage", () => {
  test("escapes the file name", () => {
    const page = galleryPage([rendered({ file: 'a<b>&"c.dot' })], META);
    expect(page).toContain("<h3>a&lt;b&gt;&amp;&quot;c.dot</h3>");
    expect(page).not.toContain("<h3>a<b>");
  });

  test("shows a rejection with its code and its escaped message", () => {
    const page = galleryPage([rejected("E_LIMIT", 'too <big> & "wide"')], META);
    expect(page).toContain('<p class="error">E_LIMIT: too &lt;big&gt; &amp; &quot;wide&quot;</p>');
  });

  test("shows a skip with its reason", () => {
    const page = galleryPage([skipped(SKIP_REASONS.tex)], META);
    expect(page).toContain(`<p class="skipped">${SKIP_REASONS.tex}</p>`);
    expect(page).not.toContain('class="error"');
  });

  test("lists the warnings escaped", () => {
    const page = galleryPage([rendered({ warnings: ["line 2: a < b"] })], META);
    expect(page).toContain("<li>line 2: a &lt; b</li>");
  });

  test("shows the bytes and the time of a render", () => {
    const page = galleryPage([rendered({ bytes: new Uint8Array(7), ms: 12 })], META);
    expect(page).toContain("Bytes: 7");
    expect(page).toContain("Time: 12 ms");
  });

  test("embeds an svg as an image data URI", () => {
    const page = galleryPage([rendered()], META);
    expect(page).toContain(`<img alt="" src="data:image/svg+xml;base64,${b64("<svg/>")}">`);
  });

  test("embeds a png with the png mime type", () => {
    const page = galleryPage([rendered({ format: "png", mime: "image/png", bytes: new Uint8Array([137, 80, 78, 71]) })], META);
    expect(page).toContain('src="data:image/png;base64,iVBORw=="');
  });

  test("embeds an image of exactly the cap", () => {
    const page = galleryPage([rendered({ bytes: new Uint8Array(MAX_EMBED_BYTES) })], META);
    expect(page).toContain("data:image/svg+xml;base64,");
    expect(page).not.toContain("not embedded");
  });

  test("does not embed an image one byte over the cap", () => {
    const page = galleryPage([rendered({ bytes: new Uint8Array(MAX_EMBED_BYTES + 1) })], META);
    expect(page).not.toContain("data:image/svg+xml");
    expect(page).toContain(`not embedded: ${MAX_EMBED_BYTES + 1} bytes`);
  });

  test("shows markdown in an escaped pre block", () => {
    const page = galleryPage([rendered({ format: "md", file: "x.html", mime: "text/markdown", bytes: new TextEncoder().encode("# a <b> & c") })], META);
    expect(page).toContain("<pre># a &lt;b&gt; &amp; c</pre>");
  });

  test("links a glb, a dxf or a pdf as a download", () => {
    const page = galleryPage([rendered({ format: "glb", file: "m.step", mime: "model/gltf-binary", bytes: new Uint8Array([1, 2, 3]) })], META);
    expect(page).toContain('<a download href="data:model/gltf-binary;base64,');
    expect(page).toContain("open (3 bytes)");
  });

  test("links an html viewer and never frames it", () => {
    const page = galleryPage([rendered({ format: "html", file: "p.json", mime: "text/html", bytes: new TextEncoder().encode("<p>x</p>") })], META);
    expect(page).toContain('<a download href="data:text/html;base64,');
    expect(page).not.toContain("<iframe");
  });

  test("writes one section per type, in the order of the input types", () => {
    const page = galleryPage([rendered({ type: "plot", file: "l.json", format: "html", mime: "text/html" }), rendered({ type: "dot" })], META);
    expect(page.indexOf("<h2>dot</h2>")).toBeGreaterThan(-1);
    expect(page.indexOf("<h2>dot</h2>")).toBeLessThan(page.indexOf("<h2>plot</h2>"));
  });

  test("gives the same page for shuffled input", () => {
    const items = [
      rendered({ file: "b.dot" }),
      rejected("E_INPUT", "bad", { file: "a.dot" }),
      skipped(SKIP_REASONS.browser, { type: "plot", file: "l.json", format: "pdf" }),
      rendered({ file: "a.dot", format: "pdf", mime: "application/pdf" }),
    ];
    expect(galleryPage([...items].reverse(), META)).toBe(galleryPage(items, META));
  });

  test("states the counts, the engine and the availability of the browser and TeX", () => {
    const page = galleryPage([rendered(), rejected("E_INPUT", "bad", { file: "b.dot" }), skipped(SKIP_REASONS.browser, { file: "c.dot", format: "pdf" })], {
      engine: "1.0.8",
      browser: false,
      tex: true,
    });
    expect(page).toContain("<p>3 fixtures, 1 rendered, 1 rejected, 1 skipped. Engine 1.0.8. Browser: no. TeX bundles: yes.</p>");
    expect(page).toContain("<title>Fixture gallery</title>");
    expect(readFileSync(new URL("../support/gallery.ts", import.meta.url), "utf8")).toContain("export function galleryPage");
  });
});
