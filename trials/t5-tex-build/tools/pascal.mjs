// Pascal to WASM compiler of the T5 trial.
// It accepts the Pascal subset of the Knuth WEB programs (tex.web, pltotf.web,
// tftopl.web, dvitype.web) after the tangler: no sets, no pointers, no `with`,
// no nested procedures. Files are host imports. Gotos inside a procedure use a
// dispatch loop per statement list.

import { ModuleBuilder, OP, I32, F64, VOID, uleb, sleb, f64bytes } from './wasm.mjs';

// ---------------------------------------------------------------- lexer

const KEYWORDS = new Set(('and array begin case const div do downto else end file for function goto if in label mod nil not of or ' +
  'packed procedure program record repeat set then to type until var while with others').split(' '));

/** Canonical Pascal identifier: case folded, underscores removed (as tangle does). */
export const canon = (s) => s.toLowerCase().replace(/_/g, '');

function lex(src) {
  const toks = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f') { i++; continue; }
    if (c === '{') {
      while (i < n && src[i] !== '}') { if (src[i] === '\n') line++; i++; }
      i++; continue;
    }
    if (c === '(' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === ')')) { if (src[i] === '\n') line++; i++; }
      i += 2; continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      const raw = src.slice(i, j);
      const low = raw.toLowerCase();
      if (KEYWORDS.has(low)) toks.push({ k: 'kw', v: low, line });
      else toks.push({ k: 'id', v: canon(raw), raw, line });
      i = j; continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      let isReal = false;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] ?? '')) {
        isReal = true; j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      }
      if (/[eE]/.test(src[j] ?? '') && /[-+0-9]/.test(src[j + 1] ?? '')) {
        isReal = true; j++;
        if (src[j] === '+' || src[j] === '-') j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      }
      const text = src.slice(i, j);
      toks.push(isReal ? { k: 'real', v: Number(text), line } : { k: 'num', v: Number(text), line });
      i = j; continue;
    }
    if (c === "'") {
      let s = '';
      i++;
      for (;;) {
        if (i >= n) throw new Error(`string did not end at line ${line}`);
        if (src[i] === "'") {
          if (src[i + 1] === "'") { s += "'"; i += 2; continue; }
          i++; break;
        }
        s += src[i++];
      }
      toks.push({ k: 'str', v: s, line });
      continue;
    }
    const two = src.slice(i, i + 2);
    if ([':=', '<>', '<=', '>=', '..'].includes(two)) { toks.push({ k: 'sym', v: two, line }); i += 2; continue; }
    if ('+-*/=<>()[].,;:^'.includes(c)) { toks.push({ k: 'sym', v: c, line }); i++; continue; }
    throw new Error(`bad character ${JSON.stringify(c)} at line ${line}`);
  }
  toks.push({ k: 'eof', v: '', line });
  return toks;
}

// ---------------------------------------------------------------- parser

class Parser {
  constructor(toks) { this.t = toks; this.p = 0; }
  get cur() { return this.t[this.p]; }
  peek(o = 1) { return this.t[this.p + o]; }
  err(msg) { throw new Error(`line ${this.cur.line}: ${msg} (at ${JSON.stringify(this.cur.v)})`); }
  is(k, v) { const c = this.cur; return c.k === k && (v === undefined || c.v === v); }
  isSym(v) { return this.is('sym', v); }
  isKw(v) { return this.is('kw', v); }
  accept(k, v) { if (this.is(k, v)) { return this.t[this.p++]; } return null; }
  expect(k, v) { const x = this.accept(k, v); if (!x) this.err(`expected ${v ?? k}`); return x; }
  ident() { return this.expect('id').v; }

  program() {
    this.expect('kw', 'program');
    const name = this.ident();
    const params = [];
    if (this.accept('sym', '(')) {
      do params.push(this.ident()); while (this.accept('sym', ','));
      this.expect('sym', ')');
    }
    this.expect('sym', ';');
    const block = this.block(true);
    this.expect('sym', '.');
    return { name, params, block };
  }

  block(top) {
    const b = { labels: [], consts: [], types: [], vars: [], procs: [], body: null };
    for (;;) {
      if (this.accept('kw', 'label')) {
        do b.labels.push(this.labelNum()); while (this.accept('sym', ','));
        this.expect('sym', ';');
      } else if (this.accept('kw', 'const')) {
        while (this.is('id')) {
          const name = this.ident(); this.expect('sym', '=');
          b.consts.push({ name, expr: this.expr() }); this.expect('sym', ';');
        }
      } else if (this.accept('kw', 'type')) {
        while (this.is('id')) {
          const name = this.ident(); this.expect('sym', '=');
          b.types.push({ name, type: this.type() }); this.expect('sym', ';');
        }
      } else if (this.accept('kw', 'var')) {
        while (this.is('id')) {
          const names = [this.ident()];
          while (this.accept('sym', ',')) names.push(this.ident());
          this.expect('sym', ':');
          b.vars.push({ names, type: this.type() }); this.expect('sym', ';');
        }
      } else if (this.isKw('procedure') || this.isKw('function')) {
        if (!top) this.err('nested procedures are not supported');
        b.procs.push(this.procDecl());
      } else break;
    }
    this.expect('kw', 'begin');
    b.body = { k: 'compound', stmts: this.stmtList('end') };
    this.expect('kw', 'end');
    return b;
  }

  procDecl() {
    const kind = this.accept('kw', 'procedure') ? 'proc' : (this.expect('kw', 'function'), 'func');
    const name = this.ident();
    const line = this.cur.line;
    let params = null, result = null;
    if (this.accept('sym', '(')) {
      params = [];
      do {
        const isVar = !!this.accept('kw', 'var');
        const names = [this.ident()];
        while (this.accept('sym', ',')) names.push(this.ident());
        this.expect('sym', ':');
        params.push({ names, isVar, type: { k: 'name', name: this.ident() } });
      } while (this.accept('sym', ';'));
      this.expect('sym', ')');
    }
    if (kind === 'func' && this.accept('sym', ':')) result = { k: 'name', name: this.ident() };
    this.expect('sym', ';');
    if (this.is('id', 'forward')) { this.p++; this.expect('sym', ';'); return { kind, name, params, result, forward: true, line }; }
    if (this.is('id', 'external')) { this.p++; this.expect('sym', ';'); return { kind, name, params, result, external: true, line }; }
    const block = this.block(false);
    this.expect('sym', ';');
    return { kind, name, params, result, block, line };
  }

  type() {
    this.accept('kw', 'packed');
    if (this.accept('kw', 'array')) {
      this.expect('sym', '[');
      const idx = [this.type()];
      while (this.accept('sym', ',')) idx.push(this.type());
      this.expect('sym', ']');
      this.expect('kw', 'of');
      let elem = this.type();
      for (let i = idx.length - 1; i > 0; i--) elem = { k: 'array', index: idx[i], elem };
      return { k: 'array', index: idx[0], elem };
    }
    if (this.accept('kw', 'file')) { this.expect('kw', 'of'); return { k: 'file', elem: this.type() }; }
    if (this.accept('kw', 'record')) {
      const r = this.fieldList();
      this.expect('kw', 'end');
      return { k: 'record', ...r };
    }
    if (this.accept('sym', '(')) {
      const names = [this.ident()];
      while (this.accept('sym', ',')) names.push(this.ident());
      this.expect('sym', ')');
      return { k: 'enum', names };
    }
    if (this.is('id') && !(this.peek().k === 'sym' && this.peek().v === '..')) return { k: 'name', name: this.ident() };
    const lo = this.expr();
    this.expect('sym', '..');
    const hi = this.expr();
    return { k: 'subrange', lo, hi };
  }

