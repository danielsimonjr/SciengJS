// Compare the bundle list of a build with the pinned list of the engine package. Exit 1 on any difference.
//   node check-bundles.mjs <built bundles.json> <pinned bundles.json>
// The comparison reads both files as JSON, so the line ends of a checkout do not matter.
import fs from 'node:fs';

const [builtPath, pinnedPath] = process.argv.slice(2);
if (!builtPath || !pinnedPath) {
  console.error('usage: check-bundles.mjs <built bundles.json> <pinned bundles.json>');
  process.exit(2);
}
const built = JSON.parse(fs.readFileSync(builtPath, 'utf8'));
const pinned = JSON.parse(fs.readFileSync(pinnedPath, 'utf8'));
const problems = [];
for (const p of pinned) {
  const b = built.find((x) => x.name === p.name);
  if (!b) { problems.push(`${p.name}: not built`); continue; }
  for (const key of ['file', 'sha256', 'bytes']) if (b[key] !== p[key]) problems.push(`${p.name}: ${key} is ${b[key]}, pinned ${p[key]}`);
}
for (const b of built) if (!pinned.some((p) => p.name === b.name)) problems.push(`${b.name}: built but not pinned`);
if (problems.length) {
  console.error(`bundle check failed:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`bundle check ok: ${built.map((b) => `${b.name} ${b.sha256.slice(0, 12)}`).join(', ')}`);
