// The trip test of tripman.tex, Appendix A, on the WASM builds of the trial.
// node trip.mjs <build-dir> <trip-source-dir> <out-dir>
// The build dir holds textrip.wasm, textrip.symbols.json, textrip.pool and the
// texware programs pltotf, tftopl and dvitype. The source dir holds the files
// of the TeX distribution: trip.tex, trip.pl, tripin.log, trip.log, trip.fot,
// tripin.fot and trip.typ. The out dir gets each output file and each difference.
import fs from 'node:fs';
import path from 'node:path';
import { runProgram } from '../runtime/run.mjs';
import { ExitSignal } from '../runtime/host.mjs';
import { lineDiff } from './linediff.mjs';

const [buildDir, srcDir, outDir] = process.argv.slice(2);
if (!buildDir || !srcDir || !outDir) {
  console.error('usage: trip.mjs <build-dir> <trip-source-dir> <out-dir>');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
const read = (p) => fs.readFileSync(p);
const src = (n) => read(path.join(srcDir, n));
const latin = (u8) => Buffer.from(u8).toString('latin1');

const load = async (name) => ({
  module: await WebAssembly.compile(read(path.join(buildDir, `${name}.wasm`))),
  symbols: JSON.parse(fs.readFileSync(path.join(buildDir, `${name}.symbols.json`), 'utf8')),
});
// TeX names a file with an area prefix (TeXinputs:, TeXfonts:, TeXformats:). The virtual
// file system has one flat folder; names are compared in lower case.
const flatName = (n) => n.replace(/^[A-Za-z]+:/, '').toLowerCase();

const results = { steps: {} };
const t = (label, ms) => { results.steps[label] = { ...(results.steps[label] ?? {}), ms: Math.round(ms) }; };

// Step 1: PLtoTF and TFtoPL
const pltotf = await load('pltotf');
const tftopl = await load('tftopl');
{
  const files = new Map([['plfile', src('trip.pl')]]);
  const r = await runProgram({ ...pltotf, files, mapName: (n) => n });
  t('pltotf', r.runMs);
  const tfm = files.get('tfmfile');
  fs.writeFileSync(path.join(outDir, 'trip.tfm'), tfm);
  const files2 = new Map([['tfmfile', tfm]]);
  const r2 = await runProgram({ ...tftopl, files: files2, mapName: (n) => n });
  t('tftopl', r2.runMs);
  const tmp = latin(files2.get('plfile'));
  fs.writeFileSync(path.join(outDir, 'tmp.pl'), tmp, 'latin1');
  const d = lineDiff(latin(src('trip.pl')), tmp);
  results.steps.pltotf.tmpPlDiffers = d.changedLines;
  results.tfm = tfm;
}

// Steps 3 and 4: the trip build of tex.web
const tex = await load('textrip');
const vfs = new Map([
  ['tex.pool', read(path.join(buildDir, 'textrip.pool'))],
  ['trip.tex', src('trip.tex')],
  ['trip.tfm', results.tfm],
]);
delete results.tfm;
const texRun = async (terminal) => {
  const r = await runProgram({
    ...tex, files: vfs, terminal,
    mapName: flatName,
    extra: { hostexit: (code) => { throw new ExitSignal(code); } },
  });
  return r;
};
{
  const r = await texRun(['', '\\input trip']);
  t('step3', r.runMs);
  results.steps.step3.exit = r.exit;
  fs.writeFileSync(path.join(outDir, 'tripin.fot'), r.terminal, 'latin1');
  fs.writeFileSync(path.join(outDir, 'tripin.log'), vfs.get('trip.log') ?? '');
  if (vfs.get('trip.fmt')) fs.writeFileSync(path.join(outDir, 'trip.fmt'), vfs.get('trip.fmt'));
  results.steps.step3.fmtBytes = vfs.get('trip.fmt')?.length ?? 0;
}
{
  vfs.delete('trip.log');
  const r = await texRun([' &trip  trip ']);
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
  const dvitype = await load('dvitype');
  const dvi = vfs.get('trip.dvi');
  if (dvi) {
    const files = new Map([['dvifile', dvi], ['trip.tfm', results.tfm ?? fs.readFileSync(path.join(outDir, 'trip.tfm'))]]);
    const r = await runProgram({
      ...dvitype, files,
      terminal: ['2', '*.*.*.*.*.*.*.*.*.*', '', '7227/100', ''],
      ttyNames: ['TTY:', 'termin'],
      echo: false,
      extra: { hostexit: (code) => { throw new ExitSignal(code); } },
      mapName: (n) => (n === 'dvifile' ? n : flatName(n).replace(/^.*\//, '')),
    });
    t('dvitype', r.runMs);
    fs.writeFileSync(path.join(outDir, 'trip.typ'), r.terminal, 'latin1');
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
fs.writeFileSync(path.join(outDir, 'trip-results.json'), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results));