  fieldList() {
    const fields = [];
    let variant = null;
    while (this.is('id')) {
      const names = [this.ident()];
      while (this.accept('sym', ',')) names.push(this.ident());
      this.expect('sym', ':');
      fields.push({ names, type: this.type() });
      if (!this.accept('sym', ';')) break;
    }
    if (this.accept('kw', 'case')) {
      let tag = null;
      let tagType = this.ident();
      if (this.accept('sym', ':')) { tag = tagType; tagType = this.ident(); }
      this.expect('kw', 'of');
      const cases = [];
      while (!this.isKw('end') && !this.isSym(')')) {
        const labels = [this.expr()];
        while (this.accept('sym', ',')) labels.push(this.expr());
        this.expect('sym', ':');
        this.expect('sym', '(');
        const fl = this.fieldList();
        this.expect('sym', ')');
        cases.push(fl);
        if (!this.accept('sym', ';')) break;
      }
      variant = { tag, tagType: { k: 'name', name: tagType }, cases };
    }
    return { fields, variant };
  }

  // a label; tangle writes sums such as `90 + 1`
  labelNum() {
    let v = this.expect('num').v;
    while ((this.isSym('+') || this.isSym('-')) && this.peek().k === 'num') {
      const sign = this.t[this.p++].v === '+' ? 1 : -1;
      v += sign * this.t[this.p++].v;
    }
    return v;
  }

  stmtList(endKw) {
    const list = [this.stmt()];
    while (this.accept('sym', ';')) list.push(this.stmt());
    if (!this.isKw(endKw)) this.err(`expected ; or ${endKw}`);
    return list;
  }

  stmt() {
    let label = null;
    if (this.is('num')) {
      label = this.labelNum();
      this.expect('sym', ':');
    }
    const s = this.stmtBody();
    if (label !== null) s.label = label;
    return s;
  }

  stmtBody() {
    const line = this.cur.line;
    if (this.accept('kw', 'begin')) {
      const stmts = this.stmtList('end');
      this.expect('kw', 'end');
      return { k: 'compound', stmts, line };
    }
    if (this.accept('kw', 'if')) {
      const cond = this.expr();
      this.expect('kw', 'then');
      const th = this.stmt();
      const el = this.accept('kw', 'else') ? this.stmt() : null;
      return { k: 'if', cond, then: th, else: el, line };
    }
    if (this.accept('kw', 'while')) {
      const cond = this.expr(); this.expect('kw', 'do');
      return { k: 'while', cond, body: this.stmt(), line };
    }
    if (this.accept('kw', 'repeat')) {
      const stmts = this.stmtList('until');
      this.expect('kw', 'until');
      return { k: 'repeat', body: { k: 'compound', stmts }, cond: this.expr(), line };
    }
    if (this.accept('kw', 'for')) {
      const v = this.designator();
      this.expect('sym', ':=');
      const from = this.expr();
      const down = !!this.accept('kw', 'downto');
      if (!down) this.expect('kw', 'to');
      const to = this.expr();
      this.expect('kw', 'do');
      return { k: 'for', v, from, to, down, body: this.stmt(), line };
    }
    if (this.accept('kw', 'case')) {
      const e = this.expr();
      this.expect('kw', 'of');
      const arms = [];
      let others = null;
      while (!this.isKw('end')) {
        if (this.accept('kw', 'others')) {
          this.expect('sym', ':');
          others = this.stmt();
          this.accept('sym', ';');
          continue;
        }
        const labels = [this.expr()];
        while (this.accept('sym', ',')) labels.push(this.expr());
        this.expect('sym', ':');
        arms.push({ labels, stmt: this.stmt() });
        if (!this.accept('sym', ';')) break;
      }
      this.expect('kw', 'end');
      return { k: 'case', e, arms, others, line };
    }
    if (this.accept('kw', 'goto')) return { k: 'goto', target: this.labelNum(), line };
    if (this.is('id')) {
      const d = this.designator();
      if (this.accept('sym', ':=')) return { k: 'assign', lhs: d, rhs: this.expr(), line };
      if (d.k === 'id') return { k: 'call', name: d.name, args: [], line };
      if (d.k === 'call') return { k: 'call', name: d.name, args: d.args, line };
      this.err('bad statement');
    }
    return { k: 'empty', line };
  }

  designator() {
    const name = this.ident();
    let e = { k: 'id', name };
    if (this.isSym('(')) {
      this.p++;
      const args = [];
      if (!this.isSym(')')) {
        do args.push(this.writeArg()); while (this.accept('sym', ','));
      }
      this.expect('sym', ')');
      e = { k: 'call', name, args };
    }
    for (;;) {
      if (this.accept('sym', '[')) {
        const idx = [this.expr()];
        while (this.accept('sym', ',')) idx.push(this.expr());
        this.expect('sym', ']');
        for (const i of idx) e = { k: 'index', base: e, idx: i };
      } else if (this.isSym('.') && this.peek().k === 'id') {
        this.p++;
        e = { k: 'field', base: e, name: this.ident() };
      } else if (this.accept('sym', '^')) {
        e = { k: 'deref', base: e };
      } else break;
    }
    return e;
  }

  writeArg() {
    const e = this.expr();
    if (this.accept('sym', ':')) {
      const w = this.expr();
      const d = this.accept('sym', ':') ? this.expr() : null;
      return { k: 'fmt', e, w, d };
    }
    return e;
  }

  expr() {
    const l = this.simple();
    const c = this.cur;
    if (c.k === 'sym' && ['=', '<>', '<', '<=', '>', '>='].includes(c.v)) {
      this.p++;
      return { k: 'bin', op: c.v, l, r: this.simple() };
    }
    return l;
  }
  simple() {
    let sign = null;
    if (this.isSym('-') || this.isSym('+')) sign = this.t[this.p++].v;
    let e = this.term();
    if (sign === '-') e = { k: 'neg', e };
    for (;;) {
      const c = this.cur;
      if (c.k === 'sym' && (c.v === '+' || c.v === '-')) { this.p++; e = { k: 'bin', op: c.v, l: e, r: this.term() }; }
      else if (c.k === 'kw' && c.v === 'or') { this.p++; e = { k: 'bin', op: 'or', l: e, r: this.term() }; }
      else return e;
    }
  }
  term() {
    let e = this.factor();
    for (;;) {
      const c = this.cur;
      if (c.k === 'sym' && (c.v === '*' || c.v === '/')) { this.p++; e = { k: 'bin', op: c.v, l: e, r: this.factor() }; }
      else if (c.k === 'kw' && (c.v === 'div' || c.v === 'mod' || c.v === 'and')) { this.p++; e = { k: 'bin', op: c.v, l: e, r: this.factor() }; }
      else return e;
    }
  }
  factor() {
    const c = this.cur;
    if (c.k === 'num') { this.p++; return { k: 'num', v: c.v }; }
    if (c.k === 'real') { this.p++; return { k: 'real', v: c.v }; }
    if (c.k === 'str') { this.p++; return { k: 'str', v: c.v }; }
    if (this.accept('kw', 'not')) return { k: 'not', e: this.factor() };
    // a sign after an operator: tangle writes `x + -10000` for a negative macro value
    if (this.accept('sym', '-')) return { k: 'neg', e: this.factor() };
    if (this.accept('sym', '+')) return this.factor();
    if (this.accept('sym', '(')) { const e = this.expr(); this.expect('sym', ')'); return e; }
    if (c.k === 'id') return this.designator();
    this.err('bad expression');
  }
}

// ---------------------------------------------------------------- types

