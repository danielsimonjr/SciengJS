// Gate of the e-TRIP build: the outputs of the reference build of TeX, of e-TeX
// and of e-Trip (see etripman.tex A.4-B.9) are compared with the outputs of a
// new build. Node 22, no dependencies.

import fs from 'node:fs';
import path from 'node:path';
import { lineDiff } from './linediff.mjs';

// The comparisons of the gate: reference directory, reference file, output file.
// An output name that starts with 'c' belongs to part 1, 'x' to part 2, 'e' to
// part 3. ('trip' reads the reference from triptrap, 'etrip' from the directory
// of the reference build of e-TeX, 'out' from our own output directory.)
export const COMPARISONS = [
  ['trip', 'tripin.log', 'ctripin.log'],
  ['trip', 'tripin.fot', 'ctripin.fot'],
  ['trip', 'trip.log', 'ctrip.log'],
  ['trip', 'trip.fot', 'ctrip.fot'],
  ['trip', 'trip.typ', 'ctrip.typ'],
  ['trip', 'tripos.tex', 'ctripos.tex'],
  ['out', 'ctripin.log', 'xtripin.log'],
  ['out', 'ctrip.log', 'xtrip.log'],
  ['out', 'ctrip.fot', 'xtrip.fot'],
  ['out', 'ctrip.typ', 'xtrip.typ'],
  ['trip', 'tripos.tex', 'xtripos.tex'],
  ['etrip', 'etripin.log', 'eetripin.log'],
  ['etrip', 'etrip.log', 'eetrip.log'],
  ['etrip', 'etrip.fot', 'eetrip.fot'],
  ['etrip', 'etrip.typ', 'eetrip.typ'],
  ['etrip', 'etrip.out', 'eetrip.out'],
];

const MULTILETTER = 'multiletter control sequences';
const kindOf = (kind) => (kind === 'hyphenation exception' ? 'hyphenation exceptions' : kind);
const COUNT_STAT = /^\s*(\d+) (multiletter control sequences|hyphenation exceptions?) out of/;

// \def\extramw{...}, \def\extracs{...}, \def\extrabf{...}, \def\extrasv{...}
// of etripman.tex.
export function etripConstants(text) {
  const value = (name) => {
    const m = String(text).match(new RegExp('\\\\def\\\\' + name + '\\{(\\d+)\\}'));
    return m === null ? undefined : Number(m[1]);
  };
  return {
    extramw: value('extramw'),
    extracs: value('extracs'),
    extrabf: value('extrabf'),
    extrasv: value('extrasv'),
  };
}

// A shell trace of the 'diff' runs of the reference build. A section starts at
// a line 'diff ...' or '$DIFF ...' (never at '+ diff ...'); its key is the
// basename of the last word. '< ' / '> ' lines are collected; hunk headers and
// '---' are skipped; any other line ends the section.
export function parseReferenceDiffs(text) {
  const lines = {};
  const hunks = {};
  let curKey = null;
  let curHunk = null;
  for (const row of String(text).split(/\r?\n/)) {
    if (/^(diff |\$DIFF )/.test(row)) {
      const key = String(row.trim().split(/\s+/).pop()).replace(/^.*[/\\]/, '');
      if (lines[key] === undefined) lines[key] = { removed: [], added: [] };
      if (hunks[key] === undefined) hunks[key] = [];
      curKey = key;
      curHunk = null;
    } else if (row.startsWith('+ ')) {
      // an echoed command of the shell trace: never a marker of a diff section
    } else if (curKey === null) {
      // outside a section
    } else if (row.startsWith('< ') || row.startsWith('> ')) {
      const dir = row.startsWith('< ') ? 'removed' : 'added';
      const line = row.slice(2);
      lines[curKey][dir].push(line);
      if (curHunk === null) {
        curHunk = { removed: [], added: [] };
        hunks[curKey].push(curHunk);
      }
      curHunk[dir].push(line);
    } else if (row === '---') {
      // the separator inside a hunk
    } else if (/^\d+(,\d+)?[acd]\d+(,\d+)?$/.test(row)) {
      // a hunk header starts a new hunk
      curHunk = null;
    } else {
      curKey = null;
      curHunk = null;
    }
  }
  // The offsets of the counts of the reference build (from 'ctrip.log' only).
  const offsets = {};
  for (const hunk of hunks['ctrip.log'] ?? []) {
    const n = Math.min(hunk.removed.length, hunk.added.length);
    for (let i = 0; i < n; i++) {
      const mr = hunk.removed[i].match(COUNT_STAT);
      const ma = hunk.added[i].match(COUNT_STAT);
      if (mr && ma && kindOf(mr[2]) === kindOf(ma[2])) {
        offsets[kindOf(mr[2])] = Number(ma[1]) - Number(mr[1]);
      }
    }
  }
  return { lines, offsets };
}

