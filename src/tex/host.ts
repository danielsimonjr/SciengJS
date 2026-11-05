// The host functions of the TeX engine: the Pascal file model on the virtual file tree.
// A file variable is a slot in WASM memory: a handle (bytes 0-3) and the element buffer `f^` (from byte 8).
// The engine sees only the files of the tree and the terminal. The engine has no import that starts a program,
// so `\write18` has no shell path: TeX treats stream 18 as the terminal and the log.
import { RenderError } from "../errors.ts";
import { isRenderError } from "../errors.ts";
import type { EngineImports, WasmInstance, WasmMemory } from "./wasm.ts";
import { treeName, type TexTree } from "./vfs.ts";

const FILE_SLOT = 8;
const NL = 10;
/** The number of host calls between two reads of the clock. */
const TICK_EVERY = 256;

/**
 * The default bound on the bytes that one run writes, in the terminal output and in the output files together.
 * It is 64 MiB: the log, the DVI and the terminal of a render hold well under 1 MiB, and the format build writes about 24 MB.
 * A caller sets another bound with `maxOutputBytes`, for example from the `maxMemoryMb` key of the configuration.
 */
export const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** Thrown by the `hostexit` import to leave the program with an exit code. */
export class ExitSignal extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`program exit ${code}`);
    this.code = code;
  }
}

interface Handle {
  tty?: boolean;
  data: Uint8Array;
  pos: number;
  es: number;
  text: boolean;
  reading: boolean;
  out: number[];
  err: number;
  /** The tree name of a file that the program writes. */
  name?: string;
  closed?: boolean;
}

/** The options of the host. */
export interface HostOptions {
  /** The virtual file tree. Output files go to the tree when the program closes them. */
  files: TexTree;
  /** The lines of terminal input. */
  terminal?: string[];
  /** The slot addresses of the standard files `input` and `output`. */
  std: { input: number; output: number };
  /** More imports (external procedures). */
  extra?: Record<string, (...args: number[]) => unknown>;
  /** The names that mean the terminal. The default is `TTY:`. */
  ttyNames?: string[];
  /**
   * Turns a file name of the program into the key of the tree. The default is `treeName`.
   * A caller key must return a name that `treeName` accepts, because the tree reduces the key again.
   */
  nameKey?: (raw: string) => string;
  /** Echo the terminal input lines to the terminal output, as a terminal does. The default is true. */
  echo?: boolean;
  /** The time in milliseconds on the `performance.now()` clock after which a host call throws `E_TIMEOUT`. */
  deadline?: number;
  /** The time limit in milliseconds, for the message of the timeout. */
  timeoutMs?: number;
  /** The bound on the bytes that the run writes to the terminal and to files. The default is `DEFAULT_MAX_OUTPUT_BYTES`. */
  maxOutputBytes?: number;
}

/** The host of one run. */
export class TexHost {
  private readonly files: TexTree;
  private readonly std: { input: number; output: number };
  private readonly extra: Record<string, (...args: number[]) => unknown>;
  private readonly ttyNames: Set<string>;
  private readonly echoInput: boolean;
  private readonly nameKey: (raw: string) => string;
  private readonly termIn: Handle;
  private readonly termOut: number[] = [];
  private readonly handles: (Handle | null)[] = [null];
  private mem!: Uint8Array;
  private dv!: DataView;
  private ticks = 0;
  private outputBytes = 0;
  private readonly maxOutputBytes: number;
  private readonly refusedNames: string[] = [];
  private readonly deadline: number | undefined;
  private readonly timeoutMs: number | undefined;

  constructor(o: HostOptions) {
    this.files = o.files;
    this.std = o.std;
    this.extra = o.extra ?? {};
    this.ttyNames = new Set(o.ttyNames ?? ["TTY:"]);
    this.echoInput = o.echo ?? true;
    this.nameKey = o.nameKey ?? treeName;
    this.deadline = o.deadline;
    this.timeoutMs = o.timeoutMs;
    this.maxOutputBytes = o.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const term = "\n" + (o.terminal ?? []).map((l) => l + "\n").join("");
    this.termIn = { data: latin1Bytes(term), pos: 0, text: true, es: 1, reading: true, tty: true, out: [], err: 0 };
  }

  /** Connects the host to the instance, whose memory the host functions read and write. */
  attach(instance: WasmInstance): void {
    const memory = instance.exports.memory as WasmMemory;
    this.mem = new Uint8Array(memory.buffer);
    this.dv = new DataView(memory.buffer);
  }

