import { RenderError } from "../errors.ts";

/** A file of the tree: its bytes, or a function that reads them on the first use. */
export type TreeFile = Uint8Array | (() => Uint8Array);

/**
 * Reduces a file name of TeX to the key of the tree. The tree has one flat name space in lower case.
 * The function removes an area prefix (`TeXinputs:`), the braces of `\input{name}`, the quotes of a quoted name,
 * a `./` start and every folder part. A name that escapes the tree throws a `RenderError` with the code `E_INPUT`.
 * Escapes are a `..` segment, a leading slash or backslash (an absolute path or a UNC path) and a drive letter.
 */
export function treeName(raw: string): string {
  const name = raw.replace(/^[A-Za-z]{2,}:/, "").replace(/^{(.*)}$/, "$1").replace(/"/g, "");
  if (/^[\\/]/.test(name) || /^[A-Za-z]:/.test(name) || name.split(/[\\/]/).includes("..")) {
    throw new RenderError("E_INPUT", `the file name ${JSON.stringify(raw)} escapes the virtual file tree`);
  }
  const parts = name.split(/[\\/]/);
  return parts[parts.length - 1]!.toLowerCase();
}

/**
 * The virtual file tree of a TeX run. A read sees only the files put in the tree: the bundles and the source.
 * A write goes to memory only. The tree has no access to the host file system.
 */
export class TexTree {
  private readonly input = new Map<string, TreeFile>();
  private readonly output = new Map<string, Uint8Array>();
  private parent: TexTree | undefined;
  /** The names of the input files that a run has read. */
  readonly read = new Set<string>();

  /** The files that a run has written, by name. */
  get written(): ReadonlyMap<string, Uint8Array> {
    return this.output;
  }

  /** Adds an input file. A name that is already in the tree keeps its first file. */
  add(name: string, file: TreeFile): void {
    const key = treeName(name);
    if (!this.input.has(key)) this.input.set(key, file);
  }

  /** Stores a written file. It hides an input file of the same name until the tree deletes it. */
  put(name: string, data: Uint8Array): void {
    this.output.set(treeName(name), data);
  }

  /**
   * Makes a tree that sees every file of this tree and keeps its own writes and its own added files.
   * A run on the fork leaves this tree as it was, so a bundle tree serves many runs.
   */
  fork(): TexTree {
    const child = new TexTree();
    child.parent = this;
    return child;
  }

  /** Whether a file of this name is in the tree. */
  has(name: string): boolean {
    const key = treeName(name);
    return this.output.has(key) || this.input.has(key) || (this.parent?.has(key) ?? false);
  }

  /** Reads a file. The result is `undefined` for a name that is not in the tree. */
  get(name: string): Uint8Array | undefined {
    const key = treeName(name);
    const written = this.output.get(key);
    if (written !== undefined) return written;
    const file = this.input.get(key);
    if (file === undefined) {
      const inherited = this.parent?.get(key);
      if (inherited !== undefined) this.read.add(key);
      return inherited;
    }
    this.read.add(key);
    if (typeof file === "function") {
      const data = file();
      this.input.set(key, data);
      return data;
    }
    return file;
  }

  /** Deletes a written file. An input file stays. */
  delete(name: string): void {
    this.output.delete(treeName(name));
  }
}
