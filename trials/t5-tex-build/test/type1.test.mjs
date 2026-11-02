// Test of the Type 1 font reader: each glyph advance matches the TFM width,
// and each glyph gives an SVG path in the bounding box of the font.
// node --test trials/t5-tex-build/test/type1.test.mjs  (env T5_FONT_DIR, T5_TFM_DIR)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readType1 } from '../runtime/type1.mjs';
import { readTfm } from '../runtime/tfm.mjs';

const fontDir = process.env.T5_FONT_DIR;
const tfmDir = process.env.T5_TFM_DIR;
const fonts = ['cmr10', 'cmmi10', 'cmsy10', 'cmex10', 'cmr7', 'cmmi7', 'cmbx10'];

for (const name of fonts) {
  test(`${name}: advance widths and paths`, { skip: !fontDir && 'set T5_FONT_DIR and T5_TFM_DIR' }, () => {
    const font = readType1(new Uint8Array(fs.readFileSync(path.join(fontDir, `${name}.pfb`))));
    const tfm = readTfm(new Uint8Array(fs.readFileSync(path.join(tfmDir, `${name}.tfm`))));
    assert.equal(font.fontName.toLowerCase(), name);
    const [x0, y0, x1, y1] = font.fontBBox;
    let checked = 0;
    for (const [code, w] of tfm.widths) {
      const g = font.glyph(code);
      assert.ok(g, `${name}: no glyph for code ${code}`);
      // the advance of the charstring (hsbw, in 1/1000 em) is the TFM width
      assert.ok(Math.abs(g.advance - w * 1000) <= 1, `${name} code ${code}: advance ${g.advance}, TFM ${w * 1000}`);
      assert.match(g.d, /^(M[^M]*Z\s*)*$/, `${name} code ${code}: path ${g.d.slice(0, 40)}`);
      for (const m of g.d.matchAll(/-?\d+(\.\d+)?/g)) assert.ok(Number.isFinite(Number(m[0])));
      if (g.d) {
        assert.ok(g.bbox[0] >= x0 - 1 && g.bbox[1] >= y0 - 1 && g.bbox[2] <= x1 + 1 && g.bbox[3] <= y1 + 1, `${name} code ${code}: bbox ${g.bbox}`);
      }
      checked++;
    }
    assert.ok(checked >= 100, `${name}: only ${checked} glyphs`);
  });
}

test('cmr10: the glyph A has 2 closed subpaths', { skip: !fontDir && 'set T5_FONT_DIR' }, () => {
  const font = readType1(new Uint8Array(fs.readFileSync(path.join(fontDir, 'cmr10.pfb'))));
  const g = font.glyph(65);
  assert.equal((g.d.match(/M/g) ?? []).length, 2);
  assert.equal(font.encoding[65], 'A');
});
