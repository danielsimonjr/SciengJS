import { test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { addedPrimitives } from '../../tools/tex/primitives.mjs';

const trial = path.resolve(import.meta.dir, '../../tools/tex');

test('a primitive in the match text and in the replacement text is not new', () => {
  const ch = ['@x', 'primitive("unless",expand_after,1);@/', '@y', 'primitive("unless",expand_after,1);@/',
    'primitive("expanded",expand_after,expanded_code);@/', '@z', ''].join('\n');
  expect(addedPrimitives(ch)).toEqual(['expanded']);
});

test('text outside the change blocks does not count', () => {
  const ch = ['primitive("outside",relax,0)', '@x', 'a', '@y', 'a', 'primitive("inside",relax,0)', '@z'].join('\n');
  expect(addedPrimitives(ch)).toEqual(['inside']);
});

test('utility.ch adds exactly the five utility primitives', () => {
  const ch = fs.readFileSync(path.join(trial, 'changes/utility.ch'), 'latin1');
  expect(addedPrimitives(ch).sort()).toEqual(['creationdate', 'expanded', 'filesize', 'pdfstrcmp', 'shellescape']);
});
