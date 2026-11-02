'use strict';
// Builds a TeX format in two passes, the same way as the web2js initex.js:
//   pass 1 runs latex.ltx and dumps latex.fmt;
//   pass 2 loads latex.fmt, runs the preamble from the config file, and saves the memory image.
// Run from the web2js checkout (the working directory must hold tex.wasm and pgfsys-ximera.def).
// Environment: SCIENG_WEB2JS_DIR, SCIENG_FORMAT_CONFIG, SCIENG_BUILD_OUT (all required).
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const web2jsDir = required('SCIENG_WEB2JS_DIR');
const config = JSON.parse(fs.readFileSync(required('SCIENG_FORMAT_CONFIG'), 'utf8'));
const outDir = required('SCIENG_BUILD_OUT');
fs.mkdirSync(outDir, { recursive: true });

process.chdir(web2jsDir);
const requireFromWeb2js = createRequire(path.join(web2jsDir, 'package.json'));
const library = requireFromWeb2js('./library.js');
const { pages } = requireFromWeb2js('./commonMemory.js');

const code = new WebAssembly.Module(fs.readFileSync('tex.wasm'));

// Pass 1: latex.ltx and \dump.
const initexMemory = new WebAssembly.Memory({ initial: pages, maximum: pages });
library.setMemory(initexMemory.buffer);
library.setInput('\n*latex.ltx\n\\dump\n\n', () => {});
let wasm = new WebAssembly.Instance(code, { library, env: { memory: initexMemory } });
library.setWasmExports(wasm.exports);
wasm.exports.main();

// Pass 2: the preamble from the config. The memory image is written when the input ends.
const preamble = config.format.preamble.join('\n');
const input = '\n&latex\n' + preamble + '\n\\DeclareGraphicsExtensions{}\n';
const memory = new WebAssembly.Memory({ initial: pages, maximum: pages });
library.setMemory(memory.buffer);
library.setInput(input, () => {
  library.tex_final_end();
  fs.writeFileSync(path.join(outDir, 'core.dump'), new Uint8Array(memory.buffer));
  fs.writeFileSync(
    path.join(outDir, 'initex-files.json'),
    JSON.stringify(library.getUsedFiles(), null, '\t') + '\n'
  );
  process.exit(0);
});
wasm = new WebAssembly.Instance(code, { library, env: { memory } });
library.setWasmExports(wasm.exports);
wasm.exports.main();
