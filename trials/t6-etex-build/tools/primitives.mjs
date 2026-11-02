/**
 * Find the primitives that a WEB change file adds.
 *
 * A change block starts with a line `@x`, has a line `@y`, and stops at a line `@z`.
 * The function ignores text outside the blocks. In each block it counts each
 * `primitive("NAME"` in the match text (`@x` to `@y`) and in the replacement text
 * (`@y` to `@z`). A name is added when the replacement text has it more times.
 *
 * @param {string} changeText the text of the change file (LF or CRLF line ends)
 * @returns {string[]} each added name once, in the order of its first occurrence
 */
export function addedPrimitives(changeText) {
  const order = [];
  const added = new Set();
  let match = null, repl = null, counts = null;
  const flush = () => {
    if (repl) for (const [name, n] of repl) if (n > (match.get(name) ?? 0)) added.add(name);
    match = repl = counts = null;
  };
  for (const line of String(changeText).split(/\r?\n/)) {
    if (line.startsWith('@x')) { flush(); match = new Map(); repl = new Map(); counts = match; }
    else if (line.startsWith('@y') && match) counts = repl;
    else if (line.startsWith('@z')) flush();
    else if (counts) {
      for (const m of line.matchAll(/primitive\(\s*"([^"]*)"/g)) {
        if (!order.includes(m[1])) order.push(m[1]);
        counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
      }
    }
  }
  flush();
  return order.filter((n) => added.has(n));
}
