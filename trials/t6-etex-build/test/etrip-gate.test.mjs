// Test of the e-TRIP gate (tools/etrip-gate.mjs).
// node --test trials/t6-etex-build/test/etrip-gate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeFile, parseReferenceDiffs, etripConstants, etripMessageOf, dropEchoText } from '../tools/etrip-gate.mjs';

const SET = 'This is SET, Version 3.141592653-2.6';
const TEX = 'This is TeX, Version 3.141592653';
const ETEX = 'This is e-TeX, Version 3.14159265-2.6 (TeX Live 2014)';
const ctx = {
  banner: SET, extraPrimitives: 0, reference: { lines: {}, offsets: {} },
  constants: { extramw: 38, extracs: 66, extrabf: 23, extrasv: 2 }, etripMessage: null,
};
const judge = (part, file, ref, out, c = ctx) => judgeFile({ part, file, refText: ref.join('\n') + '\n', outText: out.join('\n') + '\n', ctx: c });

test('banner line only: pass', () => {
  const r = judge(1, 'ctrip.log', [`${TEX} (INITEX)  4 JUL 1776 12:00`, 'a'], [`${SET} (INITEX)  4 JUL 1776 12:00`, 'a']);
  assert.deepEqual(r.problems, []);
});

test('a banner of another engine in the output: fail', () => {
  const r = judge(1, 'ctrip.log', [`${TEX} (INITEX)`, 'a'], [`${ETEX} (INITEX)`, 'a']);
  assert.equal(r.problems.length, 1);
});

test('one more changed line: fail', () => {
  const r = judge(1, 'ctrip.log', [`${TEX}`, 'a', 'b'], [`${SET}`, 'a', 'c']);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /b/);
});

test('a missing line: fail', () => {
  const r = judge(1, 'ctrip.log', ['a', 'b', 'c'], ['a', 'c']);
  assert.equal(r.problems.length, 1);
});

test('string statistics may differ (tripman A.5)', () => {
  const r = judge(1, 'ctripin.log', ['1326 strings of total length 23633', ' 47 strings out of 1674', ' 253 string characters out of 8367'],
    ['1444 strings of total length 25253', ' 47 strings out of 1756', ' 253 string characters out of 14747']);
  assert.deepEqual(r.problems, []);
});

test('a capacity line may differ in the capacity, not in the use', () => {
  assert.deepEqual(judge(1, 'ctrip.log', [' 2825 words of memory out of 3000'], [' 2825 words of memory out of 3999']).problems, []);
  assert.equal(judge(1, 'ctrip.log', [' 2825 words of memory out of 3000'], [' 2826 words of memory out of 3000']).problems.length, 1);
});

test('glue set rounding (etripman B.9 b): small change pass, large change fail', () => {
  assert.deepEqual(judge(3, 'eetrip.log', ['\\hbox(7.0+1.0)x16383.99998, glue set 1635.4 []'], ['\\hbox(7.0+1.0)x16383.99998, glue set 1635.40002 []']).problems, []);
  assert.equal(judge(3, 'eetrip.log', ['\\hbox(7.0+1.0)x16383.99998, glue set 1635.4 []'], ['\\hbox(7.0+1.0)x16383.99998, glue set 1636.4 []']).problems.length, 1);
});

test('memory usage statistics differ only in part 3 (etripman B.9 g)', () => {
  const ref = ['Memory usage before: 52&184; after: 36&178; still untouched: 1672'];
  const out = ['Memory usage before: 50&185; after: 36&179; still untouched: 672'];
  assert.deepEqual(judge(3, 'eetrip.log', ref, out).problems, []);
  assert.equal(judge(1, 'ctrip.log', ref, out).problems.length, 1);
});

test('the file name prefix ./ of the reference is ignored', () => {
  assert.deepEqual(judge(3, 'eetrip.log', ['(./etrip.tex ##'], ['(etrip.tex ##']).problems, []);
});

test('part 2: the extra memory words and control sequences of etripman A.4', () => {
  const ref = ['471 memory locations dumped; current usage is 96&278', '341 multiletter control sequences'];
  assert.deepEqual(judge(2, 'xtripin.log', ref, ['509 memory locations dumped; current usage is 134&278', '407 multiletter control sequences']).problems, []);
  assert.equal(judge(2, 'xtripin.log', ref, ['510 memory locations dumped; current usage is 134&278', '407 multiletter control sequences']).problems.length, 1);
  assert.equal(judge(2, 'xtripin.log', ref, ['509 memory locations dumped; current usage is 134&278', '408 multiletter control sequences']).problems.length, 1);
  const c = { ...ctx, extraPrimitives: 3 };
  assert.deepEqual(judge(2, 'xtripin.log', ref, ['509 memory locations dumped; current usage is 134&278', '410 multiletter control sequences'], c).problems, []);
});

test('part 2: stack positions grow by extrabf and extrasv', () => {
  const ref = [' 7i,7n,9p,113b,38s stack positions out of 200i,40n,60p,500b,600s'];
  assert.deepEqual(judge(2, 'xtrip.log', ref, [' 7i,7n,9p,136b,40s stack positions out of 200i,40n,60p,500b,600s']).problems, []);
  assert.equal(judge(2, 'xtrip.log', ref, [' 7i,7n,9p,137b,40s stack positions out of 200i,40n,60p,500b,600s']).problems.length, 1);
});