const INT = { k: 'ord', lo: -2147483648, hi: 2147483647, size: 4, signed: true, base: 'int' };
const BOOL = { k: 'ord', lo: 0, hi: 1, size: 1, signed: false, base: 'bool' };
const CHAR = { k: 'ord', lo: 0, hi: 255, size: 1, signed: false, base: 'char' };
const REAL = { k: 'real', size: 8 };
const STRLIT = (len) => ({ k: 'strlit', len });

function ordType(lo, hi, base) {
  let size, signed = lo < 0;
  if (!signed) size = hi <= 255 ? 1 : hi <= 65535 ? 2 : 4;
  else size = lo >= -128 && hi <= 127 ? 1 : lo >= -32768 && hi <= 32767 ? 2 : 4;
  return { k: 'ord', lo, hi, size, signed, base };
}
const alignOf = (t) => t.k === 'array' ? alignOf(t.elem) : t.k === 'record' ? t.align : t.k === 'file' ? 8 : Math.min(t.size, 8);
const alignUp = (n, a) => Math.ceil(n / a) * a;
const isOrd = (t) => t.k === 'ord';
const isCharArray = (t) => t.k === 'array' && isOrd(t.elem) && t.elem.base === 'char';

// ---------------------------------------------------------------- compiler

const FILE_SLOT = 8; // the element buffer of a file variable starts here

export function compile(source, options = {}) {
  const ast = new Parser(lex(source)).program();
  const c = new Compiler(ast, options);
  return c.run();
}

class Compiler {
  constructor(ast, options) {
    this.ast = ast;
    this.opt = options;
    this.mb = new ModuleBuilder();
    this.globals = new Map();
    this.dataTop = 1024; // address 0 to 1023 stays unused
    this.strings = new Map(); // literal -> address
    this.helpers = {};
  }

  // -------- constant evaluation
  constVal(e, scope) {
    switch (e.k) {
      case 'num': return { t: INT, v: e.v };
      case 'real': return { t: REAL, v: e.v };
      case 'str': return e.v.length === 1 ? { t: CHAR, v: e.v.charCodeAt(0) } : { t: STRLIT(e.v.length), v: e.v };
      case 'id': {
        const s = this.lookup(e.name, scope);
        if (!s || s.kind !== 'const') throw new Error(`not a constant: ${e.name}`);
        return { t: s.type, v: s.value };
      }
      case 'neg': { const x = this.constVal(e.e, scope); return { t: x.t, v: -x.v }; }
      case 'bin': {
        const a = this.constVal(e.l, scope), b = this.constVal(e.r, scope);
        const ops = { '+': (x, y) => x + y, '-': (x, y) => x - y, '*': (x, y) => x * y, div: (x, y) => Math.trunc(x / y), mod: (x, y) => x % y };
        if (!ops[e.op]) throw new Error(`operator ${e.op} in a constant`);
        return { t: a.t.k === 'real' || b.t.k === 'real' ? REAL : INT, v: ops[e.op](a.v, b.v) };
      }
      case 'call': {
        if (e.name === 'chr') return { t: CHAR, v: this.constVal(e.args[0], scope).v };
        if (e.name === 'ord') return { t: INT, v: this.constVal(e.args[0], scope).v };
        break;
      }
    }
    throw new Error(`not a constant expression: ${e.k}`);
  }
  isConstExpr(e, scope) {
    try { this.constVal(e, scope); return true; } catch { return false; }
  }

  // -------- types
  resolveType(ta, scope) {
    switch (ta.k) {
      case 'name': {
        const s = this.lookup(ta.name, scope);
        if (!s || s.kind !== 'type') throw new Error(`not a type: ${ta.name}`);
        return s.type;
      }
      case 'subrange': {
        const lo = this.constVal(ta.lo, scope), hi = this.constVal(ta.hi, scope);
        const base = lo.t.base === 'char' ? 'char' : 'int';
        return ordType(lo.v, hi.v, base);
      }
      case 'enum': {
        ta.names.forEach((n, i) => scope.syms.set(n, { kind: 'const', type: INT, value: i }));
        return ordType(0, ta.names.length - 1, 'int');
      }
      case 'array': {
        const it = this.resolveType(ta.index, scope);
        if (!isOrd(it)) throw new Error('array index must be ordinal');
        const elem = this.resolveType(ta.elem, scope);
        const count = it.hi - it.lo + 1;
        const stride = alignUp(elem.size, alignOf(elem));
        return { k: 'array', lo: it.lo, hi: it.hi, elem, stride, size: stride * count };
      }
      case 'file': {
        const elem = this.resolveType(ta.elem, scope);
        return { k: 'file', elem, text: isOrd(elem) && elem.base === 'char', size: FILE_SLOT + alignUp(Math.max(elem.size, 8), 8) };
      }
      case 'record': {
        const fields = new Map();
        const lay = (fl, start) => {
          let off = start, maxAlign = 1;
          for (const f of fl.fields) {
            const t = this.resolveType(f.type, scope);
            for (const n of f.names) {
              const a = alignOf(t);
              maxAlign = Math.max(maxAlign, a);
              off = alignUp(off, a);
              fields.set(n, { off, type: t });
              off += t.size;
            }
          }
          let end = off;
          if (fl.variant) {
            if (fl.variant.tag) {
              const t = this.resolveType(fl.variant.tagType, scope);
              off = alignUp(off, alignOf(t)); fields.set(fl.variant.tag, { off, type: t }); off += t.size; end = off;
            }
            for (const cs of fl.variant.cases) {
              const r = lay(cs, off);
              end = Math.max(end, r.end);
              maxAlign = Math.max(maxAlign, r.align);
            }
          }
          return { end, align: maxAlign };
        };
        const r = lay(ta, 0);
        return { k: 'record', fields, align: r.align, size: alignUp(r.end, r.align) };
      }
    }
    throw new Error(`type ${ta.k}`);
  }

  lookup(name, scope) {
    for (let s = scope; s; s = s.parent) {
      const x = s.syms.get(name);
      if (x) return x;
    }
    return null;
  }

  allocGlobal(size, align) {
    this.dataTop = alignUp(this.dataTop, Math.max(align, 1));
    const a = this.dataTop;
    this.dataTop += size;
    return a;
  }

  stringAddr(s) {
    let a = this.strings.get(s);
    if (a === undefined) {
      a = this.allocGlobal(s.length + 1, 1);
      this.strings.set(s, a);
      this.mb.data.push({ offset: a, bytes: [...s].map((ch) => ch.charCodeAt(0) & 255) });
    }
    return a;
  }

  declareBlock(block, scope) {
    for (const cd of block.consts) {
      const v = this.constVal(cd.expr, scope);
      scope.syms.set(cd.name, { kind: 'const', type: v.t, value: v.v });
    }
    for (const td of block.types) scope.syms.set(td.name, { kind: 'type', type: this.resolveType(td.type, scope) });
  }

