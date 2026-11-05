// Runs one compiled Pascal program (the TeX engine) on the virtual file tree.
import { isRenderError, RenderError } from "../errors.ts";
import { ExitSignal, TexHost } from "./host.ts";
import type { TexTree } from "./vfs.ts";
import { instantiate, type WasmModule } from "./wasm.ts";

/** The symbol table that the engine compiler writes next to the WASM file. */
export interface EngineSymbols {
  symbols: Record<string, { addr: number }>;
}

/** The inputs of one run. */
export interface RunOptions {
  /** The compiled engine. */
  module: WasmModule;
  /** The symbol table of the engine. */
  symbols: EngineSymbols;
  /** The virtual file tree. The program writes its output files to the tree. */
  files: TexTree;
  /** The lines of terminal input. */
  terminal?: string[];
  /**
   * The time limit in milliseconds. The host checks the clock at the file calls of the program.
   * A program that loops without a file call needs a thread that the caller can end: the render worker.
   */
  timeoutMs?: number;
  /** Echo the terminal input to the terminal output. The default is true. */
  echo?: boolean;
  /** The bound on the bytes that the run writes. A run over it ends with `E_LIMIT`. The default is `DEFAULT_MAX_OUTPUT_BYTES` (64 MiB). */
  maxOutputBytes?: number;
}

/** The result of one run. */
export interface RunResult {
  /** The text that the program wrote to the terminal. */
  terminal: string;
  /** The exit code. */
  exit: number;
  /** The file names that the program tried to open and that escape the tree. Each open failed. */
  refused: string[];
  /** The time to instantiate the module, in milliseconds. */
  instantiateMs: number;
  /** The time of the program, in milliseconds. */
  runMs: number;
}

/**
 * Runs the engine once. The host gives the engine the files of the tree and the terminal, and nothing else.
 * A run that writes more than `maxOutputBytes` ends with `E_LIMIT`. A run that passes `timeoutMs` ends with `E_TIMEOUT`. An open of a name that escapes the tree fails like a missing file, and `refused` lists the name.
 * Any other failure of the program ends with `E_INTERNAL`.
 */
export async function runProgram(o: RunOptions): Promise<RunResult> {
  const std = { input: o.symbols.symbols.input?.addr, output: o.symbols.symbols.output?.addr };
  if (std.input === undefined || std.output === undefined) {
    throw new RenderError("E_INTERNAL", "the engine symbol table has no input or output file");
  }
  const t0 = performance.now();
  const host = new TexHost({
    files: o.files,
    terminal: o.terminal,
    std: { input: std.input, output: std.output },
    echo: o.echo,
    ...(o.maxOutputBytes === undefined ? {} : { maxOutputBytes: o.maxOutputBytes }),
    extra: {
      hostexit: (code) => {
        throw new ExitSignal(code);
      },
    },
    ...(o.timeoutMs === undefined ? {} : { deadline: t0 + o.timeoutMs, timeoutMs: o.timeoutMs }),
  });
  const instance = await instantiate(o.module, host.imports());
  host.attach(instance);
  const t1 = performance.now();
  let exit = 0;
  try {
    (instance.exports.main as () => void)();
  } catch (e) {
    if (e instanceof ExitSignal) exit = e.code;
    else if (isRenderError(e)) throw e;
    else if (e instanceof RangeError) throw new RenderError("E_LIMIT", `the TeX engine ran out of stack: ${e.message}`);
    else throw new RenderError("E_INTERNAL", `the TeX engine failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    host.finish();
  }
  const t2 = performance.now();
  return { terminal: host.terminalText(), exit, refused: host.refused, instantiateMs: t1 - t0, runMs: t2 - t1 };
}
