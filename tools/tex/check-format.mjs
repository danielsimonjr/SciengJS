// Check the format record of build.json against a pinned sha256 and a pgf driver name.
// node check-format.mjs <build.json> <sha256> <pgf-driver>
import fs from 'node:fs';

const [file, sha256, driver] = process.argv.slice(2);
if (!file || !sha256 || !driver) {
  console.error('usage: check-format.mjs <build.json> <sha256> <pgf-driver>');
  process.exit(2);
}
const f = JSON.parse(fs.readFileSync(file, 'utf8')).format;
console.log(JSON.stringify({ sha256: f.sha256, bytes: f.bytes, pgfDriver: f.pgfDriver }));
if (f.sha256 !== sha256) {
  console.error(`format sha256 differs: ${f.sha256}, expected ${sha256}`);
  process.exit(1);
}
if (f.pgfDriver !== driver) {
  console.error(`pgf driver differs: ${f.pgfDriver}, expected ${driver}`);
  process.exit(1);
}
