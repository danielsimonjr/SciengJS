// Shared TeX run logic: loads the web2js runner and the format, renders one input, returns the DVI.
// Used by the measure job and by the build job (the build collects the files of a pgfplots run).
// Environment: SCIENG_WEB2JS_DIR (the web2js checkout, which holds library.js and commonMemory.js).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function loadEngine(formatDir) {
  const web2jsDir = requiredEnv('SCIENG_WEB2JS_DIR');
  const requireFromWeb2js = createRequire(path.join(web2jsDir, 'package.json'));
  const library = requireFromWeb2js('./library.js');
  const { pages } = requireFromWeb2js('./commonMemory.js');
  const kpathsea = requireFromWeb2js('node-kpathsea');

  const t0 = performance.now();
  const module = new WebAssembly.Module(fs.readFileSync(path.join(formatDir, 'tex.wasm')));
  const wasmCompileMs = performance.now() - t0;

  return { library, kpathsea, pages, module, wasmCompileMs, coreDump: null };
}

export function setCoreDump(engine, bytes) {
  if (bytes.length !== engine.pages * 65536) {
    throw new Error(`core dump has ${bytes.length} bytes, expected ${engine.pages * 65536}`);
  }
  engine.coreDump = bytes;
}

// Renders one input. The caller sets the working directory first: TeX writes its DVI there.
export function renderTex(engine, workdir, inputName, sourceText) {
  const sourcePath = path.join(workdir, inputName);
  fs.writeFileSync(sourcePath, sourceText);
  engine.kpathsea.register(inputName, sourcePath);

  const { library, module, pages, coreDump } = engine;
  const t0 = performance.now();
  const memory = new WebAssembly.Memory({ initial: pages, maximum: pages });
  new Uint8Array(memory.buffer).set(coreDump);
  library.setMemory(memory.buffer);
  library.setInput(`${inputName}\n\end\n`);
  const instance = new WebAssembly.Instance(module, { library, env: { memory } });
  instance.exports.main();
  const texMs = performance.now() - t0;

  const dviName = path.parse(inputName).name + '.dvi';
  const dvi = fs.existsSync(path.join(workdir, dviName))
    ? fs.readFileSync(path.join(workdir, dviName))
    : null;
  return { texMs, dvi, usedFiles: library.getUsedFiles() };
}