const BANNER_HEAD = /^This is (TeX|e-TeX|SET), Version \S+( \(TeX Live [^)]*\))?/;
const BANNER_CHECK = /^This is (TeX|e-TeX|SET), Version/;
const AFTER_BANNER = /^BANNER(?: \(INITEX\)| \(preloaded format=[^)]*\))/;
const FORMAT_DATE = /format=(\w+) \d+\.\d+\.\d+/g;
const PRINT_DATE = /  ?\d{1,2} [A-Z]{3} \d{4} \d\d:\d\d$/;
const DVIVERSION = /^(This is DVItype, Version \S+) \(TeX Live [^)]*\)/;
const TEXOUTPUT = /^' TeX output \d{4}\.\d\d\.\d\d:\d{4}'/;

function splitLines(text) {
  return String(text).replace(/\r\n/g, '\n').split('\n');
}

// The normal form of a line of a trip output.
function normaliseLine(line, fot) {
  let s = String(line);
  const m = s.match(BANNER_HEAD);
  if (m) s = 'BANNER' + s.slice(m[0].length);
  if (fot) s = s.replace(AFTER_BANNER, 'BANNER');
  s = s.replace(FORMAT_DATE, 'format=$1 DATE');
  s = s.replace(PRINT_DATE, ' DATE');
  s = s.split('(./').join('(');
  s = s.replace(DVIVERSION, '$1');
  s = s.replace(TEXOUTPUT, "' TeX output DATE'");
  return s;
}

// The echo line '**'+terminalInput of a terminal session is removed and '**' is
// prefixed to the line that follows it.
function dropTerminalEcho(outLines, terminalInput) {
  const echo = '**' + terminalInput;
  const res = [];
  for (let i = 0; i < outLines.length; i++) {
    if (outLines[i] === echo && i + 1 < outLines.length) {
      res.push('**' + outLines[i + 1]);
      ++i;
    } else {
      res.push(outLines[i]);
    }
  }
  return res;
}

/**
 * The text with the echo of the terminal input joined to the next line.
 * The line ends of the text stay as they are.
 * @param {string} text @param {string} terminalInput @returns {string}
 */
export function dropEchoText(text, terminalInput) {
  return dropTerminalEcho(splitLines(text), terminalInput).join('\n');
}

/**
 * The message that etrip.tex prints at its start, from its definitions of
 * \etripdate, \texversion and \etripversion (spaces may come before the brace).
 * @param {string} etripTex @returns {string}
 */
export function etripMessageOf(etripTex) {
  const def = (name) => {
    const v = String(etripTex).match(new RegExp('\\\\def\\\\' + name + '\\s*\\{([^}]*)\\}'));
    return v === null ? '' : v[1];
  };
  return `This is the e-Trip test [${def('etripdate')}] for e-TeX v${def('texversion')}-${def('etripversion')}.`;
}

const GLUE_USE =/glue set (- )?(\d+\.\d+)/;
const GLUE_BLUR = /glue set (- )?\d+\.\d+/;
const STRING_STATS = [
  /^\s*\d+ strings of total length \d+$/,
  /^\s*\d+ strings out of \d+$/,
  /^\s*\d+ string characters out of \d+$/,
];
const MEMORY_STATS = [
  /^Memory usage before: /,
  /^\d+ memory locations dumped; current usage is /,
  /^\s*\d+ words of memory out of \d+$/,
];
const COUNTS_LINE = /^(\s*)(\d+) (multiletter control sequences|hyphenation exceptions?)( out of .*)?$/;
const MEMDUMP_LINE = /^(\d+) memory locations dumped; current usage is (\d+)&(\d+)$/;
const STACK_LINE = /^ (\d+)i,(\d+)n,(\d+)p,(\d+)b,(\d+)s stack positions out of (.*)$/;

function capacityText(s) {
  const i = s.lastIndexOf(' out of ');
  return i < 0 ? null : s.slice(0, i) + ' out of CAP';
}

