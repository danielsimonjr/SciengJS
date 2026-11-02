// Host functions of the T5 trial: the Pascal file model on a virtual file system.
// A file variable is a slot in WASM memory: a handle (bytes 0-3) and the
// element buffer `f^` (from byte 8). The program sees only the files of the
// virtual file system and the terminal. No host file is opened.

const FILE_SLOT = 8;
const NL = 10;

export class ExitSignal extends Error {
  constructor(code) { super(`program exit ${code}`); this.code = code; }
}

/**
 * @param {object} o
 * @param {Map<string, Uint8Array>} o.files the virtual file system (the key is the file name)
 * @param {string[]} [o.terminal] the lines of terminal input
 * @param {(name:string)=>string} [o.mapName] maps a Pascal file name to a key of `files`
 * @param {{input:number, output:number}} o.std the slot addresses of `input` and `output`
 * @param {Record<string, Function>} [o.extra] more imports (external procedures)
 */
export class Host {
  constructor(o) {
    this.files = o.files;
    this.mapName = o.mapName ?? ((n) => n);
    this.std = o.std;
    this.extra = o.extra ?? {};
    this.ttyNames = new Set(o.ttyNames ?? ['TTY:']);
    this.echoInput = o.echo ?? true;
    const term = '\n' + (o.terminal ?? []).map((l) => l + '\n').join('');
    this.termIn = { data: Buffer.from(term, 'latin1'), pos: 0, text: true, es: 1, reading: true, tty: true };
    this.termOut = [];
    this.handles = [null];
    this.mem = null;
    this.dv = null;
  }

  attach(instance) {
    this.instance = instance;
    this.mem = new Uint8Array(instance.exports.memory.buffer);
    this.dv = new DataView(instance.exports.memory.buffer);
  }

  terminalText() {
    // Pascal ends an incomplete last line of the terminal at the end of the program
    if (this.termOut.length && this.termOut[this.termOut.length - 1] !== NL) this.termOut.push(NL);
    return Buffer.from(this.termOut).toString('latin1');
  }

  /** Store every file that is still open for writing. */
  finish() {
    for (const h of this.handles) if (h && !h.reading && !h.tty && !h.closed) this.flush(h);
  }

  flush(h) {
    // Pascal ends an incomplete last line of a text file
    if (h.text && h.out.length && h.out[h.out.length - 1] !== NL) h.out.push(NL);
    this.files.set(h.key, Uint8Array.from(h.out));
  }

  handleOf(slot) {
    let i = this.dv.getInt32(slot, true);
    if (i === 0) {
      // the standard files are open from the start
      if (slot === this.std.output) i = this.newHandle(slot, { tty: true, reading: false, text: true, es: 1, out: this.termOut });
      else if (slot === this.std.input) i = this.newHandle(slot, this.termIn);
      else throw new Error(`file at ${slot} is not open`);
    }
    return this.handles[i];
  }

  newHandle(slot, h) {
    this.handles.push(h);
    const i = this.handles.length - 1;
    this.dv.setInt32(slot, i, true);
    if (h.reading) this.fill(slot, h);
    return i;
  }

  name(addr, len) {
    let s = Buffer.from(this.mem.subarray(addr, addr + len)).toString('latin1');
    return s.replace(/ +$/, '');
  }

  // put the current element into f^
  fill(slot, h) {
    const b = slot + FILE_SLOT;
    if (h.text) {
      const c = h.pos < h.data.length ? h.data[h.pos] : NL;
      this.mem[b] = c === NL ? 32 : c;
      return;
    }
    const at = h.pos * h.es;
    for (let k = 0; k < h.es; k++) this.mem[b + k] = at + k < h.data.length ? h.data[at + k] : 0;
  }

  // A terminal shows the line that the user types. The echo happens when the
  // program moves past the end of the previous line.
  echo(h) {
    if (!this.echoInput || !h.tty || h.data[h.pos] !== NL || h.pos + 1 >= h.data.length) return;
    let e = h.pos + 1;
    while (e < h.data.length && h.data[e] !== NL) e++;
    for (let k = h.pos + 1; k <= e; k++) this.termOut.push(h.data[k]);
  }

