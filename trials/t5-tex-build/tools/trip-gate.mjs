// The pass rule of the trip test of the trial (tripman.tex, Appendix A).
// node trip-gate.mjs <reference-dir> <out-dir> <pascal-file>
//   reads <out-dir>/trip-results.json for the tmp.pl result; exit status 1 on a failure.
// Rule: each compared file exists; trip.typ and tmp.pl have no difference; each log and
// fot file has exactly one removed and one added line: the banner line of the reference
// and the same line with the banner of the build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineDiff } from './linediff.mjs';

export const TEX_BANNER = 'This is TeX, Version 3.141592653';
const BANNER_FILES = ['tripin.log', 'tripin.fot', 'trip.log', 'trip.fot'];
const EXACT_FILES = ['trip.typ'];

/** The banner of the build, from its tangled Pascal (tex.web section 2, the macro `banner`). */
export function buildBanner(pascalText) {
  const m = /'(This is [^'\r\n,]+, Version 3\.141592653)'/.exec(pascalText);
  if (!m) throw new Error('trip gate: no banner in the Pascal of the build');
  return m[1];
}

/**
 * @param {{refDir:string, outDir:string, banner:string, tmpPlDiffers:number|undefined}} o
 * @returns {{pass:boolean, problems:string[]}}
 */
export function tripGate({ refDir, outDir, banner, tmpPlDiffers }) {
  const problems = [];
  const text = (p) => fs.readFileSync(p, 'latin1');
  const diffOf = (f) => {
    const mine = path.join(outDir, f), ref = path.join(refDir, f);
    if (!fs.existsSync(mine)) { problems.push(`${f}: output missing`); return null; }
    if (!fs.existsSync(ref)) { problems.push(`${f}: reference missing`); return null; }
    return lineDiff(text(ref), text(mine));
  };
  for (const f of BANNER_FILES) {
    const d = diffOf(f);
    if (!d) continue;
    if (banner === TEX_BANNER) {
      if (d.removed || d.added) problems.push(`${f}: ${d.removed} removed, ${d.added} added; expected none`);
      continue;
    }
    const [r] = d.removedLines, [a] = d.addedLines;
    const ok = d.removed === 1 && d.added === 1 && r.includes(TEX_BANNER) && a === r.replace(TEX_BANNER, banner);
    if (!ok) problems.push(`${f}: ${d.removed} removed, ${d.added} added; expected only the banner line`);
  }
  for (const f of EXACT_FILES) {
    const d = diffOf(f);
    if (d && (d.removed || d.added)) problems.push(`${f}: ${d.removed} removed, ${d.added} added; expected none`);
  }
  if (tmpPlDiffers !== 0) problems.push(`tmp.pl: ${tmpPlDiffers ?? 'not compared'} lines differ from trip.pl; expected 0`);
  return { pass: problems.length === 0, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [refDir, outDir, pascalFile] = process.argv.slice(2);
  if (!pascalFile) {
    console.error('usage: trip-gate.mjs <reference-dir> <out-dir> <pascal-file>');
    process.exit(2);
  }
  const results = JSON.parse(fs.readFileSync(path.join(outDir, 'trip-results.json'), 'utf8'));
  const g = tripGate({ refDir, outDir, banner: buildBanner(fs.readFileSync(pascalFile, 'latin1')), tmpPlDiffers: results.steps?.pltotf?.tmpPlDiffers });
  console.log(JSON.stringify(g));
  if (!g.pass) process.exitCode = 1;
}
