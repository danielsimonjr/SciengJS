// A virtual file system for the TeX runs of the trial. Reads come from an
// in-memory map first, then from an index of read-only folders (by file name,
// in lower case). Writes go to the map only. The program never sees a host path.
import fs from 'node:fs';
import path from 'node:path';

export class TreeFS {
  /** @param {string[]} roots folders to index; the first folder wins for a name */
  constructor(roots = []) {
    this.mem = new Map();
    this.index = new Map();
    this.read = new Map(); // name -> host path of each file that the program read
    for (const r of roots) this.addRoot(r);
  }
  addRoot(root) {
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile() || e.isSymbolicLink()) {
          const k = e.name.toLowerCase();
          if (!this.index.has(k)) this.index.set(k, p);
        }
      }
    };
    walk(root);
  }
  get(name) {
    if (this.mem.has(name)) return this.mem.get(name);
    const p = this.index.get(name);
    if (!p) return undefined;
    const d = new Uint8Array(fs.readFileSync(p));
    this.read.set(name, p);
    return d;
  }
  set(name, data) { this.mem.set(name, data); }
  has(name) { return this.mem.has(name) || this.index.has(name); }
  delete(name) { this.mem.delete(name); }
}

// TeX names a file with an area prefix (TeXinputs:, TeXfonts:, TeXformats:).
// The virtual file system has one flat name space in lower case.
// A name in braces (`\input{pgf.tex}`, a TeX Live syntax) maps to the name without braces.
export const flatName = (n) => n.replace(/^[A-Za-z]+:/, '').replace(/^{(.*)}$/, '$1').toLowerCase();
