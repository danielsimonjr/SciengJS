// Pin TeX Live archives for the bundles.
//   node add-bundle-package.mjs <texlive.tlpdb> <download-dir> <name...>
// For each name the tool downloads <packages.base><name>.tar.xz, compares its sha512 with the `containerchecksum` of the
// tlpdb record (second method), prints the catalogue licence, and adds the sha256 pin to `bundlePackages` in config.json.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.env.TEX_BUILD_CONFIG ? path.resolve(process.env.TEX_BUILD_CONFIG) : path.join(here, 'config.json');
const [tlpdb, dir, ...names] = process.argv.slice(2);
if (!tlpdb || !dir || !names.length) {
  console.error('usage: add-bundle-package.mjs <texlive.tlpdb> <download-dir> <name...>');
  process.exit(2);
}
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const records = fs.readFileSync(tlpdb, 'utf8').split(/\n\n/);
const hash = (alg, b) => crypto.createHash(alg).update(b).digest('hex');
fs.mkdirSync(dir, { recursive: true });
let failed = false;
for (const name of names) {
  const rec = records.find((r) => r.startsWith(`name ${name}\n`));
  if (!rec) { console.log(`${name}: not in the tlpdb`); failed = true; continue; }
  const file = path.join(dir, `${name}.tar.xz`);
  if (!fs.existsSync(file)) {
    const res = await fetch(`${cfg.packages.base}${name}.tar.xz`, { headers: { 'user-agent': cfg.userAgent } });
    if (!res.ok) { console.log(`${name}: download ${res.status}`); failed = true; continue; }
    fs.writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
  }
  const b = fs.readFileSync(file);
  const ok = hash('sha512', b) === /containerchecksum (\w+)/.exec(rec)?.[1];
  console.log(`${name}: ${ok ? 'sha512 ok' : 'SHA512 MISMATCH'}, licence ${(/catalogue-license (.*)/.exec(rec) ?? [])[1] ?? 'none'}`);
  if (!ok) { failed = true; continue; }
  if (!cfg.bundlePackages.files.some((f) => f.name === name)) cfg.bundlePackages.files.push({ name, sha256: hash('sha256', b) });
}
cfg.bundlePackages.files.sort((a, b) => (a.name < b.name ? -1 : 1));
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
process.exitCode = failed ? 1 : 0;