  /** The text that the program wrote to the terminal. */
  terminalText(): string {
    // Pascal ends an incomplete last line of the terminal at the end of the program
    if (this.termOut.length && this.termOut[this.termOut.length - 1] !== NL) this.termOut.push(NL);
    return latin1String(this.termOut);
  }

  /** The file names that the program tried to open and that escape the tree. Each open failed. */
  get refused(): string[] {
    return this.refusedNames.slice();
  }

  /** Stores every file that is still open for writing. */
  finish(): void {
    for (const h of this.handles) if (h && !h.reading && !h.tty && !h.closed) this.flush(h);
  }

  private flush(h: Handle): void {
    // Pascal ends an incomplete last line of a text file
    if (h.text && h.out.length && h.out[h.out.length - 1] !== NL) h.out.push(NL);
    if (h.name !== undefined) this.files.put(h.name, Uint8Array.from(h.out));
  }

  // Counts n bytes that the program writes. A run over the bound ends with E_LIMIT.
  private charge(n: number): void {
    this.outputBytes += n;
    if (this.outputBytes > this.maxOutputBytes) {
      throw new RenderError("E_LIMIT", `the TeX run wrote more than ${this.maxOutputBytes} bytes`);
    }
  }

  private tick(): void {
    if (this.deadline === undefined || ++this.ticks % TICK_EVERY !== 0) return;
    if (performance.now() > this.deadline) {
      throw new RenderError("E_TIMEOUT", `the TeX run did not finish within ${this.timeoutMs} ms`);
    }
  }

  private handleOf(slot: number): Handle {
    this.tick();
    let i = this.dv.getInt32(slot, true);
    if (i === 0) {
      // the standard files are open from the start
      if (slot === this.std.output) i = this.newHandle(slot, { tty: true, reading: false, text: true, es: 1, out: this.termOut, data: new Uint8Array(0), pos: 0, err: 0 });
      else if (slot === this.std.input) i = this.newHandle(slot, this.termIn);
      else throw new Error(`file at ${slot} is not open`);
    }
    return this.handles[i]!;
  }

  private newHandle(slot: number, h: Handle): number {
    this.handles.push(h);
    const i = this.handles.length - 1;
    this.dv.setInt32(slot, i, true);
    if (h.reading) this.fill(slot, h);
    return i;
  }

  private name(addr: number, len: number): string {
    let s = "";
    for (let k = 0; k < len; k++) s += String.fromCharCode(this.mem[addr + k]!);
    return s.replace(/ +$/, "");
  }

  // put the current element into f^
  private fill(slot: number, h: Handle): void {
    const b = slot + FILE_SLOT;
    if (h.text) {
      const c = h.pos < h.data.length ? h.data[h.pos]! : NL;
      this.mem[b] = c === NL ? 32 : c;
      return;
    }
    const at = h.pos * h.es;
    for (let k = 0; k < h.es; k++) this.mem[b + k] = at + k < h.data.length ? h.data[at + k]! : 0;
  }

  // A terminal shows the line that the user types. The echo happens when the
  // program moves past the end of the previous line.
  private echo(h: Handle): void {
    if (!this.echoInput || !h.tty || h.data[h.pos] !== NL || h.pos + 1 >= h.data.length) return;
    let e = h.pos + 1;
    while (e < h.data.length && h.data[e] !== NL) e++;
    this.charge(e - h.pos);
    for (let k = h.pos + 1; k <= e; k++) this.termOut.push(h.data[k]!);
  }

  private eofOf(h: Handle): boolean {
    return h.text ? h.pos >= h.data.length : h.pos * h.es >= h.data.length;
  }