  run() {
    const top = { syms: new Map(), parent: null };
    const builtins = { syms: new Map(), parent: null };
    top.parent = builtins;
    builtins.syms.set('integer', { kind: 'type', type: INT });
    // the storage size of real: 8 (f64) or 4 (f32; tex.web wants a one-word glue ratio, section 109)
    builtins.syms.set('real', { kind: 'type', type: { k: 'real', size: this.opt.realBytes ?? 8 } });
    builtins.syms.set('boolean', { kind: 'type', type: BOOL });
    builtins.syms.set('char', { kind: 'type', type: CHAR });
    builtins.syms.set('true', { kind: 'const', type: BOOL, value: 1 });
    builtins.syms.set('false', { kind: 'const', type: BOOL, value: 0 });
    builtins.syms.set('maxint', { kind: 'const', type: INT, value: 2147483647 });
    const textType = { k: 'file', elem: CHAR, text: true, size: FILE_SLOT + 8 };
    builtins.syms.set('text', { kind: 'type', type: textType });
    this.top = top;
    const prog = this.ast.block;
    this.declareBlock(prog, top);
    // standard files
    for (const f of ['input', 'output']) {
      top.syms.set(f, { kind: 'gvar', type: textType, addr: this.allocGlobal(textType.size, 8), name: f });
    }
    for (const vd of prog.vars) {
      const t = this.resolveType(vd.type, top);
      for (const n of vd.names) top.syms.set(n, { kind: 'gvar', type: t, addr: this.allocGlobal(t.size, alignOf(t)), name: n });
    }

    // imports
    const mb = this.mb;
    const imp = (name, params, results = []) => { this.helpers[name] = mb.addImport('env', name, params, results); };
    imp('f_open', [I32, I32, I32, I32, I32]); // slot, mode, name addr, name len, element size
    imp('f_close', [I32]);
    imp('f_get', [I32]);
    imp('f_put', [I32]);
    imp('f_eof', [I32], [I32]);
    imp('f_eoln', [I32], [I32]);
    imp('f_erstat', [I32], [I32]);
    imp('f_wstr', [I32, I32, I32, I32]); // slot, addr, len, width
    imp('f_wint', [I32, I32, I32]);
    imp('f_wchar', [I32, I32, I32]);
    imp('f_wreal', [I32, F64, I32, I32]);
    imp('f_wln', [I32]);
    imp('f_break', [I32]);
    imp('f_rint', [I32], [I32]);
    imp('f_rln', [I32]);
    imp('f_setpos', [I32, I32]); // random access of PASCAL-H (dvitype)
    imp('f_curpos', [I32], [I32]);
    if (this.opt.check) imp('range_err', [I32, I32]);
    // external procedures of the change files
    this.procs = new Map();
    for (const pd of prog.procs) {
      if (pd.external) {
        const sig = this.procSig(pd, top);
        const idx = mb.addImport('env', pd.name, sig.wparams, sig.wresults);
        this.procs.set(pd.name, { ...sig, index: idx, decl: pd, external: true });
        top.syms.set(pd.name, { kind: 'proc', name: pd.name });
      }
    }
    // the stack pointer global
    this.spGlobal = mb.addGlobal(I32, 0);
    this.lineGlobal = mb.addGlobal(I32, 0);
    // declare procedures
    for (const pd of prog.procs) {
      if (pd.external) continue;
      const known = this.procs.get(pd.name);
      if (known) {
        if (!known.forward || pd.forward) throw new Error(`procedure declared twice: ${pd.name}`);
        known.decl = pd; known.forward = false;
        continue;
      }
      const sig = this.procSig(pd, top);
      const index = mb.declareFunc(sig.wparams, sig.wresults);
      mb.names.set(index, pd.name);
      this.procs.set(pd.name, { ...sig, index, decl: pd, forward: !!pd.forward });
      top.syms.set(pd.name, { kind: 'proc', name: pd.name });
    }
    this.round = mb.declareFunc([F64], [I32]);
    const mainIndex = mb.declareFunc([], []);
    // bodies
    for (const [name, p] of this.procs) {
      if (p.external) continue;
      if (p.forward) throw new Error(`forward procedure without body: ${name}`);
      this.genProc(p, top);
    }
    this.genRound();
    this.genMain(mainIndex, prog, top);
    // memory: data and globals, then the stack
    const stackSize = this.opt.stackSize ?? (1 << 20);
    const stackTop = alignUp(this.dataTop + stackSize, 16);
    mb.globals[this.spGlobal].init = stackTop;
    const pages = Math.ceil((stackTop + 16) / 65536);
    mb.memPages = pages;
    mb.exports.push({ name: 'memory', kind: 2, index: 0 });
    mb.exports.push({ name: 'main', kind: 0, index: mainIndex });
    mb.exports.push({ name: 'sp', kind: 3, index: this.spGlobal });
    mb.exports.push({ name: 'line', kind: 3, index: this.lineGlobal });
    const wasm = mb.encode();
    const symbols = {};
    for (const [n, s] of top.syms) {
      if (s.kind === 'gvar') symbols[n] = { addr: s.addr, size: s.type.size, kind: s.type.k, ...(s.type.k === 'array' ? { lo: s.type.lo, hi: s.type.hi, stride: s.type.stride } : {}) };
    }
    return { wasm, symbols, stackTop, pages, procCount: this.procs.size };
  }

  procSig(pd, scope) {
    const params = [];
    for (const g of pd.params ?? []) {
      const t = this.resolveType(g.type, scope);
      for (const n of g.names) params.push({ name: n, type: t, isVar: g.isVar });
    }
    const result = pd.result ? this.resolveType(pd.result, scope) : null;
    const wt = (t) => (t.k === 'real' ? F64 : I32);
    const wparams = params.map((p) => (p.isVar || p.type.k === 'array' || p.type.k === 'record' || p.type.k === 'file' ? I32 : wt(p.type)));
    return { params, result, wparams, wresults: result ? [wt(result)] : [] };
  }

  // -------- function context
  newFn(nparams) {
    return { code: [], locals: [], nparams, labels: [], tmp: { [I32]: [], [F64]: [] }, gotoTargets: new Set(), dispatch: new Map() };
  }
  addLocal(fn, type) {
    fn.locals.push(type);
    return fn.nparams + fn.locals.length - 1;
  }
  tmpLocal(type) {
    const pool = this.fn.tmp[type];
    return pool.length ? pool.pop() : this.addLocal(this.fn, type);
  }
  freeTmp(type, idx) { this.fn.tmp[type].push(idx); }

  emit(...bytes) { const c = this.fn.code; for (const b of bytes) c.push(b); }
  emitU(n) { uleb(n, this.fn.code); }
  emitI32(v) { this.emit(OP.i32_const); sleb(v, this.fn.code); }
  emitF64(v) { this.emit(OP.f64_const); f64bytes(v, this.fn.code); }
  lget(i) { this.emit(OP.local_get); this.emitU(i); }
  lset(i) { this.emit(OP.local_set); this.emitU(i); }
  call(i) { this.emit(OP.call); this.emitU(i); }
  open(kind, bt = VOID) { this.emit(kind, bt); const l = {}; this.fn.labels.push(l); return l; }
  close() { this.emit(OP.end); this.fn.labels.pop(); }
  elseOp() { this.emit(OP.else); }
  depth(l) {
    const i = this.fn.labels.lastIndexOf(l);
    if (i < 0) throw new Error('branch target not in scope');
    return this.fn.labels.length - 1 - i;
  }
  br(l) { this.emit(OP.br); this.emitU(this.depth(l)); }
  brIf(l) { this.emit(OP.br_if); this.emitU(this.depth(l)); }

