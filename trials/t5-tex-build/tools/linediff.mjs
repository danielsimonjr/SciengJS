// Line difference of two texts (longest common subsequence), in a unified-like form.
// Returns the changed hunks; each line has a prefix: ' ' same, '-' only in a, '+' only in b.

export function lineDiff(aText, bText, context = 2) {
  const a = aText.replace(/\r\n/g, '\n').split('\n');
  const b = bText.replace(/\r\n/g, '\n').split('\n');
  const n = a.length, m = b.length;
  // trim the common head and tail to keep the table small
  let head = 0;
  while (head < n && head < m && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < n - head && tail < m - head && a[n - 1 - tail] === b[m - 1 - tail]) tail++;
  const A = a.slice(head, n - tail), B = b.slice(head, m - tail);
  const N = A.length, M = B.length;
  const w = M + 1;
  const L = new Int32Array((N + 1) * w);
  for (let i = N - 1; i >= 0; i--) {
    for (let j = M - 1; j >= 0; j--) {
      L[i * w + j] = A[i] === B[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    }
  }
  const ops = [];
  for (let k = 0; k < head; k++) ops.push([' ', a[k], k + 1, k + 1]);
  let i = 0, j = 0;
  while (i < N || j < M) {
    if (i < N && j < M && A[i] === B[j]) { ops.push([' ', A[i], head + i + 1, head + j + 1]); i++; j++; }
    else if (j < M && (i >= N || L[i * w + j + 1] >= L[(i + 1) * w + j])) { ops.push(['+', B[j], null, head + j + 1]); j++; }
    else { ops.push(['-', A[i], head + i + 1, null]); i++; }
  }
  for (let k = 0; k < tail; k++) ops.push([' ', a[n - tail + k], n - tail + k + 1, m - tail + k + 1]);
  const changed = ops.filter((o) => o[0] !== ' ').length;
  // hunks with context
  const keep = new Uint8Array(ops.length);
  ops.forEach((o, k) => {
    if (o[0] !== ' ') for (let d = -context; d <= context; d++) if (k + d >= 0 && k + d < ops.length) keep[k + d] = 1;
  });
  let out = '';
  let prev = false;
  ops.forEach((o, k) => {
    if (!keep[k]) { prev = false; return; }
    if (!prev) out += `@@ a ${o[2] ?? '-'} b ${o[3] ?? '-'}\n`;
    out += o[0] + o[1] + '\n';
    prev = true;
  });
  return {
    changedLines: changed,
    removed: ops.filter((o) => o[0] === '-').length,
    added: ops.filter((o) => o[0] === '+').length,
    text: out,
  };
}
