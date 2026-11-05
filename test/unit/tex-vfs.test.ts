import { describe, expect, test } from "bun:test";
import { TexTree, treeName } from "../../src/tex/vfs.ts";
import { rejection } from "../support/rejections.ts";

const bytes = (...v: number[]): Uint8Array => Uint8Array.from(v);

describe("tex tree names", () => {
  test("an area prefix, braces, quotes and the case are removed", () => {
    expect(treeName("TeXinputs:Foo.TEX")).toBe("foo.tex");
    expect(treeName("{pgf.tex}")).toBe("pgf.tex");
    expect(treeName('"expl3.ltx"')).toBe("expl3.ltx");
    expect(treeName("./x.tex")).toBe("x.tex");
  });

  test("a folder part reduces to the file name", () => {
    expect(treeName("a/b/C.sty")).toBe("c.sty");
    expect(treeName("a\\b\\C.sty")).toBe("c.sty");
  });

  test.each([
    ["../secret.tex"],
    ["a/../../secret"],
    ["a\\..\\x"],
    ["/etc/passwd"],
    ["\\windows\\x"],
    ["C:\\x.tex"],
    ["c:x.tex"],
    ["\\\\server\\share\\x"],
    ["//server/share/x"],
    ["{../x}"],
    ['"C:/x"'],
    [".."],
  ])("%s escapes the tree and fails with E_INPUT", (name) => {
    const err = rejection(() => treeName(name));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("escapes");
  });

  test("a name with dots that is not a parent segment is allowed", () => {
    expect(treeName("a..b.tex")).toBe("a..b.tex");
    expect(treeName("..x")).toBe("..x");
  });
});

describe("tex tree", () => {
  test("a read sees only what was put in, and a lookup of a missing file gives undefined", () => {
    const t = new TexTree();
    t.add("A.tex", bytes(1, 2));
    expect(t.get("a.tex")).toEqual(bytes(1, 2));
    expect(t.has("A.TEX")).toBe(true);
    expect(t.get("b.tex")).toBeUndefined();
    expect(t.has("b.tex")).toBe(false);
  });

  test("add keeps the first file of a name, put replaces", () => {
    const t = new TexTree();
    t.add("a", bytes(1));
    t.add("a", bytes(2));
    expect(t.get("a")).toEqual(bytes(1));
    t.put("a", bytes(3));
    expect(t.get("a")).toEqual(bytes(3));
  });

  test("a loader runs once and on the first read", () => {
    const t = new TexTree();
    let calls = 0;
    t.add("lazy.sty", () => {
      calls++;
      return bytes(9);
    });
    expect(calls).toBe(0);
    expect(t.has("lazy.sty")).toBe(true);
    expect(calls).toBe(0);
    expect(t.get("lazy.sty")).toEqual(bytes(9));
    expect(t.get("lazy.sty")).toEqual(bytes(9));
    expect(calls).toBe(1);
    expect([...t.read]).toEqual(["lazy.sty"]);
  });

  test("writes stay in memory and are listed apart from the input", () => {
    const t = new TexTree();
    t.add("in.tex", bytes(1));
    t.put("out.dvi", bytes(7));
    expect([...t.written.keys()]).toEqual(["out.dvi"]);
    expect(t.get("out.dvi")).toEqual(bytes(7));
    t.delete("out.dvi");
    expect(t.has("out.dvi")).toBe(false);
    expect(t.has("in.tex")).toBe(true);
  });

  test("a written file hides an input file of the same name until it is deleted", () => {
    const t = new TexTree();
    t.add("x", bytes(1));
    t.put("x", bytes(2));
    expect(t.get("x")).toEqual(bytes(2));
    t.delete("x");
    expect(t.get("x")).toEqual(bytes(1));
  });

  test("a fork sees the files of its parent and keeps its own writes and additions", () => {
    const base = new TexTree();
    base.add("a.sty", bytes(1));
    const run = base.fork();
    run.add("job.tex", bytes(2));
    run.put("job.dvi", bytes(3));
    expect(run.get("a.sty")).toEqual(bytes(1));
    expect(run.has("a.sty")).toBe(true);
    expect([...run.read]).toEqual(["a.sty"]);
    expect(run.get("job.tex")).toEqual(bytes(2));
    expect(run.get("nope")).toBeUndefined();
    expect(run.has("nope")).toBe(false);
    expect(base.has("job.tex")).toBe(false);
    expect(base.has("job.dvi")).toBe(false);
    expect(base.written.size).toBe(0);
    run.add("a.sty", bytes(9));
    expect(run.get("a.sty")).toEqual(bytes(9));
    expect(base.get("a.sty")).toEqual(bytes(1));
    expect(rejection(() => run.get("../x")).code).toBe("E_INPUT");
  });

  test("get, has, add, put and delete refuse an escaping name", () => {
    const t = new TexTree();
    for (const f of [() => t.get("../x"), () => t.has("/x"), () => t.add("C:\\x", bytes(1)), () => t.put("..\\x", bytes(1)), () => t.delete("//x/y")]) {
      expect(rejection(f).code).toBe("E_INPUT");
    }
  });
});
