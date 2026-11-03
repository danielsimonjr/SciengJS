// The trip test of tripman.tex, Appendix A, on the WASM builds of the trial.
// node trip.mjs <build-dir> <trip-source-dir> <out-dir>
// The build dir holds textrip.wasm, textrip.symbols.json, textrip.pool and the
// texware programs pltotf, tftopl and dvitype. The source dir holds the files
// of the TeX distribution: trip.tex, trip.pl, tripin.log, trip.log, trip.fot,
// tripin.fot and trip.typ. The out dir gets each output file and each difference.
import fs from 'node:fs';
import path from 'node:path';
import { lineDiff } from './linediff.mjs';
import { tripGate, buildBanner } from './trip-gate.mjs';
import { latin, loadProgram, plRoundTrip, texRun, dvitypeRun } from './trip-steps.mjs';

const [buildDir, srcDir, outDir] = process.argv.slice(2);
if (!buildDir || !srcDir || !outDir) {
  console.error('usage: trip.mjs <build-dir> <trip-source-dir> <out-dir>');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
const read = (p) => fs.readFileSync(p);
const src = (n) => read(path.join(srcDir, n));
const load = (name) => loadProgram(buildDir, name);

const results = { steps: {} };
const t = (label, ms) => { results.steps[label] = { ...(results.steps[label] ?? {}), ms: Math.round(ms) }; };

// Step 1: PLtoTF and TFtoPL
const rt = await plRoundTrip(await load('pltotf'), await load('tftopl'), src('trip.pl'));
t('pltotf', rt.ms.pltotf);
t('tftopl', rt.ms.tftopl);
fs.writeFileSync(path.join(outDir, 'trip.tfm'), rt.tfm);
fs.writeFileSync(path.join(outDir, 'tmp.pl'), rt.pl, 'latin1');
results.steps.pltotf.tmpPlDiffers = rt.plDiffers;

// Steps 3 and 4: the trip build of tex.web
const tex = await load('textrip');
const vfs = new Map([
  ['tex.pool', read(path.join(buildDir, 'textrip.pool'))],
  ['trip.tex', src('trip.tex')],
  ['trip.tfm', rt.tfm],
]);
{
  const r = await texRun(tex, vfs, ['', '\\input trip']);
  t('step3', r.runMs);
  results.steps.step3.exit = r.exit;
  fs.writeFileSync(path.join(outDir, 'tripin.fot'), r.terminal, 'latin1');
  fs.writeFileSync(path.join(outDir, 'tripin.log'), vfs.get('trip.log') ?? '');
  if (vfs.get('trip.fmt')) fs.writeFileSync(path.join(outDir, 'trip.fmt'), vfs.get('trip.fmt'));
  results.steps.step3.fmtBytes = vfs.get('trip.fmt')?.length ?? 0;
}
{
  vfs.delete('trip.log');
  const r = await texRun(tex, vfs, [' &trip  trip ']);
  t('step4', r.runMs);
  results.steps.step4.exit = r.exit;
  fs.writeFileSync(path.join(outDir, 'trip.fot'), r.terminal, 'latin1');
  for (const n of ['trip.log', 'trip.dvi', 'tripos.tex', '8terminal.tex']) {
    const d = vfs.get(n);
    results.steps.step4[n] = d ? d.length : null;
    if (d) fs.writeFileSync(path.join(outDir, n), d);
  }
}

// Step 6: DVItype
{
  const dvi = vfs.get('trip.dvi');
  if (dvi) {
    const r = await dvitypeRun(await load('dvitype'), dvi, [['trip.tfm', rt.tfm]]);
    t('dvitype', r.ms);
    fs.writeFileSync(path.join(outDir, 'trip.typ'), r.typ, 'latin1');
  }
}

// Differences from the reference files
results.diffs = {};
for (const [mine, ref] of [['tripin.log', 'tripin.log'], ['tripin.fot', 'tripin.fot'], ['trip.log', 'trip.log'], ['trip.fot', 'trip.fot'], ['trip.typ', 'trip.typ']]) {
  const p = path.join(outDir, mine);
  if (!fs.existsSync(p)) { results.diffs[mine] = 'missing'; continue; }
  const d = lineDiff(latin(src(ref)), latin(read(p)));
  fs.writeFileSync(path.join(outDir, `${mine}.diff`), d.text, 'latin1');
  results.diffs[mine] = { referenceLines: latin(src(ref)).split('\n').length, removed: d.removed, added: d.added };
}
// The pass rule: only the banner line may differ (see trip-gate.mjs); exit status 1 otherwise.
results.gate = tripGate({
  refDir: srcDir, outDir,
  banner: buildBanner(fs.readFileSync(path.join(buildDir, 'textrip.p'), 'latin1')),
  tmpPlDiffers: results.steps.pltotf.tmpPlDiffers,
});
fs.writeFileSync(path.join(outDir, 'trip-results.json'), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results));
if (!results.gate.pass) process.exitCode = 1;
