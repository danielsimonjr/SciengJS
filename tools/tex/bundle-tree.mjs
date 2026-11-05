// The flat file tree of the TeX bundles: shared by the recorder and the bundle builder.
import fs from 'node:fs';
import path from 'node:path';

/**
 * Walks folders in sorted order and maps each flat lower-case file name to its path.
 * The first file of a name wins, as in the runtime tree. A later file of the same name with other bytes puts the name in `conflicts`:
 * a bundle must not include such a name, so the build needs an explicit rule for it.
 * @param {string[]} roots
 * @returns {Map<string, string> & { conflicts: Set<string> }}
 */
export function collectTree(roots) {
  const map = Object.assign(new Map(), { conflicts: new Set() });
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      const key = e.name.toLowerCase();
      const have = map.get(key);
      if (have === undefined) map.set(key, p);
      else if (!fs.readFileSync(have).equals(fs.readFileSync(p))) map.conflicts.add(key);
    }
  };
  for (const r of roots) if (fs.existsSync(r)) walk(r);
  return map;
}
