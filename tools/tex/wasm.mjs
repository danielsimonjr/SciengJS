// WASM binary encoder.
// Writes the sections that the compiler needs: types, imports, functions,
// memory, globals, exports, code and data. No outside tool takes part.

export const I32 = 0x7f, F64 = 0x7c, VOID = 0x40;

export const OP = {
  unreachable: 0x00, nop: 0x01, block: 0x02, loop: 0x03, if: 0x04, else: 0x05, end: 0x0b,
  br: 0x0c, br_if: 0x0d, br_table: 0x0e, return: 0x0f, call: 0x10, drop: 0x1a, select: 0x1b,
  local_get: 0x20, local_set: 0x21, local_tee: 0x22, global_get: 0x23, global_set: 0x24,
  i32_load: 0x28, f64_load: 0x2b, i32_load8_s: 0x2c, i32_load8_u: 0x2d, i32_load16_s: 0x2e, i32_load16_u: 0x2f,
  i32_store: 0x36, f64_store: 0x39, i32_store8: 0x3a, i32_store16: 0x3b,
  i32_const: 0x41, f64_const: 0x44,
  i32_eqz: 0x45, i32_eq: 0x46, i32_ne: 0x47, i32_lt_s: 0x48, i32_gt_s: 0x4a, i32_le_s: 0x4c, i32_ge_s: 0x4e,
  f64_eq: 0x61, f64_ne: 0x62, f64_lt: 0x63, f64_gt: 0x64, f64_le: 0x65, f64_ge: 0x66,
  i32_add: 0x6a, i32_sub: 0x6b, i32_mul: 0x6c, i32_div_s: 0x6d, i32_rem_s: 0x6f,
  i32_and: 0x71, i32_or: 0x72, i32_xor: 0x73,
  f64_abs: 0x99, f64_neg: 0x9a, f64_trunc: 0x9d, f64_add: 0xa0, f64_sub: 0xa1, f64_mul: 0xa2, f64_div: 0xa3,
  f64_convert_i32_s: 0xb7,
};

export function uleb(n, out) {
  n >>>= 0;
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n !== 0) b |= 0x80;
    out.push(b);
  } while (n !== 0);
}

export function sleb(n, out) {
  n |= 0;
  for (;;) {
    const b = n & 0x7f;
    n >>= 7;
    if ((n === 0 && (b & 0x40) === 0) || (n === -1 && (b & 0x40) !== 0)) { out.push(b); return; }
    out.push(b | 0x80);
  }
}

const f64buf = new DataView(new ArrayBuffer(8));
export function f64bytes(x, out) {
  f64buf.setFloat64(0, x, true);
  for (let i = 0; i < 8; i++) out.push(f64buf.getUint8(i));
}

function strBytes(s, out) {
  const b = new TextEncoder().encode(s);
  uleb(b.length, out);
  for (const x of b) out.push(x);
}

function section(id, body, out) {
  out.push(id);
  uleb(body.length, out);
  for (let i = 0; i < body.length; i++) out.push(body[i]);
}

/** Module builder. */
export class ModuleBuilder {
  constructor() {
    this.types = []; // {params:[], results:[]}
    this.typeKeys = new Map();
    this.imports = []; // {module, name, type}
    this.funcs = []; // {type, locals:[types], body:number[]}
    this.globals = []; // {type, mutable, init}
    this.exports = []; // {name, kind, index}
    this.data = []; // {offset, bytes}
    this.memPages = 1;
    this.names = new Map();
  }
  typeIndex(params, results) {
    const key = params.join(',') + '>' + results.join(',');
    let i = this.typeKeys.get(key);
    if (i === undefined) {
      i = this.types.length;
      this.types.push({ params, results });
      this.typeKeys.set(key, i);
    }
    return i;
  }
  addImport(module, name, params, results) {
    if (this.funcs.length) throw new Error('imports must come before functions');
    this.imports.push({ module, name, type: this.typeIndex(params, results) });
    return this.imports.length - 1;
  }
  /** Reserve a function index; set the body later. */
  declareFunc(params, results) {
    this.funcs.push({ type: this.typeIndex(params, results), locals: [], body: null });
    return this.imports.length + this.funcs.length - 1;
  }
  setBody(index, locals, body) {
    const f = this.funcs[index - this.imports.length];
    f.locals = locals;
    f.body = body;
  }
  addGlobal(type, init) {
    this.globals.push({ type, init });
    return this.globals.length - 1;
  }
  encode() {
    const out = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
    let b = [];
    uleb(this.types.length, b);
    for (const t of this.types) {
      b.push(0x60);
      uleb(t.params.length, b); b.push(...t.params);
      uleb(t.results.length, b); b.push(...t.results);
    }
    section(1, b, out);
    b = [];
    uleb(this.imports.length, b);
    for (const im of this.imports) { strBytes(im.module, b); strBytes(im.name, b); b.push(0x00); uleb(im.type, b); }
    section(2, b, out);
    b = [];
    uleb(this.funcs.length, b);
    for (const f of this.funcs) uleb(f.type, b);
    section(3, b, out);
    b = [];
    uleb(1, b); b.push(0x00); uleb(this.memPages, b);
    section(5, b, out);
    b = [];
    uleb(this.globals.length, b);
    for (const g of this.globals) {
      b.push(g.type, 0x01);
      if (g.type === I32) { b.push(OP.i32_const); sleb(g.init, b); } else { b.push(OP.f64_const); f64bytes(g.init, b); }
      b.push(OP.end);
    }
    section(6, b, out);
    b = [];
    uleb(this.exports.length, b);
    for (const e of this.exports) { strBytes(e.name, b); b.push(e.kind); uleb(e.index, b); }
    section(7, b, out);
    b = [];
    uleb(this.funcs.length, b);
    for (const f of this.funcs) {
      if (!f.body) throw new Error('function without body');
      const fb = [];
      // group the locals by type
      const groups = [];
      for (const t of f.locals) {
        if (groups.length && groups[groups.length - 1][1] === t) groups[groups.length - 1][0]++;
        else groups.push([1, t]);
      }
      uleb(groups.length, fb);
      for (const [n, t] of groups) { uleb(n, fb); fb.push(t); }
      for (let i = 0; i < f.body.length; i++) fb.push(f.body[i]);
      fb.push(OP.end);
      uleb(fb.length, b);
      for (let i = 0; i < fb.length; i++) b.push(fb[i]);
    }
    section(10, b, out);
    b = [];
    uleb(this.data.length, b);
    for (const d of this.data) {
      b.push(0x00, OP.i32_const); sleb(d.offset, b); b.push(OP.end);
      uleb(d.bytes.length, b);
      for (const x of d.bytes) b.push(x);
    }
    section(11, b, out);
    if (this.names.size) {
      // custom section "name", subsection 1: function names (for stack traces)
      const nb = [];
      strBytes('name', nb);
      const sub = [];
      const entries = [...this.names].sort((x, y) => x[0] - y[0]);
      uleb(entries.length, sub);
      for (const [i, n] of entries) { uleb(i, sub); strBytes(n, sub); }
      nb.push(1);
      uleb(sub.length, nb);
      for (const x of sub) nb.push(x);
      section(0, nb, out);
    }
    return new Uint8Array(out);
  }
}