  genProc(p, top) {
    const pd = p.decl;
    const scope = { syms: new Map(), parent: top, proc: p };
    const fn = this.newFn(p.params.length);
    this.fn = fn;
    this.scope = scope;
    // collect variables whose address is needed
    const addrTaken = new Set();
    this.scanAddr(pd.block.body, addrTaken);
    this.scanGotos(pd.block.body, fn.gotoTargets);
    this.declareBlock(pd.block, scope);
    let frame = 0;
    const frameVars = [];
    const fpLocal = this.addLocal(fn, I32);
    fn.fp = fpLocal;
    p.params.forEach((prm, i) => {
      if (prm.isVar) scope.syms.set(prm.name, { kind: 'ref', type: prm.type, local: i });
      else if (prm.type.k === 'array' || prm.type.k === 'record') {
        frame = alignUp(frame, alignOf(prm.type));
        scope.syms.set(prm.name, { kind: 'frame', type: prm.type, off: frame });
        frameVars.push({ copyFrom: i, off: frame, size: prm.type.size });
        frame += prm.type.size;
      } else if (addrTaken.has(prm.name)) {
        frame = alignUp(frame, alignOf(prm.type));
        scope.syms.set(prm.name, { kind: 'frame', type: prm.type, off: frame });
        frameVars.push({ storeFrom: i, off: frame, type: prm.type });
        frame += prm.type.size;
      } else scope.syms.set(prm.name, { kind: 'local', type: prm.type, local: i });
    });
    for (const vd of pd.block.vars) {
      const t = this.resolveType(vd.type, scope);
      for (const n of vd.names) {
        if (t.k === 'ord' || t.k === 'real') {
          if (addrTaken.has(n)) {
            frame = alignUp(frame, alignOf(t));
            scope.syms.set(n, { kind: 'frame', type: t, off: frame });
            frame += t.size;
          } else scope.syms.set(n, { kind: 'local', type: t, local: this.addLocal(fn, t.k === 'real' ? F64 : I32) });
        } else {
          frame = alignUp(frame, alignOf(t));
          scope.syms.set(n, { kind: 'frame', type: t, off: frame, zero: true, size: t.size });
          frame += t.size;
        }
      }
    }
    if (p.result) {
      fn.result = { kind: 'local', type: p.result, local: this.addLocal(fn, p.result.k === 'real' ? F64 : I32) };
      scope.syms.set(pd.name, { kind: 'result', type: p.result });
    }
    frame = alignUp(frame, 16);
    fn.frame = frame;
    if (frame > 0) {
      this.emit(OP.global_get); this.emitU(this.spGlobal);
      this.emitI32(frame); this.emit(OP.i32_sub, OP.local_tee); this.emitU(fpLocal);
      this.emit(OP.global_set); this.emitU(this.spGlobal);
      for (const fv of frameVars) {
        if (fv.copyFrom !== undefined) {
          this.lget(fpLocal); this.emitI32(fv.off); this.emit(OP.i32_add);
          this.lget(fv.copyFrom); this.emitI32(fv.size); this.emit(0xfc); this.emitU(10); this.emit(0, 0);
        } else {
          this.lget(fpLocal); this.lget(fv.storeFrom); this.store(fv.type, fv.off);
        }
      }
    }
    this.genStmt(pd.block.body);
    if (frame > 0) {
      this.lget(fpLocal); this.emitI32(frame); this.emit(OP.i32_add, OP.global_set); this.emitU(this.spGlobal);
    }
    if (fn.result) this.lget(fn.result.local);
    this.mb.setBody(p.index, fn.locals, fn.code);
    this.fn = null;
  }

  genMain(index, prog, top) {
    const fn = this.newFn(0);
    this.fn = fn;
    this.scope = top;
    this.scanGotos(prog.body, fn.gotoTargets);
    this.genStmt(prog.body);
    this.mb.setBody(index, fn.locals, fn.code);
  }

  genRound() {
    // Pascal round: halves go away from zero; out-of-range values saturate.
    const fn = this.newFn(1);
    this.fn = fn;
    this.lget(0); this.emitF64(0); this.emit(OP.f64_ge);
    this.open(OP.if, I32);
    this.lget(0); this.emitF64(0.5); this.emit(OP.f64_add, 0xfc, 2);
    this.elseOp();
    this.lget(0); this.emitF64(0.5); this.emit(OP.f64_sub, 0xfc, 2);
    this.close();
    this.mb.setBody(this.round, fn.locals, fn.code);
    this.fn = null;
  }

