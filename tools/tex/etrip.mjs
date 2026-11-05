// The e-TRIP test of etripman.tex (Appendices A and B) on the WASM builds of T6.
// node etrip.mjs <build-dir> <out-dir>
//   build dir: the output of build.mjs: etextrip, pltotf, tftopl, dvitype and build.json.
//   build.json gives the trip dir (the trip files of tex.web and tripos.tex), the etrip dir
//   (etrip.tex, etrip.pl, etrip.diffs and the reference logs of etex.ch) and the added primitives.
// Part 1 runs the trip test in compatibility mode (c), part 2 in extended mode (x),
// part 3 runs etrip.tex (e). The out dir gets each output file, each difference and
// etrip-results.json. etrip-gate.mjs applies the pass rule; exit status 1 on a failure.
import fs from 'node:fs';
import path from 'node:path';
import { lineDiff } from './linediff.mjs';
import { latin, loadProgram, plRoundTrip, texRun, dvitypeRun } from './trip-steps.mjs';
import { treeOf } from './tree.mjs';
import { etripGate, COMPARISONS } from './etrip-gate.mjs';

const [buildDir, outDir] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: etrip.mjs <build-dir> <out-dir>');
  process.exit(2);
}
const build = JSON.parse(fs.readFileSync(path.join(buildDir, 'build.json'), 'utf8'));
const tripDir = build.tripDir, etripDir = path.join(build.etexDir, 'etrip');
fs.mkdirSync(outDir, { recursive: true });
// a file of an earlier run must not stand in for a file that this run does not write
for (const [d, ref, mine] of COMPARISONS) {
  for (const n of [mine, `${mine}.diff`, ...(d === 'out' ? [ref] : [])]) fs.rmSync(path.join(outDir, n), { force: true });
}
const read = (p) => new Uint8Array(fs.readFileSync(p));
const write = (n, d) => fs.writeFileSync(path.join(outDir, n), typeof d === 'string' ? Buffer.from(d, 'latin1') : d);
const load = (name) => loadProgram(buildDir, name);
const [tex, pltotf, tftopl, dvitype] = await Promise.all(['etextrip', 'pltotf', 'tftopl', 'dvitype'].map(load));
const pool = read(path.join(buildDir, 'etextrip.pool'));
const results = { steps: {}, plDiffers: {} };

// Steps 1 and 6 (etripman): PLtoTF and TFtoPL on trip.pl and etrip.pl
const tripTfm = await plRoundTrip(pltotf, tftopl, read(path.join(tripDir, 'trip.pl')));
const etripTfm = await plRoundTrip(pltotf, tftopl, read(path.join(etripDir, 'etrip.pl')));
results.plDiffers['trip.pl'] = tripTfm.plDiffers;
results.plDiffers['etrip.pl'] = etripTfm.plDiffers;

/**
 * Two runs of the trip build: INITEX makes the format, the second run loads it.
 * @param {string} p the prefix of the output names (c, x or e)
 */
async function twoRuns(p, job, input, tfm, first, second) {
  const vfs = treeOf([['tex.pool', pool], [`${job}.tex`, input], [`${job}.tfm`, tfm]]);
  const r1 = await texRun(tex, vfs, first);
  results.steps[`${p}1`] = { exit: r1.exit, ms: Math.round(r1.runMs), fmtBytes: vfs.get(`${job}.fmt`)?.length ?? 0 };
  write(`${p}${job}in.fot`, r1.terminal);
  write(`${p}${job}in.log`, vfs.get(`${job}.log`) ?? '');
  vfs.delete(`${job}.log`);
  const r2 = await texRun(tex, vfs, second);
  results.steps[`${p}2`] = { exit: r2.exit, ms: Math.round(r2.runMs) };
  write(`${p}${job}.fot`, r2.terminal);
  for (const [n, out] of [[`${job}.log`, `${p}${job}.log`], ['tripos.tex', `${p}tripos.tex`], [`${job}.out`, `${p}${job}.out`]]) {
    if (vfs.get(n)) write(out, vfs.get(n));
  }
  const dvi = vfs.get(`${job}.dvi`);
  if (dvi) {
    const d = await dvitypeRun(dvitype, dvi, [[`${job}.tfm`, tfm]]);
    results.steps[`${p}2`].dvitypeMs = Math.round(d.ms);
    write(`${p}${job}.typ`, d.typ);
  }
}

const tripTex = read(path.join(tripDir, 'trip.tex'));
// Appendix A, step 3: compatibility mode
await twoRuns('c', 'trip', tripTex, tripTfm.tfm, ['', '\\input trip'], [' &trip  trip ']);
// Appendix A, step 4: extended mode
await twoRuns('x', 'trip', tripTex, tripTfm.tfm, ['', '*\\input trip'], ['&trip \\toksdef\\tokens=0 \\input trip']);
// Appendix B, steps 7 and 8
await twoRuns('e', 'etrip', read(path.join(etripDir, 'etrip.tex')), etripTfm.tfm, ['*etrip'], ['&etrip etrip']);

const dirOf = { trip: tripDir, etrip: etripDir, out: outDir };
results.diffs = {};
for (const [d, ref, mine] of COMPARISONS) {
  const rp = path.join(dirOf[d], ref), mp = path.join(outDir, mine);
  if (!fs.existsSync(mp) || !fs.existsSync(rp)) { results.diffs[mine] = { missing: !fs.existsSync(mp) ? mine : ref }; continue; }
  const df = lineDiff(latin(read(rp)), latin(read(mp)));
  write(`${mine}.diff`, df.text);
  results.diffs[mine] = { reference: `${d}/${ref}`, referenceLines: latin(read(rp)).split('\n').length - 1, removed: df.removed, added: df.added };
}
results.gate = etripGate({ tripDir, etripDir, outDir, pascal: latin(read(path.join(buildDir, 'etextrip.p'))), plDiffers: results.plDiffers, extraPrimitives: build.addedPrimitives.length });
write('etrip-results.json', JSON.stringify(results, null, 1));
console.log(JSON.stringify({ diffs: results.diffs, gate: results.gate }));
if (!results.gate.pass) process.exitCode = 1;
