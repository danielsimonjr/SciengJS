// Test of the reader of the dvisvgm specials (runtime/dvisvgm-specials.mjs).
// node --test trials/t6-etex-build/test/dvisvgm-specials.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpecials } from '../runtime/dvisvgm-specials.mjs';

const at = { x: 10, y: 20.5, unit: 1 };

test('raw: the position and the newline placeholders', () => {
  const s = createSpecials();
  assert.deepEqual(s.special('dvisvgm:raw <g transform="translate({?x},{?y})">{?nl}', at), { svg: '<g transform="translate(10,20.5)">\n' });
});

test('raw with a space after the colon', () => {
  const s = createSpecials();
  assert.deepEqual(s.special('dvisvgm: raw </g>', at), { svg: '</g>' });
});

test('bbox: width and height above the current point, in points', () => {
  const s = createSpecials();
  assert.deepEqual(s.special('dvisvgm:bbox 100.0 50.0', at), { box: [10, -29.5, 110, 20.5] });
  assert.deepEqual(s.special('dvisvgm:bbox 10 5 2', { x: 0, y: 0, unit: 0.5 }), { box: [0, -2.5, 5, 1] });
});

test('bbox lock, unlock and fix give no box', () => {
  const s = createSpecials();
  for (const t of ['dvisvgm:bbox lock', 'dvisvgm:bbox unlock', 'dvisvgm:bbox fix 0 0 10 10']) assert.equal(s.special(t, at), null);
});

test('color push and pop', () => {
  const s = createSpecials();
  assert.deepEqual(s.special('color push  rgb 1 0 0.5', at), { svg: '<g fill="rgb(255,0,128)">' });
  assert.deepEqual(s.special('color push gray 0', at), { svg: '<g fill="rgb(0,0,0)">' });
  assert.deepEqual(s.special('color push cmyk 0 1 1 0', at), { svg: '<g fill="rgb(255,0,0)">' });
  assert.deepEqual(s.special('color pop', at), { svg: '</g>' });
});

test('rawdef gives a defs element; rawset and rawput keep and place a fragment', () => {
  const s = createSpecials();
  assert.deepEqual(s.special('dvisvgm:rawdef <marker id="m"/>', at), { svg: '<defs><marker id="m"/></defs>' });
  assert.equal(s.special('dvisvgm:rawset a', at), null);
  assert.equal(s.special('dvisvgm:raw <use x="{?x}"/>', at), null);
  assert.equal(s.special('dvisvgm:endrawset', at), null);
  assert.deepEqual(s.special('dvisvgm:rawput a', { x: 3, y: 4, unit: 1 }), { svg: '<use x="3"/>' });
});

test('another special is listed and gives nothing', () => {
  const s = createSpecials();
  assert.equal(s.special('ps: gsave', at), null);
  assert.equal(s.special('papersize=10pt,10pt', at), null);
  assert.deepEqual(s.ignored(), ['ps:', 'papersize=10pt,10pt']);
});
