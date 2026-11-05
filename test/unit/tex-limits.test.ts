import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { renderTex } from "../../src/tex/render.ts";
import { rejectionOf } from "../support/rejections.ts";
import { texBuildOrSkip } from "../support/tex-engine.ts";

const build = texBuildOrSkip("test/unit/tex-limits.test.ts");
const run = build ? test : test.skip;
const doc = (body: string) => `\\documentclass{standalone}\n\\begin{document}\n${body}\n\\end{document}\n`;

describe("tex shell escape", () => {
  test("the TeX source files import no module that starts a program", () => {
    const dir = new URL("../../src/tex/", import.meta.url);
    for (const f of readdirSync(dir)) {
      const text = readFileSync(join(dir.pathname.replace(/^\/([A-Za-z]:)/, "$1"), f), "utf8");
      expect(text).not.toMatch(/child_process|node:worker_threads|\bspawn\b|\bexecSync\b|Bun\./);
    }
  });

  run("the engine imports only file calls and exit: no import can start a program", () => {
    const names = WebAssembly.Module.imports(build!.engine.module).map((i) => i.name);
    expect(names.every((n) => /^(f_[a-z]+|hostexit)$/.test(n))).toBe(true);
  });

  run("\\write18 and \\immediate\\write18 run no command: the log shows the text and no file appears", async () => {
    const source = doc("\\immediate\\write18{echo SHELLRAN > shellmarker.txt}\\write18{echo LATER}\\message{[\\the\\shellescape]}");
    const tree = build!.tree;
    const out = await renderTex({ engine: build!.engine, format: build!.format, tree, source, jobName: "w18", timeoutMs: 60000 });
    expect(out.log).toContain("echo SHELLRAN > shellmarker.txt");
    expect(out.log).toContain("[0]");
    expect(tree.written.size).toBe(0);
  });

  run("a write18 output cannot make a file in the tree or on the disk", async () => {
    const marker = join(process.cwd(), "shellmarker.txt");
    const source = doc("\\immediate\\write18{echo SHELLRAN > shellmarker.txt}");
    await renderTex({ engine: build!.engine, format: build!.format, tree: build!.tree, source, jobName: "w18b", timeoutMs: 60000 });
    expect(() => readFileSync(marker)).toThrow();
  });
});

describe("tex tree refusals through the engine", () => {
  run("\\openin of a path that escapes the tree fails to open, reads nothing and is recorded", async () => {
    const names = ["../secret.tex", "/etc/passwd", "C:/Windows/win.ini", "//server/share/x"];
    const source = doc(names.map((n, i) => `\\openin${i + 1}=${n}\\ifeof${i + 1} \\message{CLOSED${i + 1}}\\fi`).join("\n"));
    const out = await renderTex({ engine: build!.engine, format: build!.format, tree: build!.tree, source, jobName: "esc", timeoutMs: 60000 });
    for (let i = 1; i <= names.length; i++) expect(out.log).toContain(`CLOSED${i}`);
    for (const n of names) expect(out.refused.some((r) => r.startsWith(n))).toBe(true);
  });

  run("\\openout to a path that escapes the tree fails and writes nothing", async () => {
    const source = doc("\\immediate\\openout5=../escape.txt \\immediate\\write5{DATA}\\immediate\\closeout5");
    const err = await rejectionOf(renderTex({ engine: build!.engine, format: build!.format, tree: build!.tree, source, jobName: "escw", timeoutMs: 60000 }));
    expect(err.code).toBe("E_INPUT");
    expect(build!.tree.written.size).toBe(0);
    expect(() => readFileSync(join(process.cwd(), "..", "escape.txt"))).toThrow();
  });

  run("\\openin of a file outside the tree reads nothing (closed stream)", async () => {
    const source = doc("\\openin3=missing-file \\ifeof3 \\message{NOFILE}\\fi");
    const out = await renderTex({ engine: build!.engine, format: build!.format, tree: build!.tree, source, jobName: "miss", timeoutMs: 60000 });
    expect(out.log).toContain("NOFILE");
  });
});

describe("tex time limit", () => {
  run("a source that loops through file calls ends with E_TIMEOUT inside the run function", async () => {
    const source = doc("\\def\\a{\\immediate\\write16{x}\\a}\\a");
    const start = performance.now();
    const err = await rejectionOf(renderTex({ engine: build!.engine, format: build!.format, tree: build!.tree, source, jobName: "spin", timeoutMs: 500 }));
    expect(err.code).toBe("E_TIMEOUT");
    expect(performance.now() - start).toBeLessThan(5000);
  });

  // A loop with no file call (\def\a{\a}\a) gives the host no chance to read the clock. The render worker ends
  // it. That case runs under Node, the release runtime, in test/node/tex-timeout.node.mjs: Bun does not
  // stop a worker that sits inside a WASM loop.
});