// May a removed line r and an added line a of the diff be the same line of the
// trip output, up to an allowed difference of the new build?
function pairOk(r, a, part, ctx) {
  const cs = ctx.constants ?? {};
  const extra = ctx.extraPrimitives ?? 0;
  // (f) the counts; decided here, so that the capacity rule cannot explain
  //     away a line that belongs to a strict count rule
  const cr = r.match(COUNTS_LINE);
  const ca = a.match(COUNTS_LINE);
  if (cr && ca) {
    const kindR = kindOf(cr[3]);
    const kindA = kindOf(ca[3]);
    if (kindR !== kindA || (cr[4] === undefined) !== (ca[4] === undefined)) return false;
    if (part === 2) {
      return kindR === MULTILETTER
        && Number(ca[2]) - Number(cr[2]) === (cs.extracs ?? 0) + extra;
    }
    if (part === 3) {
      const offset = ((ctx.reference && ctx.reference.offsets) ? ctx.reference.offsets[kindR] : 0) ?? 0;
      return Number(ca[2]) === Number(cr[2]) - offset + (kindR === MULTILETTER ? extra : 0);
    }
    return false;
  }
  // (a) the rounding of the glue set
  const gr = r.match(GLUE_USE);
  const ga = a.match(GLUE_USE);
  if (gr && ga && r.replace(GLUE_BLUR, 'glue set X') === a.replace(GLUE_BLUR, 'glue set X')) {
    const vr = Number(gr[2]) * (gr[1] ? -1 : 1);
    const va = Number(ga[2]) * (ga[1] ? -1 : 1);
    if (Math.abs(va - vr) <= 0.0001) return true;
  }
  // (b) the string statistics
  for (const re of STRING_STATS) if (re.test(r) && re.test(a)) return true;
  // (g) part 2: the stack positions grow by extrabf and extrasv; stricter
  //     than the capacity rule
  if (part === 2) {
    const sr = r.match(STACK_LINE);
    const sa = a.match(STACK_LINE);
    if (sr && sa) {
      return sr[1] === sa[1] && sr[2] === sa[2] && sr[3] === sa[3]
        && Number(sa[4]) - Number(sr[4]) === (cs.extrabf ?? 0)
        && Number(sa[5]) - Number(sr[5]) === (cs.extrasv ?? 0)
        && sr[6] === sa[6];
    }
  }
  // (c) after the last ' out of ' the capacity may differ
  const capR = capacityText(r);
  if (capR !== null && capR === capacityText(a)) return true;
  // (d) part 3: the memory statistics of the reference build
  if (part === 3) {
    for (const re of MEMORY_STATS) if (re.test(r) && re.test(a)) return true;
  }
  // (e) part 3: the message that etrip.tex prints
  if (part === 3 && ctx.etripMessage
      && r.startsWith('This is the e-Trip test [') && a === ctx.etripMessage) return true;
  // (g) part 2: the memory words grow by extramw
  if (part === 2) {
    const dr = r.match(MEMDUMP_LINE);
    const da = a.match(MEMDUMP_LINE);
    if (dr && da) {
      const mw = cs.extramw ?? 0;
      return Number(da[1]) - Number(dr[1]) === mw
        && Number(da[2]) - Number(dr[2]) === mw
        && da[3] === dr[3];
    }
  }
  return false;
}

// The judgement of one comparison: problems of the reference file of the
// reference build against the same file of the new build.
export function judgeFile({ part, file, refText, outText, ctx }) {
  const problems = [];
  const fot = String(file).endsWith('.fot');
  let outLines = splitLines(outText);
  // 1. the echo of the terminal input joins the next line of the output
  if (fot && ctx.terminalInput) outLines = dropTerminalEcho(outLines, ctx.terminalInput);
  // 2. the banner of the output and the normal form of both texts
  for (const line of outLines) {
    if (BANNER_CHECK.test(line) && !line.startsWith(ctx.banner)) {
      problems.push(`${file}: banner ${line}`);
    }
  }
  const refN = splitLines(refText).map((l) => normaliseLine(l, fot));
  const outN = outLines.map((l) => normaliseLine(l, fot));
  // 3. the lines that differ
  const diff = lineDiff(refN.join('\n'), outN.join('\n'), 0);
  const added = diff.addedLines;
  // 4. pair the lines whose difference one of the rules explains
  const unused = new Array(added.length).fill(true);
  let restR = [];
  for (const r of diff.removedLines) {
    let hit = -1;
    for (let j = 0; j < added.length; j++) {
      if (unused[j] && pairOk(r, added[j], part, ctx)) {
        hit = j;
        break;
      }
    }
    if (hit >= 0) unused[hit] = false;
    else restR.push(r);
  }
  let restA = added.filter((_, j) => unused[j]);
  // 5. the lines that the reference build of e-TeX also changes there
  if (part === 2 || part === 3) {
    const key = part === 3 && file.length > 0 ? String(file).slice(1) : file;
    const known = ctx.reference && ctx.reference.lines ? ctx.reference.lines[key] : null;
    if (known) {
      const knownR = (known.removed ?? []).map((l) => normaliseLine(l, fot));
      const knownA = (known.added ?? []).map((l) => normaliseLine(l, fot));
      // each line of the reference diff excuses one occurrence only
      const consume = (rest, known) => {
        const left = [...known];
        return rest.filter((l) => {
          const i = left.indexOf(l);
          if (i < 0) return true;
          left.splice(i, 1);
          return false;
        });
      };
      restR = consume(restR, knownR);
      restA = consume(restA, knownA);
    }
  }
  // 6. one problem per remaining line; a removal and an addition at the same
  //    place are the two sides of one changed line
  const nPair = Math.min(restR.length, restA.length);
  for (const l of restR) problems.push(`${file}: removed "${l}"`);
  for (let i = nPair; i < restA.length; i++) problems.push(`${file}: added "${restA[i]}"`);
  // 7. a statistic that the new build must change and that stays the same
  //    gives no diff line; pair the k-th statistic of each kind of both texts
  if (part === 2 || part === 3) {
    const kinds = (lines) => {
      const by = new Map();
      for (const l of lines) {
        const c = l.match(COUNTS_LINE);
        // the hyphenation exceptions are not here: their count may stay the same
        const key = c ? (kindOf(c[3]) === MULTILETTER ? `count ${c[4] === undefined}` : null)
          : part === 2 && MEMDUMP_LINE.test(l) ? 'memdump'
            : part === 2 && STACK_LINE.test(l) ? 'stack' : null;
        if (key) by.set(key, [...(by.get(key) ?? []), l]);
      }
      return by;
    };
    const outBy = kinds(outN);
    for (const [key, refs] of kinds(refN)) {
      const outs = outBy.get(key) ?? [];
      refs.forEach((r, k) => {
        if (outs[k] === r && !pairOk(r, r, part, ctx)) problems.push(`${file}: statistic unchanged "${r}"`);
      });
    }
  }
  return { problems };
}

