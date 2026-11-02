// Test of the tangler (tools/tangle.mjs): the control codes that start a module.
import { test, expect } from 'bun:test';
import { tangle } from '../tools/tangle.mjs';

const web = (sep) => [
  '\\def\\x{limbo}',
  '@* Module one.',
  '@p program p; begin @<Set x@>; end.',
  `${sep}Module two.`,
  '@<Set x@>=',
  'x:=1',
  '',
].join('\n');

test('a line that ends in @ starts a module, as @ followed by a space does', () => {
  // tangle.web, section "Input": each line of input gets a space at its end
  const atSpace = tangle(web('@ '));
  const atEnd = tangle(web('@\n'));
  expect(atSpace.pascal).toMatch(/x := 1/);
  expect(atEnd.pascal).toBe(atSpace.pascal);
});
