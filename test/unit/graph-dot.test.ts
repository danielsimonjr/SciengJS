import { describe, expect, test } from "bun:test";
import { instance } from "@viz-js/viz";
import { RenderError } from "../../src/errors.ts";
import { dotToSvg } from "../../src/graph/dot.ts";

async function rejectionOf(promise: Promise<unknown>): Promise<RenderError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RenderError) return err;
    throw err;
  }
  throw new Error("expected a RenderError, but the promise resolved");
}

describe("dotToSvg", () => {
  test("renders a digraph to an SVG document with its nodes and no warning", async () => {
    const r = await dotToSvg("digraph G { a -> b }");
    expect(r.svg).toContain("<svg");
    expect(r.svg).toMatch(/<title>a<\/title>/);
    expect(r.svg).toMatch(/<title>b<\/title>/);
    expect(r.warnings).toEqual([]);
  });

  test("a syntax error rejects with E_INPUT and the line of the error", async () => {
    const err = await rejectionOf(dotToSvg("digraph G {\n  a -> b;\n  c -> ;\n}\n"));
    expect(err.code).toBe("E_INPUT");
    expect(err.line).toBe(3);
  });

  test("an image attribute gives one warning that names the line and the file, and no image reference", async () => {
    const r = await dotToSvg('digraph G {\n  a [image="probe-image.png"];\n}\n');
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("line 2");
    expect(r.warnings[0]).toContain("probe-image.png");
    expect(r.svg).not.toContain("<image");
    expect(r.svg).not.toContain("probe-image.png");
  });

  test("control: the same file name, with a declared image size and no removal, is referenced in the SVG", async () => {
    const v = await instance();
    const out = v.render('digraph G { a [image="probe-image.png"] }', {
      format: "svg",
      images: [{ name: "probe-image.png", width: 10, height: 10 }],
    });
    expect(out.status).toBe("success");
    expect((out as { output: string }).output).toContain("probe-image.png");
  });

  test("an HTML IMG element gives a warning and no image reference", async () => {
    const src = 'digraph G { a [label=<<TABLE><TR><TD><IMG SRC="pic.png"/></TD></TR></TABLE>>] }';
    const r = await dotToSvg(src);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.svg).not.toContain("<image");
    expect(r.svg).not.toContain("pic.png");
  });

  test("a URL attribute becomes a hyperlink in the SVG, and it is not an image reference", async () => {
    const r = await dotToSvg('digraph G { a [URL="http://127.0.0.1:9/page"] }');
    expect(r.svg).toContain("http://127.0.0.1:9/page");
    expect(r.svg).not.toContain("<image");
  });
});