  scanAddr(s, set) {
    const walk = (x) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if ((x.k === 'call') && this.procs.has(x.name)) {
        const p = this.procs.get(x.name);
        x.args.forEach((a, i) => { if (p.params[i]?.isVar && a.k === 'id') set.add(a.name); });
      }
      for (const v of Object.values(x)) if (v && typeof v === 'object') walk(v);
    };
    walk(s);
  }
  scanGotos(s, set) {
    const walk = (x) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if (x.k === 'goto') set.add(x.target);
      for (const v of Object.values(x)) if (v && typeof v === 'object') walk(v);
    };
    walk(s);
  }

  // -------- statements
  genStmt(s) {
    if (s.line) {
      this.curLine = s.line;
      if (this.opt.check) { this.emitI32(s.line); this.emit(OP.global_set); this.emitU(this.lineGlobal); }
    }
    if (s.label !== undefined && s.k !== 'compound-seq') {
      // a labelled statement outside a list: treat it as a list of one
      if (!s.inList && this.fn.gotoTargets.has(s.label)) {
        const inner = { ...s }; delete inner.label;
        return this.genSeq([{ ...inner, label: s.label, inList: true }]);
      }
    }
    switch (s.k) {
      case 'compound': return this.genSeq(s.stmts);
      case 'empty': return;
      case 'assign': return this.genAssign(s.lhs, s.rhs);
      case 'call': return this.genCallStmt(s);
      case 'if': {
        this.genCond(s.cond);
        this.open(OP.if);
        this.genStmt(s.then);
        if (s.else) { this.elseOp(); this.genStmt(s.else); }
        this.close();
        return;
      }
      case 'while': {
        const brk = this.open(OP.block);
        const cont = this.open(OP.loop);
        this.genCond(s.cond); this.emit(OP.i32_eqz); this.brIf(brk);
        this.genStmt(s.body);
        this.br(cont);
        this.close(); this.close();
        return;
      }
      case 'repeat': {
        const l = this.open(OP.loop);
        this.genStmt(s.body);
        this.genCond(s.cond); this.emit(OP.i32_eqz); this.brIf(l);
        this.close();
        return;
      }
      case 'for': return this.genFor(s);
      case 'case': return this.genCase(s);
      case 'goto': {
        const d = this.fn.dispatch.get(s.target);
        if (!d) throw new Error(`line ${s.line}: goto ${s.target} leaves the procedure or enters a structure`);
        this.emitI32(d.index); this.lset(d.state); this.br(d.loop);
        return;
      }
    }
    throw new Error(`statement ${s.k}`);
  }

  genSeq(stmts) {
    const targets = stmts.filter((x) => x.label !== undefined && this.fn.gotoTargets.has(x.label));
    if (targets.length === 0) {
      for (const x of stmts) this.genStmtNoLabel(x);
      return;
    }
    // segments: seg 0 before the first target label, seg k starts at label k
    const segs = [[]];
    for (const x of stmts) {
      if (x.label !== undefined && this.fn.gotoTargets.has(x.label)) segs.push([]);
      segs[segs.length - 1].push(x);
    }
    const state = this.addLocal(this.fn, I32);
    this.emitI32(0); this.lset(state);
    const loop = this.open(OP.loop);
    const blocks = [];
    for (let k = segs.length - 1; k >= 0; k--) blocks[k] = this.open(OP.block);
    targets.forEach((x, i) => this.fn.dispatch.set(x.label, { index: i + 1, state, loop }));
    this.lget(state);
    this.emit(OP.br_table); this.emitU(segs.length);
    for (let k = 0; k < segs.length; k++) this.emitU(this.depth(blocks[k]));
    this.emitU(this.depth(blocks[0]));
    for (let k = 0; k < segs.length; k++) {
      this.close(); // the end of block k: segment k starts here
      for (const x of segs[k]) this.genStmtNoLabel(x);
    }
    this.close();
    targets.forEach((x) => this.fn.dispatch.delete(x.label));
  }
  genStmtNoLabel(x) {
    if (x.label === undefined) return this.genStmt(x);
    const y = { ...x }; delete y.label;
    this.genStmt(y);
  }

  genFor(s) {
    const lv = this.lvalue(s.v);
    const t = this.tmpLocal(I32), lim = this.tmpLocal(I32);
    this.genInt(s.from); this.lset(t);
    this.genInt(s.to); this.lset(lim);
    this.lget(t); this.lget(lim); this.emit(s.down ? OP.i32_ge_s : OP.i32_le_s);
    this.open(OP.if);
    const brk = this.open(OP.block);
    const lp = this.open(OP.loop);
    this.storeLv(lv, () => this.lget(t));
    this.genStmt(s.body);
    this.lget(t); this.lget(lim); this.emit(OP.i32_eq); this.brIf(brk);
    this.lget(t); this.emitI32(s.down ? -1 : 1); this.emit(OP.i32_add); this.lset(t);
    this.br(lp);
    this.close(); this.close(); this.close();
    this.freeTmp(I32, t); this.freeTmp(I32, lim);
  }

  genCase(s) {
    const sel = this.tmpLocal(I32);
    this.genInt(s.e); this.lset(sel);
    const arms = s.arms.map((a) => ({ stmt: a.stmt, vals: a.labels.map((l) => this.constVal(l, this.scope).v) }));
    const all = arms.flatMap((a) => a.vals);
    const min = Math.min(...all), max = Math.max(...all);
    if (all.length >= 4 && max - min < 4 * all.length + 16) {
      const end = this.open(OP.block);
      const oth = this.open(OP.block);
      const blk = [];
      for (let k = arms.length - 1; k >= 0; k--) blk[k] = this.open(OP.block);
      const table = new Array(max - min + 1).fill(-1);
      arms.forEach((a, k) => a.vals.forEach((v) => { if (table[v - min] === -1) table[v - min] = k; }));
      this.lget(sel); this.emitI32(min); this.emit(OP.i32_sub);
      this.emit(OP.br_table); this.emitU(table.length);
      for (const k of table) this.emitU(k < 0 ? this.depth(oth) : this.depth(blk[k]));
      this.emitU(this.depth(oth));
      this.freeTmp(I32, sel);
      for (let k = 0; k < arms.length; k++) {
        this.close();
        this.genStmt(arms[k].stmt);
        this.br(end);
      }
      this.close();
      if (s.others) this.genStmt(s.others);
      this.close();
      return;
    }
    // sparse labels: a chain of tests
    let opened = 0;
    for (const a of arms) {
      a.vals.forEach((v, i) => {
        this.lget(sel); this.emitI32(v); this.emit(OP.i32_eq);
        if (i > 0) this.emit(OP.i32_or);
      });
      this.open(OP.if);
      this.genStmt(a.stmt);
      this.elseOp();
      opened++;
    }
    this.freeTmp(I32, sel);
    if (s.others) this.genStmt(s.others);
    for (let i = 0; i < opened; i++) this.close();
  }

  // -------- variables
  /** Describe an lvalue. kind 'local' (wasm local) or 'mem' (address via emitAddr). */
  lvalue(e) {
    if (e.k === 'id') {
      const s = this.lookup(e.name, this.scope);
      if (!s) throw new Error(`unknown identifier ${e.name}`);
      if (s.kind === 'local') return { kind: 'local', local: s.local, type: s.type };
      if (s.kind === 'result') return { kind: 'local', local: this.fn.result.local, type: s.type };
      if (s.kind === 'gvar') return { kind: 'mem', type: s.type, base: null, off: s.addr };
      if (s.kind === 'frame') return { kind: 'mem', type: s.type, base: () => this.lget(this.fn.fp), off: s.off };
      if (s.kind === 'ref') return { kind: 'mem', type: s.type, base: () => this.lget(s.local), off: 0 };
      throw new Error(`not a variable: ${e.name}`);
    }
    if (e.k === 'index') {
      const b = this.lvalue(e.base);
      if (b.kind !== 'mem' || b.type.k !== 'array') throw new Error('indexing a non-array');
      const t = b.type;
      const idx = e.idx;
      if (this.isConstExpr(idx, this.scope)) {
        const v = this.constVal(idx, this.scope).v;
        return { kind: 'mem', type: t.elem, base: b.base, off: b.off + (v - t.lo) * t.stride, neg: b.neg };
      }
      return {
        // neg: the dynamic part of the address can be negative, so no memarg offset
        kind: 'mem', type: t.elem, off: b.off - t.lo * t.stride, neg: b.neg || t.lo < 0,
        base: () => {
          this.genInt(idx);
          if (this.opt.check) this.rangeCheck(t.lo, t.hi);
          if (t.stride !== 1) { this.emitI32(t.stride); this.emit(OP.i32_mul); }
          if (b.base) { b.base(); this.emit(OP.i32_add); }
        },
      };
    }
    if (e.k === 'field') {
      const b = this.lvalue(e.base);
      if (b.kind !== 'mem' || b.type.k !== 'record') throw new Error(`field ${e.name} of a non-record`);
      const f = b.type.fields.get(e.name);
      if (!f) throw new Error(`no field ${e.name}`);
      return { kind: 'mem', type: f.type, base: b.base, off: b.off + f.off, neg: b.neg };
    }
    if (e.k === 'deref') {
      const b = this.lvalue(e.base);
      if (b.type.k !== 'file') throw new Error('^ of a non-file');
      return { kind: 'mem', type: b.type.elem, base: b.base, off: b.off + FILE_SLOT, neg: b.neg };
    }
    throw new Error(`not an lvalue: ${e.k}`);
  }
  // debug builds: index outside the bounds calls env.range_err(line, value)
  rangeCheck(lo, hi) {
    const x = this.tmpLocal(I32);
    this.emit(OP.local_tee); this.emitU(x);
    this.emitI32(lo); this.emit(OP.i32_lt_s);
    this.lget(x); this.emitI32(hi); this.emit(OP.i32_gt_s, OP.i32_or);
    this.open(OP.if);
    this.emitI32(this.curLine ?? 0); this.lget(x); this.call(this.helpers.range_err);
    this.close();
    this.lget(x);
    this.freeTmp(I32, x);
  }
  /** Push the address of a mem lvalue (offset included). */
  addr(lv) {
    if (!lv.base) { this.emitI32(lv.off); return; }
    lv.base();
    if (lv.off) { this.emitI32(lv.off); this.emit(OP.i32_add); }
  }
  /** Fold the base and the offset into a positive memarg offset when possible. */
  memOp(lv) {
    if (lv.off >= 0 && !lv.neg) { if (lv.base) lv.base(); else this.emitI32(0); return lv.off; }
    this.addr(lv); return 0;
  }
  load(t, off) {
    if (t.k === 'real' && t.size === 4) this.emit(0x2a, 2); // f32.load, then f64.promote_f32 after the offset
    else if (t.k === 'real') this.emit(OP.f64_load, 3);
    else if (t.size === 1) this.emit(t.signed ? OP.i32_load8_s : OP.i32_load8_u, 0);
    else if (t.size === 2) this.emit(t.signed ? OP.i32_load16_s : OP.i32_load16_u, 1);
    else if (t.size === 4) this.emit(OP.i32_load, 2);
    else throw new Error('load of an aggregate');
    this.emitU(off);
    if (t.k === 'real' && t.size === 4) this.emit(0xbb);
  }
  store(t, off) {
    if (t.k === 'real' && t.size === 4) this.emit(0xb6, 0x38, 2); // f32.demote_f64, f32.store
    else if (t.k === 'real') this.emit(OP.f64_store, 3);
    else if (t.size === 1) this.emit(OP.i32_store8, 0);
    else if (t.size === 2) this.emit(OP.i32_store16, 1);
    else if (t.size === 4) this.emit(OP.i32_store, 2);
    else throw new Error('store of an aggregate');
    this.emitU(off);
  }
  loadLv(lv) {
    if (lv.kind === 'local') { this.lget(lv.local); return; }
    const off = this.memOp(lv);
    this.load(lv.type, off);
  }
  storeLv(lv, genValue) {
    if (lv.kind === 'local') { genValue(); this.lset(lv.local); return; }
    const off = this.memOp(lv);
    genValue();
    this.store(lv.type, off);
  }

  genAssign(lhs, rhs) {
    const lv = this.lvalue(lhs);
    const t = lv.type;
    if (t.k === 'array' || t.k === 'record') {
      // aggregate copy, or a string literal into a char array
      this.addr(lv);
      if (rhs.k === 'str' || (rhs.k === 'id' && this.lookup(rhs.name, this.scope)?.kind === 'const')) {
        const s = rhs.k === 'str' ? rhs.v : this.lookup(rhs.name, this.scope).value;
        if (!isCharArray(t) || typeof s !== 'string') throw new Error('string into a non-char array');
        const padded = s.length >= t.size ? s.slice(0, t.size) : s + ' '.repeat(t.size - s.length);
        this.emitI32(this.stringAddr(padded)); this.emitI32(t.size);
      } else {
        const rv = this.lvalue(rhs);
        if (rv.type.size !== t.size) throw new Error('aggregate sizes differ');
        this.addr(rv); this.emitI32(t.size);
      }
      this.emit(0xfc); this.emitU(10); this.emit(0, 0);
      return;
    }
    this.storeLv(lv, () => this.genValueFor(t, rhs));
  }
  genValueFor(t, e) {
    if (t.k === 'real') { this.genReal(e); return; }
    const r = this.genExpr(e);
    if (r.k === 'real') throw new Error('real into an ordinal');
  }

  // -------- expressions
  /** Generate an expression. Returns its type (ord or real). */
  genExpr(e) {
    switch (e.k) {
      case 'num': this.emitI32(e.v); return INT;
      case 'real': this.emitF64(e.v); return REAL;
      case 'str':
        if (e.v.length !== 1) throw new Error(`string ${JSON.stringify(e.v)} in an expression`);
        this.emitI32(e.v.charCodeAt(0)); return CHAR;
      case 'neg': {
        if (this.isConstExpr(e, this.scope)) { const v = this.constVal(e, this.scope); if (v.t.k === 'real') { this.emitF64(v.v); return REAL; } this.emitI32(v.v); return INT; }
        const save = this.fn.code.length;
        const t = this.genExpr(e.e);
        if (t.k === 'real') { this.emit(OP.f64_neg); return REAL; }
        // insert 0 before: rebuild as 0 - x
        const tail = this.fn.code.splice(save);
        this.emitI32(0);
        for (const b of tail) this.fn.code.push(b);
        this.emit(OP.i32_sub);
        return INT;
      }
      case 'not': this.genCond(e.e); this.emit(OP.i32_eqz); return BOOL;
      case 'bin': return this.genBin(e);
      case 'id': {
        const s = this.lookup(e.name, this.scope);
        if (!s && this.builtinFuncs.has(e.name)) return this.genBuiltinFunc({ name: e.name, args: [] });
        if (!s) throw new Error(`unknown identifier ${e.name}`);
        if (s.kind === 'const') {
          if (s.type.k === 'real') { this.emitF64(s.value); return REAL; }
          if (typeof s.value === 'string') throw new Error(`string constant ${e.name} in an expression`);
          this.emitI32(s.value); return s.type;
        }
        if (s.kind === 'proc' || s.kind === 'result') return this.genCall({ name: e.name, args: [] }, true);
        const lv = this.lvalue(e);
        this.loadLv(lv);
        return lv.type;
      }
      case 'call': {
        if (this.builtinFuncs.has(e.name) && !this.lookup(e.name, this.scope)) return this.genBuiltinFunc(e);
        return this.genCall(e, true);
      }
      case 'index': case 'field': case 'deref': {
        const lv = this.lvalue(e);
        this.loadLv(lv);
        return lv.type;
      }
    }
    throw new Error(`expression ${e.k}`);
  }
  genInt(e) { const t = this.genExpr(e); if (t.k === 'real') throw new Error('real where an integer is needed'); }
  genReal(e) { const t = this.genExpr(e); if (t.k !== 'real') this.emit(OP.f64_convert_i32_s); }
  genCond(e) { this.genInt(e); }

  genBin(e) {
    const op = e.op;
    if (op === 'and' || op === 'or') {
      this.genCond(e.l);
      this.open(OP.if, I32);
      if (op === 'and') { this.genCond(e.r); this.elseOp(); this.emitI32(0); }
      else { this.emitI32(1); this.elseOp(); this.genCond(e.r); }
      this.close();
      return BOOL;
    }
    if (this.isConstExpr(e, this.scope) && ['+', '-', '*', 'div', 'mod'].includes(op)) {
      const v = this.constVal(e, this.scope);
      if (v.t.k === 'real') { this.emitF64(v.v); return REAL; }
      this.emitI32(v.v); return INT;
    }
    // decide int or real
    const save = this.fn.code.length;
    const lt = this.genExpr(e.l);
    const mid = this.fn.code.length;
    const rt = this.genExpr(e.r);
    const real = op === '/' || lt.k === 'real' || rt.k === 'real';
    if (real) {
      if (lt.k !== 'real' || rt.k !== 'real') {
        const rcode = this.fn.code.splice(mid);
        if (lt.k !== 'real') this.emit(OP.f64_convert_i32_s);
        for (const b of rcode) this.fn.code.push(b);
        if (rt.k !== 'real') this.emit(OP.f64_convert_i32_s);
      }
      const m = { '+': OP.f64_add, '-': OP.f64_sub, '*': OP.f64_mul, '/': OP.f64_div, '=': OP.f64_eq, '<>': OP.f64_ne, '<': OP.f64_lt, '<=': OP.f64_le, '>': OP.f64_gt, '>=': OP.f64_ge };
      if (!m[op]) throw new Error(`real operator ${op}`);
      this.emit(m[op]);
      return ['=', '<>', '<', '<=', '>', '>='].includes(op) ? BOOL : REAL;
    }
    void save;
    const m = { '+': OP.i32_add, '-': OP.i32_sub, '*': OP.i32_mul, div: OP.i32_div_s, mod: OP.i32_rem_s, '=': OP.i32_eq, '<>': OP.i32_ne, '<': OP.i32_lt_s, '<=': OP.i32_le_s, '>': OP.i32_gt_s, '>=': OP.i32_ge_s };
    if (!m[op]) throw new Error(`integer operator ${op}`);
    this.emit(m[op]);
    return ['=', '<>', '<', '<=', '>', '>='].includes(op) ? BOOL : INT;
  }

  get builtinFuncs() {
    return BUILTIN_FUNCS;
  }

  genBuiltinFunc(e) {
    const a = e.args;
    switch (e.name) {
      case 'abs': {
        const t = this.genExpr(a[0]);
        if (t.k === 'real') { this.emit(OP.f64_abs); return REAL; }
        const x = this.tmpLocal(I32);
        this.lset(x);
        // select gives the first value when the condition is not zero: x<0 gives 0-x
        this.emitI32(0); this.lget(x); this.emit(OP.i32_sub);
        this.lget(x);
        this.lget(x); this.emitI32(0); this.emit(OP.i32_lt_s, OP.select);
        this.freeTmp(I32, x);
        return INT;
      }
      case 'odd': this.genInt(a[0]); this.emitI32(1); this.emit(OP.i32_and); return BOOL;
      case 'chr': this.genInt(a[0]); return CHAR;
      case 'ord': this.genInt(a[0]); return INT;
      case 'succ': this.genInt(a[0]); this.emitI32(1); this.emit(OP.i32_add); return INT;
      case 'pred': this.genInt(a[0]); this.emitI32(1); this.emit(OP.i32_sub); return INT;
      case 'sqr': {
        const t = this.genExpr(a[0]);
        if (t.k === 'real') { const x = this.tmpLocal(F64); this.emit(OP.local_tee); this.emitU(x); this.lget(x); this.emit(OP.f64_mul); this.freeTmp(F64, x); return REAL; }
        const x = this.tmpLocal(I32); this.emit(OP.local_tee); this.emitU(x); this.lget(x); this.emit(OP.i32_mul); this.freeTmp(I32, x); return INT;
      }
      case 'round': this.genReal(a[0]); this.call(this.round); return INT;
      case 'trunc': this.genReal(a[0]); this.emit(0xfc, 2); return INT;
      case 'eof': case 'eoln': {
        const f = a.length ? this.lvalue(a[0]) : this.lvalue({ k: 'id', name: 'input' });
        this.addr(f);
        this.call(this.helpers[e.name === 'eof' ? 'f_eof' : 'f_eoln']);
        return BOOL;
      }
      case 'curpos': {
        this.addr(this.lvalue(a[0]));
        this.call(this.helpers.f_curpos);
        return INT;
      }
      case 'erstat': {
        this.addr(this.lvalue(a[0]));
        this.call(this.helpers.f_erstat);
        return INT;
      }
    }
    throw new Error(`builtin function ${e.name}`);
  }

  genCall(e, wantValue) {
    const p = this.procs.get(e.name);
    if (!p) throw new Error(`unknown procedure ${e.name}`);
    if (e.args.length !== p.params.length) throw new Error(`${e.name}: ${e.args.length} arguments for ${p.params.length} parameters`);
    e.args.forEach((arg, i) => {
      const prm = p.params[i];
      if (prm.isVar || prm.type.k === 'array' || prm.type.k === 'record' || prm.type.k === 'file') {
        const lv = this.lvalue(arg);
        if (lv.kind !== 'mem') throw new Error(`${e.name}: argument ${i + 1} needs an address`);
        this.addr(lv);
      } else this.genValueFor(prm.type, arg);
    });
    this.call(p.index);
    if (wantValue) {
      if (!p.result) throw new Error(`procedure ${e.name} used as a function`);
      return p.result;
    }
    if (p.result) this.emit(OP.drop);
    return null;
  }

  genCallStmt(s) {
    if (this.procs.has(s.name)) { this.genCall(s, false); return; }
    const h = this.helpers;
    const fileArg = (args, dflt = 'output') => {
      if (args.length) {
        const a0 = args[0];
        if (a0.k !== 'fmt') {
          try {
            const lv = this.lvalue(a0);
            if (lv.type.k === 'file') return { lv, rest: args.slice(1) };
          } catch { /* not a variable */ }
        }
      }
      return { lv: this.lvalue({ k: 'id', name: dflt }), rest: args };
    };
    switch (s.name) {
      case 'write': case 'writeln': {
        const { lv, rest } = fileArg(s.args);
        for (const arg of rest) this.genWriteArg(lv, arg);
        if (s.name === 'writeln') { this.addr(lv); this.call(h.f_wln); }
        return;
      }
      case 'read': case 'readln': {
        const { lv, rest } = fileArg(s.args, 'input');
        for (const arg of rest) {
          const tv = this.lvalue(arg);
          if (lv.type.text && tv.type.k === 'ord' && tv.type.base === 'char') {
            this.storeLv(tv, () => { const o = this.memOp({ ...lv, off: lv.off + FILE_SLOT }); this.load(CHAR, o); });
            this.addr(lv); this.call(h.f_get);
          } else if (lv.type.text) {
            this.storeLv(tv, () => { this.addr(lv); this.call(h.f_rint); });
          } else {
            // binary file: the variable takes the buffer, then get
            this.storeLv(tv, () => { const o = this.memOp({ ...lv, off: lv.off + FILE_SLOT }); this.load(lv.type.elem, o); });
            this.addr(lv); this.call(h.f_get);
          }
        }
        if (s.name === 'readln') { this.addr(lv); this.call(h.f_rln); }
        return;
      }
      case 'reset': case 'rewrite': {
        const lv = this.lvalue(s.args[0]);
        this.addr(lv);
        this.emitI32((s.name === 'reset' ? 0 : 1) | (lv.type.text ? 2 : 0));
        if (s.args.length > 1) {
          const n = s.args[1];
          if (n.k === 'str') { this.emitI32(this.stringAddr(n.v)); this.emitI32(n.v.length); }
          else {
            const nl = this.lvalue(n);
            if (!isCharArray(nl.type)) throw new Error('file name must be a char array');
            this.addr(nl); this.emitI32(nl.type.size);
          }
        } else {
          const nm = s.args[0].name ?? 'file';
          this.emitI32(this.stringAddr(nm)); this.emitI32(nm.length);
        }
        this.emitI32(lv.type.elem.size);
        this.call(h.f_open);
        return;
      }
      case 'get': case 'put': case 'close': case 'break': {
        this.addr(this.lvalue(s.args[0]));
        this.call(h['f_' + s.name]);
        return;
      }
      case 'breakin': return; // the terminal input buffer has nothing to clear
      case 'setpos': {
        this.addr(this.lvalue(s.args[0])); this.genInt(s.args[1]);
        this.call(h.f_setpos);
        return;
      }
    }
    throw new Error(`line ${s.line}: unknown procedure ${s.name}`);
  }

  genWriteArg(flv, arg) {
    const h = this.helpers;
    const e = arg.k === 'fmt' ? arg.e : arg;
    const width = () => { if (arg.k === 'fmt') this.genInt(arg.w); else this.emitI32(0); };
    if (!flv.type.text) {
      // binary file: the buffer takes the value, then put
      const o = this.memOp({ ...flv, off: flv.off + FILE_SLOT });
      this.genValueFor(flv.type.elem, e);
      this.store(flv.type.elem, o);
      this.addr(flv); this.call(h.f_put);
      return;
    }
    this.addr(flv);
    if (e.k === 'str' && e.v.length !== 1) {
      this.emitI32(this.stringAddr(e.v)); this.emitI32(e.v.length); width(); this.call(h.f_wstr);
      return;
    }
    if (e.k === 'id') {
      const s = this.lookup(e.name, this.scope);
      if (s && s.kind === 'const' && typeof s.value === 'string') {
        this.emitI32(this.stringAddr(s.value)); this.emitI32(s.value.length); width(); this.call(h.f_wstr);
        return;
      }
      if (s && (s.kind === 'gvar' || s.kind === 'frame' || s.kind === 'ref') && isCharArray(s.type)) {
        this.addr(this.lvalue(e)); this.emitI32(s.type.size); width(); this.call(h.f_wstr);
        return;
      }
    }
    const t = this.genExpr(e);
    if (t.k === 'real') {
      width();
      if (arg.k === 'fmt' && arg.d) this.genInt(arg.d); else this.emitI32(-1);
      this.call(h.f_wreal);
      return;
    }
    width();
    if (t.base === 'char') this.call(h.f_wchar);
    else if (t.base === 'bool') throw new Error('write of a boolean');
    else this.call(h.f_wint);
  }
}

const BUILTIN_FUNCS = new Set(['curpos', 'abs', 'odd', 'chr', 'ord', 'succ', 'pred', 'sqr', 'round', 'trunc', 'eof', 'eoln', 'erstat']);
