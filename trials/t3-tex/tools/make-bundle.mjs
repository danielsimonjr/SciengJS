// Copies the files of a used-files map into a bundle folder and writes manifest.json (TeX name -> relative path).
// Usage: node make-bundle.mjs <used-files.json> <bundle-dir> [<base-manifest.json>]
// With a base manifest, names that the base already holds are skipped.
import fs from 'node:fs';
import path from 'node:path';

const [usedPath, bundleDir, basePath] = process.argv.slice(2);
if (!usedPath || !bundleDir) {
  console.error('usage: make-bundle.mjs <used-files.json> <bundle-dir> [<base-manifest.json>]');
  process.exit(2);
}

const used = JSON.parse(fs.readFileSync(usedPath, 'utf8'));
const base = basePath ? JSON.parse(fs.readFileSync(basePath, 'utf8')) : {};
const filesDir = path.join(bundleDir, 'files');
fs.mkdirSync(filesDir, { recursive: true });

const manifest = {};
let index = 0;
let bytes = 0;
for (const [name, hostPath] of Object.entries(used)) {
  if (Object.prototype.hasOwnProperty.call(base, name)) continue;
  index += 1;
  const rel = path.posix.join('files', `${String(index).padStart(4, '0')}-${path.basename(hostPath)}`);
  const data = fs.readFileSync(hostPath);
  fs.writeFileSync(path.join(bundleDir, rel), data);
  manifest[name] = rel;
  bytes += data.length;
}
fs.writeFileSync(path.join(bundleDir, 'manifest.json'), JSON.stringify(manifest, null, '\t') + '\n');
console.log(JSON.stringify({ bundleDir, files: index, bytes }));
