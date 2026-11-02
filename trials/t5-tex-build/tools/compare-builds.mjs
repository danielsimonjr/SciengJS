// Compare the WASM sha256 of two build.json files: the compiler output must not
// depend on the system or the runtime. Exit status 1 when one program differs.
import fs from 'node:fs';

const [a, b] = process.argv.slice(2).map((p) => JSON.parse(fs.readFileSync(p, 'utf8')));
const rows = a.programs.map((p) => {
  const q = b.programs.find((x) => x.name === p.name);
  return { name: p.name, same: !!q && q.wasmSha256 === p.wasmSha256, a: p.wasmSha256, b: q?.wasmSha256 };
});
console.log(JSON.stringify({ a: `${a.runtime} ${a.platform}`, b: `${b.runtime} ${b.platform}`, rows }));
if (rows.some((r) => !r.same)) process.exitCode = 1;
