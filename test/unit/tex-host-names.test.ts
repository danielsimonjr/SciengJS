import { describe, expect, test } from "bun:test";
import { TexHost } from "../../src/tex/host.ts";
import { TexTree } from "../../src/tex/vfs.ts";

// Opens the file `raw` for reading in a host with no engine: the host reads the name from a fake memory.
function openRead(raw: string, nameKey?: (raw: string) => string): TexTree {
  const tree = new TexTree();
  tree.add("texsys.aux", new Uint8Array([1, 2, 3]));
  const memory = new WebAssembly.Memory({ initial: 1 });
  const host = new TexHost({ files: tree, std: { input: 1000, output: 2000 }, ...(nameKey === undefined ? {} : { nameKey }) });
  host.attach({ exports: { memory } } as never);
  new Uint8Array(memory.buffer).set(Buffer.from(raw, "latin1"), 4000);
  const open = host.imports().env.f_open as (...a: number[]) => void;
  open(100, 0, 4000, raw.length, 1);
  return tree;
}

describe("the name key of the TeX host", () => {
  test("the default key drops the folder part, so ./texsys.aux finds texsys.aux", () => {
    expect([...openRead("./texsys.aux").read]).toEqual(["texsys.aux"]);
  });

  test("a caller key replaces the default: the folder part stays and the file is not found", () => {
    const flat = (raw: string): string => raw.toLowerCase().replace(/[\\/]/g, "|");
    expect([...openRead("./texsys.aux", flat).read]).toEqual([]);
    expect([...openRead("TEXSYS.AUX", flat).read]).toEqual(["texsys.aux"]);
  });
});