// The gate itself: pascal is the source of the engine, plDiffers counts the
// differences of the .pl files against the reference build (each must be 0).
export function etripGate({ tripDir, etripDir, outDir, pascal, plDiffers, extraPrimitives }) {
  const problems = [];
  const files = {};
  // the banner of the engine, e.g. 'This is SET, Version 3.141592653-2.6'
  const m = String(pascal).match(/'(This is [^'\r\n,]+, Version 3\.141592653)'\s*,\s*'(-[0-9.]+)'/);
  if (!m) throw new Error('etrip-gate: the banner literal is not in the pascal source');
  const banner = m[1] + m[2];
  // the reference build of e-TeX: its diff trace, its numbers, its date
  const reference = parseReferenceDiffs(fs.readFileSync(path.join(etripDir, 'etrip.diffs'), 'latin1'));
  const constants = etripConstants(fs.readFileSync(path.join(etripDir, 'etripman.tex'), 'latin1'));
  const etripMessage = etripMessageOf(fs.readFileSync(path.join(etripDir, 'etrip.tex'), 'latin1'));
  // the sources of the .pl files of the new build are those of the reference
  for (const [k, v] of Object.entries(plDiffers ?? {})) {
    if (Number(v) !== 0) problems.push(`${k}: the pl source differs by ${v}`);
  }
  // the terminal input of the runs that write the .fot files of the new build
  const TERMINAL_INPUT = {
    'ctrip.fot': ' &trip  trip ',
    'xtrip.fot': '&trip \\toksdef\\tokens=0 \\input trip',
    'eetrip.fot': '&etrip etrip',
  };
  for (const [dirName, refName, outName] of COMPARISONS) {
    const refDir = dirName === 'trip' ? tripDir : dirName === 'etrip' ? etripDir : outDir;
    const refPath = path.join(refDir, refName);
    const outPath = path.join(outDir, outName);
    let refText = null;
    let outText = null;
    let missing = 0;
    try {
      refText = fs.readFileSync(refPath, 'latin1');
    } catch {
      problems.push(`missing reference file ${refPath}`);
      ++missing;
    }
    try {
      outText = fs.readFileSync(outPath, 'latin1');
    } catch {
      problems.push(`missing output file ${outPath}`);
      ++missing;
    }
    files[outName] = { problems: missing };
    if (missing > 0) continue;
    // the reference of the part 2 .fot comparison is our own ctrip.fot; its
    // echo of the terminal input must be treated like the echo of the output
    if (dirName === 'out' && TERMINAL_INPUT[refName] !== undefined) {
      refText = dropEchoText(refText, TERMINAL_INPUT[refName]);
    }
    const part = outName.startsWith('c') ? 1 : outName.startsWith('x') ? 2 : 3;
    const ctx = {
      banner,
      extraPrimitives,
      reference,
      constants,
      etripMessage,
      // part 1 compares with the reference files of tex.web, which hold the echo too
      terminalInput: part === 1 ? null : TERMINAL_INPUT[outName] ?? null,
    };
    const judged = judgeFile({ part, file: outName, refText, outText, ctx });
    files[outName] = { problems: judged.problems.length };
    problems.push(...judged.problems);
  }
  return { pass: problems.length === 0, problems, files };
}