  eofOf(h) { return h.text ? h.pos >= h.data.length : h.pos * h.es >= h.data.length; }

  imports() {
    const env = {
      f_open: (slot, mode, nameAddr, nameLen, es) => {
        const raw = this.name(nameAddr, nameLen);
        const text = (mode & 2) !== 0;
        mode &= 1;
        if (this.ttyNames.has(raw)) {
          if (mode === 0) this.newHandle(slot, this.termIn);
          else this.newHandle(slot, { tty: true, reading: false, text: true, es: 1, out: this.termOut });
          return;
        }
        const key = this.mapName(raw, mode === 0 ? 'read' : 'write');
        if (mode === 0) {
          let data = key === null ? undefined : this.files.get(key);
          const ok = data !== undefined;
          if (!ok) data = new Uint8Array(0);
          if (text && data.length && data[data.length - 1] !== NL) data = Uint8Array.from([...data, NL]);
          this.newHandle(slot, { key, data, pos: 0, es, text, reading: true, err: ok ? 0 : 1 });
        } else {
          if (key === null) { this.newHandle(slot, { key, out: [], es, text, reading: false, err: 1 }); return; }
          this.newHandle(slot, { key, out: [], es, text, reading: false, err: 0 });
        }
      },
      f_close: (slot) => {
        const i = this.dv.getInt32(slot, true);
        const h = this.handles[i];
        if (!h) return;
        if (!h.reading && !h.tty && h.err === 0) this.flush(h);
        h.closed = true;
        this.dv.setInt32(slot, 0, true);
      },
      f_erstat: (slot) => this.handleOf(slot).err ?? 0,
      f_get: (slot) => {
        const h = this.handleOf(slot);
        this.echo(h);
        h.pos++;
        this.fill(slot, h);
      },
      f_put: (slot) => {
        const h = this.handleOf(slot);
        const b = slot + FILE_SLOT;
        for (let k = 0; k < h.es; k++) h.out.push(this.mem[b + k]);
      },
      f_eof: (slot) => (this.eofOf(this.handleOf(slot)) ? 1 : 0),
      f_eoln: (slot) => {
        const h = this.handleOf(slot);
        return h.pos >= h.data.length || h.data[h.pos] === NL ? 1 : 0;
      },
      f_wstr: (slot, addr, len, width) => {
        const h = this.handleOf(slot);
        for (let k = len; k < width; k++) h.out.push(32);
        for (let k = 0; k < len; k++) h.out.push(this.mem[addr + k]);
      },
      f_wint: (slot, v, width) => {
        const h = this.handleOf(slot);
        const s = String(v).padStart(width, ' ');
        for (let k = 0; k < s.length; k++) h.out.push(s.charCodeAt(k));
      },
      f_wchar: (slot, c, width) => {
        const h = this.handleOf(slot);
        for (let k = 1; k < width; k++) h.out.push(32);
        h.out.push(c & 255);
      },
      f_wreal: (slot, v, width, digits) => {
        const h = this.handleOf(slot);
        let s;
        if (digits >= 0) s = v.toFixed(digits);
        else {
          const e = v.toExponential(Math.max(1, width - 7)).replace(/e([+-])(\d)$/, 'e$10$2');
          s = (v < 0 ? '' : ' ') + e.toUpperCase();
        }
        s = s.padStart(width, ' ');
        for (let k = 0; k < s.length; k++) h.out.push(s.charCodeAt(k));
      },
      f_wln: (slot) => this.handleOf(slot).out.push(NL),
      f_break: () => {},
      f_rint: (slot) => {
        const h = this.handleOf(slot);
        const d = h.data;
        while (h.pos < d.length && (d[h.pos] === 32 || d[h.pos] === NL)) h.pos++;
        let s = '';
        if (d[h.pos] === 43 || d[h.pos] === 45) s += String.fromCharCode(d[h.pos++]);
        while (h.pos < d.length && d[h.pos] >= 48 && d[h.pos] <= 57) s += String.fromCharCode(d[h.pos++]);
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
      range_err: (line, v) => { throw new Error(`index ${v} outside the bounds at Pascal line ${line}`); },
      ...this.extra,
    };
    return { env };
  }
}
