// Test of the trip test gate: only the banner line may differ in the logs.
// node --test trials/t5-tex-build/test/trip-gate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tripGate, buildBanner } from '../tools/trip-gate.mjs';

const TEX = 'This is TeX, Version 3.141592653';
const SET = 'This is SET, Version 3.141592653';
const files = ['tripin.log', 'tripin.fot', 'trip.log', 'trip.fot', 'trip.typ'];

/** A reference folder and an output folder; `out` gets the build banner unless changed. */
function fixture(change = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't5-gate-'));
  const ref = path.join(root, 'ref'), out = path.join(root, 'out');
  fs.mkdirSync(ref); fs.mkdirSync(out);
  for (const f of files) {
    const body = f === 'trip.typ' ? 'Options selected:\n  Starting page = *.*.*\n' : `${TEX} (INITEX)  4 JUL 1776 12:00\n** &trip  trip\nline two\n`;
    fs.writeFileSync(path.join(ref, f), body);
    fs.writeFileSync(path.join(out, f), body.replace(TEX, SET));
  }
  const results = { steps: { pltotf: { tmpPlDiffers: 0 } } };
  change({ ref, out, results });
  return { ref, out, results, done: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const run = (fx) => { try { return tripGate({ refDir: fx.ref, outDir: fx.out, banner: SET, tmpPlDiffers: fx.results.steps.pltotf.tmpPlDiffers }); } finally { fx.done(); } };

test('banner line only: pass', () => {
  const g = run(fixture());
  assert.equal(g.pass, true, JSON.stringify(g.problems));
});

test('one more changed line in trip.log: fail', () => {
  const g = run(fixture(({ out }) => fs.writeFileSync(path.join(out, 'trip.log'), `${SET} (INITEX)  4 JUL 1776 12:00\n** &trip  trip\nline 2\n`)));
  assert.equal(g.pass, false);
  assert.ok(g.problems.some((p) => p.startsWith('trip.log')));
});

test('a banner of another name than the build: fail', () => {
  const g = run(fixture(({ out }) => fs.writeFileSync(path.join(out, 'trip.fot'), `This is XYZ, Version 3.141592653 (INITEX)  4 JUL 1776 12:00\n** &trip  trip\nline two\n`)));
  assert.equal(g.pass, false);
  assert.ok(g.problems.some((p) => p.startsWith('trip.fot')));
});

test('the same text as the reference (no banner change): fail', () => {
  const g = run(fixture(({ ref, out }) => fs.copyFileSync(path.join(ref, 'tripin.log'), path.join(out, 'tripin.log'))));
  assert.equal(g.pass, false);
  assert.ok(g.problems.some((p) => p.startsWith('tripin.log')));
});

test('any difference in trip.typ: fail', () => {
  const g = run(fixture(({ out }) => fs.appendFileSync(path.join(out, 'trip.typ'), 'extra\n')));
  assert.equal(g.pass, false);
  assert.ok(g.problems.some((p) => p.startsWith('trip.typ')));
});

test('a missing output file: fail', () => {
  const g = run(fixture(({ out }) => fs.rmSync(path.join(out, 'tripin.fot'))));
  assert.equal(g.pass, false);
  assert.ok(g.problems.some((p) => p.startsWith('tripin.fot')));
});

test('tmp.pl differs from trip.pl: fail', () => {
  const g = run(fixture(({ results }) => { results.steps.pltotf.tmpPlDiffers = 2; }));
  assert.equal(g.pass, false);
  assert.ok(g.problems.some((p) => p.startsWith('tmp.pl')));
});

test('tmp.pl not compared: fail', () => {
  const g = run(fixture(({ results }) => { delete results.steps.pltotf.tmpPlDiffers; }));
  assert.equal(g.pass, false);
});

test('buildBanner reads the banner from the Pascal of the build, and fails without one', () => {
  assert.equal(buildBanner(`begin wterm('${SET}');\nwrite(log_file,'${SET}');`), SET);
  assert.throws(() => buildBanner("begin wterm('hello'); end"), /banner/);
});
