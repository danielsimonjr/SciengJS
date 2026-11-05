// The virtual file tree of the src/tex runtime, filled from host folders or from a list of files.
// Node 22.18 and later (and Bun) load the TypeScript source of the runtime without a build step.
import fs from 'node:fs';
import path from 'node:path';
import { TexTree } from '../../src/tex/vfs.ts';

/**
 * A tree whose input files are the files of the folders. The first folder wins for a name.
 * A file is read from the disk on the first use.
 * @param {string[]} roots the folders to index
 * @returns {{tree: TexTree, paths: Map<string, string>}} `paths` maps each tree name to the host path
 */
export function treeFromRoots(roots) {
  const tree = new TexTree();
  const paths = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() || e.isSymbolicLink()) {
        const key = e.name.toLowerCase();
        if (paths.has(key)) continue;
        paths.set(key, p);
        tree.add(key, () => new Uint8Array(fs.readFileSync(p)));
      }
    }
  };
  for (const r of roots) walk(r);
  return { tree, paths };
}

/** A tree whose input files are the entries `[name, bytes]`. */
export function treeOf(entries) {
  const tree = new TexTree();
  for (const [name, bytes] of entries) tree.add(name, bytes);
  return tree;
}

/**
 * The file name key of the format build and the trip test. TeX names a file with an area prefix
 * (`TeXinputs:`), braces or quotes; the key drops them and keeps the folder part, so a name such as
 * `./texsys.aux` finds no file. The build probes that name, and the format records the result.
 * `/` and `\` become `|`, which no file name holds, so the tree never reduces a key to a shorter name.
 * @param {string} raw
 */
export const flatKey = (raw) => raw.replace(/^[A-Za-z]+:/, '').replace(/^{(.*)}$/, '$1').replace(/"/g, '').toLowerCase().replace(/[\\/]/g, '|');
