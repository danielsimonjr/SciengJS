// Build job: renders one sample with the built format through the kpsewhich lookup and writes the files it opened.
// Usage: node collect.mjs <format-dir> <sample.tex> <workdir> <used-out.json>
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, renderTex, setCoreDump } from './tex-engine.mjs';

const [formatDir, samplePath, workdir, usedOut] = process.argv.slice(2);
process.env.SCIENG_TEX_LOOKUP = 'kpsewhich';
fs.mkdirSync(workdir, { recursive: true });
process.chdir(workdir);

const engine = loadEngine(formatDir);
setCoreDump(engine, fs.readFileSync(path.join(formatDir, 'core.dump')));
const name = path.basename(samplePath);
const result = renderTex(engine, workdir, name, fs.readFileSync(samplePath, 'utf8'));
fs.writeFileSync(usedOut, JSON.stringify(result.usedFiles, null, '\t') + '\n');
console.log(JSON.stringify({ sample: name, texMs: Math.round(result.texMs), dvi: result.dvi !== null, files: Object.keys(result.usedFiles).length }));
