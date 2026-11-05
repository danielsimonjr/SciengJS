import { isRenderError, RenderError } from "../errors.ts";
import { dviToSvg, type DviSvg } from "./dvi.ts";
import { runProgram, type EngineSymbols } from "./run.ts";
import { createSpecials, SPECIAL_UNIT_PER_PT } from "./specials.ts";
import type { TexTree } from "./vfs.ts";
import type { WasmModule } from "./wasm.ts";

/** The compiled engine and the files that it needs. */
export interface TexEngine {
  /** The compiled WASM module. */
  module: WasmModule;
  /** The symbol table of the engine. */
  symbols: EngineSymbols;
  /** The string pool of the engine (`tex.pool`). */
  pool: Uint8Array;
}

/** The inputs of one TeX render. */
export interface RenderTexOptions {
  engine: TexEngine;
  /** The format file and its name, for example `scieng.fmt`. */
  format: { name: string; bytes: Uint8Array };
  /**
   * The tree with the bundles: the macro files, the TFM files and the PFB files.
   * The render works on a fork of the tree, so the tree stays as it was.
   */
  tree: TexTree;
  /** The TeX source. */
  source: string | Uint8Array;
  /** The job name. The default is `job`. */
  jobName?: string;
  /** The time limit of the TeX run in milliseconds. */
  timeoutMs?: number;
  /** The bound on the bytes that the run writes. A run over it rejects with `E_LIMIT`. The default is 64 MiB. */
  maxOutputBytes?: number;
  /** The border of the SVG in SVG units. */
  margin?: number;
}

/** The result of one TeX render. */
export interface RenderTexResult extends Omit<DviSvg, "svg"> {
  svg: string;
  /** The text of the TeX log. */
  log: string;
  /** The text of the terminal. */
  terminal: string;
  /** The file names that the source tried to open and that escape the tree. Each open failed. */
  refused: string[];
  /** The DVI bytes. */
  dvi: Uint8Array;
  /** The first words of the specials that the converter did not handle. */
  ignoredSpecials: string[];
  /** The time of the TeX run in milliseconds. */
  texMs: number;
  /** The time of the DVI to SVG conversion in milliseconds. */
  svgMs: number;
}

const decode = (b: Uint8Array | undefined): string => {
  let s = "";
  if (b === undefined) return s;
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, Math.min(b.length, i + 8192)));
  return s;
};

/** The first TeX error of a log: the message after `! ` and the line number of the `l.<n>` line. */
function firstTexError(log: string, terminal: string): { message: string; line: number | undefined } {
  const text = log || terminal;
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.startsWith("!"));
  if (at < 0) return { message: "TeX produced no output", line: undefined };
  const message = lines[at]!.slice(1).trim();
  const lineRow = lines.slice(at).find((l) => /^l\.\d+/.test(l));
  return { message, line: lineRow === undefined ? undefined : Number(/^l\.(\d+)/.exec(lineRow)![1]) };
}

/**
 * Renders a TeX source to SVG: runs the engine with the format on a fork of the tree, then converts the DVI.
 * A source that makes TeX stop with no DVI rejects with `E_INPUT`, the first TeX error and its source line.
 * The run follows the rules of `runProgram` for `E_TIMEOUT` and `E_INPUT`. A failure of the DVI conversion is `E_INTERNAL`.
 */
export async function renderTex(o: RenderTexOptions): Promise<RenderTexResult> {
  const job = (o.jobName ?? "job").toLowerCase();
  const run = o.tree.fork();
  run.add("tex.pool", o.engine.pool);
  run.add(o.format.name, o.format.bytes);
  run.add(`${job}.tex`, typeof o.source === "string" ? utf8Bytes(o.source) : o.source);
  const t0 = performance.now();
  const r = await runProgram({
    module: o.engine.module,
    symbols: o.engine.symbols,
    files: run,
    terminal: [`&${o.format.name.replace(/\.fmt$/i, "")} ${job}`],
    ...(o.timeoutMs === undefined ? {} : { timeoutMs: o.timeoutMs }),
    ...(o.maxOutputBytes === undefined ? {} : { maxOutputBytes: o.maxOutputBytes }),
  });
  const texMs = performance.now() - t0;
  const dvi = run.written.get(`${job}.dvi`);
  const log = decode(run.written.get(`${job}.log`));
  if (dvi === undefined) {
    const err = firstTexError(log, r.terminal);
    throw new RenderError("E_INPUT", `TeX stopped with no output: ${err.message}`, err.line === undefined ? {} : { line: err.line });
  }
  const t1 = performance.now();
  const specials = createSpecials();
  let converted: DviSvg;
  try {
    converted = dviToSvg(
      dvi,
      (name) => {
        const tfm = run.get(`${name}.tfm`);
        return tfm ? { tfm, pfb: run.get(`${name}.pfb`) ?? null } : null;
      },
      { special: specials.special, unitPerPt: SPECIAL_UNIT_PER_PT, ...(o.margin === undefined ? {} : { margin: o.margin }) },
    );
  } catch (e) {
    if (isRenderError(e)) throw e;
    throw new RenderError("E_INTERNAL", `the DVI conversion failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const svgMs = performance.now() - t1;
  return { ...converted, log, terminal: r.terminal, refused: r.refused, dvi, ignoredSpecials: specials.ignored(), texMs, svgMs };
}

/** TeX reads bytes. A source string goes in as its UTF-8 bytes. */
function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