  /** The import object for `WebAssembly.instantiate`. */
  imports(): EngineImports {
    const env: Record<string, (...args: number[]) => unknown> = {
      f_open: (slot, mode, nameAddr, nameLen, es) => {
        const raw = this.name(nameAddr, nameLen);
        const text = (mode & 2) !== 0;
        mode &= 1;
        if (this.ttyNames.has(raw)) {
          if (mode === 0) this.newHandle(slot, this.termIn);
          else this.newHandle(slot, { tty: true, reading: false, text: true, es: 1, out: this.termOut, data: new Uint8Array(0), pos: 0, err: 0 });
          return;
        }
        // A name that escapes the tree makes the open fail, as a missing file does, and the host records the name.
        // A failed open keeps the run alive: the LaTeX kernel probes `/dev/null` to learn about the system.
        let key: string | undefined;
        try {
          key = this.nameKey(raw);
        } catch (e) {
          if (!isRenderError(e)) throw e;
          this.refusedNames.push(raw);
        }
        if (mode === 0) {
          let data = key === undefined ? undefined : this.files.get(key);
          const ok = data !== undefined;
          if (data === undefined) data = new Uint8Array(0);
          if (text && data.length && data[data.length - 1] !== NL) data = Uint8Array.from([...data, NL]);
          this.newHandle(slot, { data, pos: 0, es, text, reading: true, out: [], err: ok ? 0 : 1 });
        } else {
          this.newHandle(slot, { name: key, data: new Uint8Array(0), pos: 0, out: [], es, text, reading: false, err: key === undefined ? 1 : 0 });
        }
      },
      f_close: (slot) => {
        const h = this.handles[this.dv.getInt32(slot, true)];
        if (!h) return;
        if (!h.reading && !h.tty && h.err === 0) this.flush(h);
        h.closed = true;
        this.dv.setInt32(slot, 0, true);
      },
      f_erstat: (slot) => this.handleOf(slot).err,
      f_get: (slot) => {
        const h = this.handleOf(slot);
        this.echo(h);
        h.pos++;
        this.fill(slot, h);
      },
      f_put: (slot) => {
        const h = this.handleOf(slot);
        const b = slot + FILE_SLOT;
        this.charge(h.es);
        for (let k = 0; k < h.es; k++) h.out.push(this.mem[b + k]!);
      },
      f_eof: (slot) => (this.eofOf(this.handleOf(slot)) ? 1 : 0),
      f_eoln: (slot) => {
        const h = this.handleOf(slot);
        return h.pos >= h.data.length || h.data[h.pos] === NL ? 1 : 0;
      },
      f_wstr: (slot, addr, len, width) => {
        const h = this.handleOf(slot);
        this.charge(Math.max(len, width));
        for (let k = len; k < width; k++) h.out.push(32);
        for (let k = 0; k < len; k++) h.out.push(this.mem[addr + k]!);
      },
      f_wint: (slot, v, width) => {
        const h = this.handleOf(slot);
        const s = String(v).padStart(width, " ");
        this.charge(s.length);
        for (let k = 0; k < s.length; k++) h.out.push(s.charCodeAt(k));
      },
      f_wchar: (slot, c, width) => {
        const h = this.handleOf(slot);
        this.charge(Math.max(1, width));
        for (let k = 1; k < width; k++) h.out.push(32);
        h.out.push(c & 255);
      },
      f_wreal: (slot, v, width, digits) => {
        const h = this.handleOf(slot);
        let s: string;
        if (digits >= 0) s = v.toFixed(digits);
        else {
          const e = v.toExponential(Math.max(1, width - 7)).replace(/e([+-])(\d)$/, "e$10$2");
          s = (v < 0 ? "" : " ") + e.toUpperCase();
        }
        s = s.padStart(width, " ");
        this.charge(s.length);
        for (let k = 0; k < s.length; k++) h.out.push(s.charCodeAt(k));
      },
      f_wln: (slot) => {
        const h = this.handleOf(slot);
        this.charge(1);
        h.out.push(NL);
      },
      f_break: () => {},
      f_rint: (slot) => {
        const h = this.handleOf(slot);
        const d = h.data;
        while (h.pos < d.length && (d[h.pos] === 32 || d[h.pos] === NL)) h.pos++;
        let s = "";
        if (d[h.pos] === 43 || d[h.pos] === 45) s += String.fromCharCode(d[h.pos++]!);
        while (h.pos < d.length && d[h.pos]! >= 48 && d[h.pos]! <= 57) s += String.fromCharCode(d[h.pos++]!);
        this.fill(slot, h);
        return Number(s) | 0;
      },
      f_rln: (slot) => {
        const h = this.handleOf(slot);
        while (h.pos < h.data.length && h.data[h.pos] !== NL) h.pos++;
        this.echo(h);
        h.pos++;
        this.fill(slot, h);
      },
      f_setpos: (slot, n) => {
        const h = this.handleOf(slot);
        const items = Math.floor(h.data.length / h.es);
        h.pos = n < 0 || n > items ? items : n;
        this.fill(slot, h);
      },
      f_curpos: (slot) => this.handleOf(slot).pos,
      range_err: (line, v) => {
        throw new Error(`index ${v} outside the bounds at Pascal line ${line}`);
      },
      ...this.extra,
    };
    return { env };
  }
}

function latin1Bytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
  return b;
}

function latin1String(bytes: number[]): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.slice(i, i + 8192));
  return s;
}
