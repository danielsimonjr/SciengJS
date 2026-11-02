// Build the e-TeX programs of T6 from the pinned sources.
// node build.mjs <sources-dir> <build-dir>
// The sources dir must be a new, empty dir or a dir of an earlier run of this tool. The tool
// downloads each pinned file that is not there yet and checks each sha256: the Knuth files
// of T5, the TeX Live 2023 source tarball and the tlnet-final 2023 package archives.
// It extracts the e-TeX files of the tarball into <sources>/tl and the package archives into
// <sources>/texmf with the system tar (cwd set, relative names). Then it tangles and compiles
// each program of config.json and writes build.json with the sizes, times and the added primitives.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchPinned, buildProgram, runtimeName, sha } from '../../t5-tex-build/tools/build-lib.mjs';
import { addedPrimitives } from './primitives.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const trial = path.resolve(here, '..');
const t5 = path.resolve(trial, '../t5-tex-build');
const config = JSON.parse(fs.readFileSync(path.join(trial, 'config.json'), 'utf8'));
const knuth = JSON.parse(fs.readFileSync(path.resolve(trial, config.knuthSources), 'utf8')).sources;
const [srcArg, buildArg] = process.argv.slice(2);
if (!srcArg || !buildArg) {
  console.error('usage: build.mjs <sources-dir> <build-dir>');
  process.exit(2);
}
const srcDir = path.resolve(srcArg), buildDir = path.resolve(buildArg);
const dirs = { knuth: path.join(srcDir, 'knuth'), archives: path.join(srcDir, 'archives'), tl: path.join(srcDir, 'tl'), texmf: path.join(srcDir, 'texmf') };
for (const d of [buildDir, ...Object.values(dirs)]) fs.mkdirSync(d, { recursive: true });
const ua = 'sciengjs-trial-t6';
const out = { sources: [], programs: [], runtime: runtimeName(), platform: `${process.platform}-${process.arch}` };
const t0 = performance.now();

for (const f of knuth.files) {
  out.sources.push({ path: `knuth/${f.path}`, ...await fetchPinned({ url: knuth.base + f.path, sha256: f.sha256, dest: path.join(dirs.knuth, f.path), userAgent: ua }) });
}
/** Extract members of an archive into a dir; tar runs in the dir with a relative archive name. */
const untar = (archive, dest, members = []) => execFileSync('tar', ['-xJf', path.relative(dest, archive).split(path.sep).join('/'), ...members], { cwd: dest, stdio: 'pipe' });

const src = config.texLiveSource;
const srcArchive = path.join(dirs.archives, src.file);
out.sources.push({ path: `archives/${src.file}`, ...await fetchPinned({ url: src.url, sha256: src.sha256, dest: srcArchive, userAgent: ua }) });
const tlRoot = path.join(dirs.tl, src.root);
if (!fs.existsSync(path.join(tlRoot, 'etexdir', 'etex.ch'))) untar(srcArchive, dirs.tl, src.members);

for (const p of config.packages.files) {
  const a = path.join(dirs.archives, `${p.name}.tar.xz`);
  const r = await fetchPinned({ url: `${config.packages.base}${p.name}.tar.xz`, sha256: p.sha256, dest: a, userAgent: ua });
  const stamp = path.join(dirs.texmf, 'tlpkg', 'tlpobj', `${p.name}.tlpobj`);
  if (!fs.existsSync(stamp)) untar(a, dirs.texmf);
  out.sources.push({ path: `archives/${p.name}.tar.xz`, ...r });
}
out.fetchMs = Math.round(performance.now() - t0);

/** A source name: knuth:<path>, tl:<path under the web2c dir>, t5:<path in T5>, or a path in T6. */
const resolve = (name) => {
  const [k, rest] = name.includes(':') ? name.split(/:(.*)/s) : ['t6', name];
  const base = { knuth: dirs.knuth, tl: tlRoot, t5, t6: trial }[k];
  if (!base) throw new Error(`unknown source prefix in ${name}`);
  return path.join(base, rest);
};
out.changeFiles = {};
for (const prog of config.programs) {
  const changes = prog.changes.map((c) => ({ name: c, text: fs.readFileSync(resolve(c), 'latin1') }));
  for (const c of changes) out.changeFiles[c.name] ??= { sha256: sha(Buffer.from(c.text, 'latin1')), lines: c.text.split('\n').length - 1 };
  out.programs.push(await buildProgram({ name: prog.name, realBytes: prog.realBytes, buildDir, web: fs.readFileSync(resolve(prog.web), 'latin1'), changes }));
}
out.addedPrimitives = addedPrimitives(fs.readFileSync(path.join(trial, config.utilityChangeFile), 'latin1'));
out.texmf = dirs.texmf;
out.etexDir = path.join(tlRoot, 'etexdir');
// the trip dir of etrip.mjs: the trip files of tex.web and tripos.tex of the tarball
out.tripDir = path.join(srcDir, 'trip');
fs.mkdirSync(out.tripDir, { recursive: true });
for (const f of fs.readdirSync(path.join(dirs.knuth, 'tex'))) if (f.startsWith('trip')) fs.copyFileSync(path.join(dirs.knuth, 'tex', f), path.join(out.tripDir, f));
fs.copyFileSync(path.join(tlRoot, 'triptrap', 'tripos.tex'), path.join(out.tripDir, 'tripos.tex'));
fs.writeFileSync(path.join(buildDir, 'build.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, sources: out.sources.length }));
