// The steps of the trip test (tripman.tex, Appendix A) as functions, for trip.mjs
// of T5 and the e-TRIP test of T6. Each step runs one WASM program of a build dir
// on a virtual file system in memory.
import fs from 'node:fs';
import path from 'node:path';
import { runProgram } from '../../trials/t5-tex-build/runtime/run.mjs';
import { ExitSignal } from '../../trials/t5-tex-build/runtime/host.mjs';
import { lineDiff } from './linediff.mjs';

export const latin = (u8) => Buffer.from(u8).toString('latin1');
// TeX names a file with an area prefix (TeXinputs:, TeXfonts:, TeXformats:). The virtual
// file system has one flat folder; names are compared in lower case.
export const flatName = (n) => n.replace(/^[A-Za-z]+:/, '').toLowerCase();
const hostexit = (code) => { throw new ExitSignal(code); };

/** Compile one program of a build dir. */
export async function loadProgram(buildDir, name) {
  return {
    module: await WebAssembly.compile(fs.readFileSync(path.join(buildDir, `${name}.wasm`))),
    symbols: JSON.parse(fs.readFileSync(path.join(buildDir, `${name}.symbols.json`), 'utf8')),
  };
}

/**
 * Step 1: PLtoTF makes the TFM file, then TFtoPL makes it a PL file again.
 * @returns {Promise<{tfm:Uint8Array, pl:string, plDiffers:number, ms:{pltotf:number,tftopl:number}}>}
 */
export async function plRoundTrip(pltotf, tftopl, plBytes) {
  const files = new Map([['plfile', plBytes]]);
  const r = await runProgram({ ...pltotf, files, mapName: (n) => n });
  const tfm = files.get('tfmfile');
  const files2 = new Map([['tfmfile', tfm]]);
  const r2 = await runProgram({ ...tftopl, files: files2, mapName: (n) => n });
  const pl = latin(files2.get('plfile'));
  return { tfm, pl, plDiffers: lineDiff(latin(plBytes), pl).changedLines, ms: { pltotf: r.runMs, tftopl: r2.runMs } };
}

/** One run of a TeX build with the terminal lines given. The run reads and writes `vfs`. */
export async function texRun(tex, vfs, terminal) {
  return runProgram({ ...tex, files: vfs, terminal, mapName: flatName, extra: { hostexit } });
}

/** Step 6: DVItype with the options of tripman.tex (output level 2, all pages, 72.27 dpi). */
export async function dvitypeRun(dvitype, dvi, tfmFiles) {
  const files = new Map([['dvifile', dvi], ...tfmFiles]);
  const r = await runProgram({
    ...dvitype, files,
    terminal: ['2', '*.*.*.*.*.*.*.*.*.*', '', '7227/100', ''],
    ttyNames: ['TTY:', 'termin'],
    echo: false,
    extra: { hostexit },
    mapName: (n) => (n === 'dvifile' ? n : flatName(n).replace(/^.*\//, '')),
  });
  return { typ: r.terminal, ms: r.runMs };
}
