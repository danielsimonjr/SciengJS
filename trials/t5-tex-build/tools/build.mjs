// Build every program of the trial from the pinned sources.
// node build.mjs <sources-dir> <build-dir>
// It downloads each source that is not in the sources dir yet (pinned sha256),
// then tangles and compiles each program of config.json. It prints the sizes and times as JSON.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPinned, buildProgram, runtimeName } from './build-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const trial = path.resolve(here, '..');
const config = JSON.parse(fs.readFileSync(path.join(trial, 'config.json'), 'utf8'));
const [srcDir, buildDir] = process.argv.slice(2);
if (!srcDir || !buildDir) {
  console.error('usage: build.mjs <sources-dir> <build-dir>');
  process.exit(2);
}
fs.mkdirSync(buildDir, { recursive: true });

const out = { sources: [], programs: [], runtime: runtimeName(), platform: `${process.platform}-${process.arch}` };
for (const f of config.sources.files) {
  const r = await fetchPinned({ url: config.sources.base + f.path, sha256: f.sha256, dest: path.join(srcDir, f.path), userAgent: 'sciengjs-trial-t5' });
  out.sources.push({ path: f.path, ...r });
}

for (const prog of config.programs) {
  out.programs.push(await buildProgram({
    name: prog.name, realBytes: prog.realBytes, buildDir,
    web: fs.readFileSync(path.join(srcDir, prog.web), 'latin1'),
    changes: prog.changes.map((c) => ({ name: c, text: fs.readFileSync(path.join(trial, c), 'latin1') })),
  }));
}
const lines = (files) => files.map((f) => ({ file: f, lines: fs.readFileSync(path.join(trial, f), 'utf8').split('\n').length - 1 }));
out.compilerLines = lines(config.compilerFiles);
out.runtimeLines = lines(config.runtimeFiles);
fs.writeFileSync(path.join(buildDir, 'build.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