test('a line that the reference diff of e-TeX lists: pass; another line: fail', () => {
  const c = { ...ctx, reference: { lines: { 'xtrip.log': { removed: ['{restoring \\fam=-1}'], added: [] } }, offsets: {} } };
  assert.deepEqual(judge(2, 'xtrip.log', ['a', '{restoring \\fam=-1}', 'b'], ['a', 'b'], c).problems, []);
  assert.equal(judge(2, 'xtrip.log', ['a', '{restoring \\count=-1}', 'b'], ['a', 'b'], c).problems.length, 1);
});

test('part 2: a statistic that must grow and stays the same: fail', () => {
  assert.equal(judge(2, 'xtripin.log', ['341 multiletter control sequences'], ['341 multiletter control sequences']).problems.length, 1);
  const dump = ['471 memory locations dumped; current usage is 96&278'];
  assert.equal(judge(2, 'xtripin.log', dump, dump).problems.length, 1);
  const stack = [' 7i,7n,9p,113b,38s stack positions out of 200i,40n,60p,500b,600s'];
  assert.equal(judge(2, 'xtrip.log', stack, stack).problems.length, 1);
});

test('part 3: a count that the offset and the new primitives must change and stays the same: fail', () => {
  const c = { ...ctx, extraPrimitives: 2, reference: { lines: {}, offsets: { 'multiletter control sequences': 1 } } };
  const same = [' 409 multiletter control sequences out of 2100'];
  assert.equal(judge(3, 'eetrip.log', same, same, c).problems.length, 1);
});

test('a line of the reference diff excuses one occurrence only', () => {
  const c = { ...ctx, reference: { lines: { 'xtrip.log': { removed: ['{restoring \\fam=-1}'], added: [] } }, offsets: {} } };
  assert.equal(judge(2, 'xtrip.log', ['a', '{restoring \\fam=-1}', '{restoring \\fam=-1}', 'b'], ['a', 'b'], c).problems.length, 1);
});

test('part 3: a count of the reference build is corrected by the offset of that build', () => {
  const c = { ...ctx, extraPrimitives: 2, reference: { lines: {}, offsets: { 'multiletter control sequences': 1, 'hyphenation exceptions': -1 } } };
  assert.deepEqual(judge(3, 'eetrip.log', [' 409 multiletter control sequences out of 15000+0'], [' 410 multiletter control sequences out of 2100'], c).problems, []);
  assert.equal(judge(3, 'eetrip.log', [' 409 multiletter control sequences out of 15000+0'], [' 409 multiletter control sequences out of 2100'], c).problems.length, 1);
  assert.deepEqual(judge(3, 'eetrip.log', [' 10 hyphenation exceptions out of 659'], [' 11 hyphenation exceptions out of 307'], c).problems, []);
});

test('part 3: the e-Trip message is the one that etrip.tex prints', () => {
  const c = { ...ctx, etripMessage: 'This is the e-Trip test [2021-01-28] for e-TeX v3.141592653-2.6.' };
  const ref = ['This is the e-Trip test [2014-01-22] for e-TeX v3.14159265-2.6.'];
  assert.deepEqual(judge(3, 'eetrip.log', ref, [c.etripMessage], c).problems, []);
  assert.equal(judge(3, 'eetrip.log', ref, ['This is the e-Trip test [2021-01-29] for e-TeX v3.141592653-2.6.'], c).problems.length, 1);
});

test('terminal: the echo of the input line joins the next line', () => {
  const r = judge(3, 'eetrip.fot', [`${ETEX} (preloaded format=etex)`, '**entering extended mode', '(./etrip.tex'],
    [`${SET} (INITEX)`, '**&etrip etrip', 'entering extended mode', '(etrip.tex'], { ...ctx, terminalInput: '&etrip etrip' });
  assert.deepEqual(r.problems, []);
});

test('parseReferenceDiffs reads the hunks of each compared file and the offsets', () => {
  const text = [
    'diff $testdir/trip.log ctrip.log', '+ diff SRCDIR/triptrap/trip.log ctrip.log',
    '7300c7296', '<  372 multiletter control sequences out of 2100', '---', '>  373 multiletter control sequences out of 15000+0',
    '7302c7302', '<  2 hyphenation exceptions out of 307', '---', '>  1 hyphenation exception out of 659',
    'mv tripos.tex xtripos.tex',
    'diff ctrip.log xtrip.log', '1769d1769', '< {restoring \\fam=-1}',
  ].join('\n');
  const r = parseReferenceDiffs(text);
  assert.deepEqual(r.lines['xtrip.log'], { removed: ['{restoring \\fam=-1}'], added: [] });
  assert.deepEqual(r.offsets, { 'multiletter control sequences': 1, 'hyphenation exceptions': -1 });
});

test('etripConstants reads the numbers of etripman.tex', () => {
  const t = '\\def\\minps{32000}\n\\def\\extracs{66} % x\n\\def\\extrasv{2}\n\\def\\extrabf{23}\n\\def\\extramw{38}\n';
  assert.deepEqual(etripConstants(t), { extramw: 38, extracs: 66, extrabf: 23, extrasv: 2 });
});

test('etripMessageOf reads the definitions of etrip.tex, with spaces before the brace', () => {
  const t = ['\\def\\etripdate   {2021-01-28}', '\\def\\texversion  {3.141592653}', '\\def\\etripversion{2.6}'].join('\n');
  assert.equal(etripMessageOf(t), 'This is the e-Trip test [2021-01-28] for e-TeX v3.141592653-2.6.');
});

test('dropEchoText keeps the line ends: no extra empty line', () => {
  assert.equal(dropEchoText('B\n** &trip  trip \n(trip.tex ##\nend\n', ' &trip  trip '), 'B\n**(trip.tex ##\nend\n');
});
