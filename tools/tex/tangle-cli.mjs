// Command line of the tangler: node tangle-cli.mjs <web> <out-base> [change files...]
// Writes <out-base>.p and <out-base>.pool and prints the statistics as JSON.
import fs from 'node:fs';
import { tangle } from './tangle.mjs';

const [web, outBase, ...changes] = process.argv.slice(2);
if (!web || !outBase) {
  console.error('usage: tangle-cli.mjs <web> <out-base> [change files...]');
  process.exit(2);
}
const t0 = performance.now();
const r = tangle(
  fs.readFileSync(web, 'latin1'),
  changes.map((c) => ({ name: c, text: fs.readFileSync(c, 'latin1') })),
);
fs.writeFileSync(`${outBase}.p`, r.pascal, 'latin1');
fs.writeFileSync(`${outBase}.pool`, r.pool, 'latin1');
console.log(JSON.stringify({ web, ms: Math.round(performance.now() - t0), ...r.stats }));
