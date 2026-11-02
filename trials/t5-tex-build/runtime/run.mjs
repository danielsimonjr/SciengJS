// Run one compiled Pascal program on the virtual file system.
import { Host, ExitSignal } from './host.mjs';

/**
 * @param {object} o
 * @param {WebAssembly.Module} o.module the compiled program
 * @param {{symbols: Record<string, {addr:number}>}} o.symbols the symbol table of the compiler
 * @param {Map<string, Uint8Array>} o.files the virtual file system; output files are added to it
 * @param {string[]} [o.terminal] the terminal input lines
 * @param {(name:string, mode:string)=>string|null} [o.mapName]
 * @param {Record<string, Function>} [o.extra]
 */
export async function runProgram(o) {
  const host = new Host({
    files: o.files,
    terminal: o.terminal,
    mapName: o.mapName,
    std: { input: o.symbols.symbols.input.addr, output: o.symbols.symbols.output.addr },
    extra: o.extra,
    ttyNames: o.ttyNames,
    echo: o.echo,
  });
  const t0 = performance.now();
  const instance = await WebAssembly.instantiate(o.module, host.imports());
  host.attach(instance);
  const t1 = performance.now();
  let exit = 0;
  try {
    instance.exports.main();
  } catch (e) {
    if (e instanceof ExitSignal) exit = e.code;
    else {
      if (instance.exports.line) e.message += ` (Pascal line ${instance.exports.line.value})`;
      throw e;
    }
  } finally {
    host.finish();
  }
  const t2 = performance.now();
  return { terminal: host.terminalText(), exit, instantiateMs: t1 - t0, runMs: t2 - t1, instance, host };
}
