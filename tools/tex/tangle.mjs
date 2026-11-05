// WEB tangler: reads a WEB file and zero or more change files,
// writes the Pascal program text and the string pool file.
// The rules follow the WEB manual and tangle.web: macros, module names,
// preprocessed strings, the pool check sum and the change file merge.
// The identifiers keep their case and underscores; the compiler folds the case.

const CHECK_SUM_PRIME = 0o3777777667;

/** Merge one change file into the master lines (the rules of tangle.web, section "Input"). */
export function applyChanges(masterLines, changeText, changeName = 'change file') {
  const ch = changeText.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''));
  const changes = [];
  let i = 0;
  while (i < ch.length) {
    if (/^@[xX]/.test(ch[i])) {
      const from = [], to = [];
      i++;
      while (i < ch.length && !/^@[yY]/.test(ch[i])) from.push(ch[i++]);
      i++;
      while (i < ch.length && !/^@[zZ]/.test(ch[i])) to.push(ch[i++]);
      if (i >= ch.length) throw new Error(`${changeName}: change file ended without @z`);
      i++;
      changes.push({ from, to });
    } else i++;
  }
  const master = masterLines.map((l) => l.replace(/\s+$/, ''));
  const out = [];
  let m = 0;
  for (const [n, c] of changes.entries()) {
    if (c.from.length === 0) throw new Error(`${changeName}: change ${n + 1} has no @x lines`);
    // find the next master line that matches the first line of the change
    let found = -1;
    for (let k = m; k < master.length; k++) {
      if (master[k] === c.from[0]) {
        let ok = true;
        for (let j = 1; j < c.from.length; j++) if (master[k + j] !== c.from[j]) { ok = false; break; }
        if (ok) { found = k; break; }
        throw new Error(`${changeName}: change ${n + 1} does not match at master line ${k + 1}: ${c.from[0]}`);
      }
    }
    if (found < 0) throw new Error(`${changeName}: change ${n + 1} did not match: ${c.from[0]}`);
    for (; m < found; m++) out.push(master[m]);
    out.push(...c.to);
    m = found + c.from.length;
  }
  for (; m < master.length; m++) out.push(master[m]);
  return { lines: out, count: changes.length };
}

// ---- lexical scan of the merged WEB text ----

const T = { ID: 'id', NUM: 'num', REAL: 'real', STR: 'str', PSTR: 'pstr', SYM: 'sym', MOD: 'mod', CTL: 'ctl', VERB: 'verb', OCOM: 'ocom', CCOM: 'ccom', JOIN: 'join', PARAM: 'param' };

class WebScanner {
  constructor(lines) {
    this.lines = lines;
    this.line = 0;
    this.pos = 0;
  }
  get cur() { return this.lines[this.line] ?? null; }
  eof() { return this.line >= this.lines.length; }
  ch() {
    const l = this.cur;
    if (l === null) return null;
    return this.pos < l.length ? l[this.pos] : '\n';
  }
  adv() {
    const l = this.cur;
    if (l === null) return;
    if (this.pos < l.length) this.pos++;
    else { this.line++; this.pos = 0; }
  }
  // Skip to the next control code that matters (tangle skip_ahead). Returns its code letter.
  skipAhead() {
    for (;;) {
      if (this.eof()) return 'NEW';
      const l = this.cur;
      const at = l.indexOf('@', this.pos);
      if (at < 0) { this.line++; this.pos = 0; continue; }
      const c = at + 1 < l.length ? l[at + 1] : ' ';
      this.pos = at + 2;
      const code = controlCode(c);
      if (code !== 'IGN' || c === '>') return code === 'IGN' ? '>' : code;
    }
  }
  // Read a module name after @< up to @>. Returns the normalised name.
  readModName() {
    let s = '';
    for (;;) {
      if (this.eof()) throw new Error('module name did not end');
      const c = this.ch();
      if (c === '@') {
        this.adv();
        const d = this.ch();
        if (d === '>') { this.adv(); break; }
        if (d === '@') { s += '@'; this.adv(); continue; }
        s += '@' + d; this.adv(); continue;
      }
      s += c === '\n' ? ' ' : c;
      this.adv();
    }
    return s.replace(/\s+/g, ' ').trim();
  }
  // Skip control text such as @t...@> or @^...@>.
  skipControlText() {
    for (;;) {
      if (this.eof()) return;
      const c = this.ch();
      this.adv();
      if (c === '@') {
        const d = this.ch();
        this.adv();
        if (d === '>') return;
      }
    }
  }
  skipComment() {
    // Pascal comment in WEB code: TeX text, braces balance; \ escapes the next char.
    let depth = 1;
    for (;;) {
      if (this.eof()) throw new Error('comment did not end');
      const c = this.ch();
      this.adv();
      if (c === '\\') { this.adv(); continue; }
      if (c === '@') { const d = this.ch(); this.adv(); if (d === '@') continue; continue; }
      if (c === '{') depth++;
      else if (c === '}') { if (--depth === 0) return; }
    }
  }
  // tangle get_next: one token of Pascal or definition text.
  next() {
    for (;;) {
      if (this.eof()) return { t: T.CTL, v: 'NEW' };
      const c = this.ch();
      if (c === '\n' || c === ' ' || c === '\t') { this.adv(); continue; }
      if (/[A-Za-z]/.test(c)) {
        let s = '';
        while (/[A-Za-z0-9_]/.test(this.ch() ?? '')) { s += this.ch(); this.adv(); }
        return { t: T.ID, v: s };
      }
      if (/[0-9]/.test(c)) {
        let s = '';
        while (/[0-9]/.test(this.ch() ?? '')) { s += this.ch(); this.adv(); }
        const l = this.cur;
        if (l[this.pos] === '.' && /[0-9]/.test(l[this.pos + 1] ?? '')) {
          s += '.'; this.adv();
          while (/[0-9]/.test(this.ch() ?? '')) { s += this.ch(); this.adv(); }
          if (/[eE]/.test(this.ch() ?? '') && /[-+0-9]/.test(l[this.pos + 1] ?? '')) {
            s += 'e'; this.adv();
            if (/[-+]/.test(this.ch())) { s += this.ch(); this.adv(); }
            while (/[0-9]/.test(this.ch() ?? '')) { s += this.ch(); this.adv(); }
          }
          return { t: T.REAL, v: s };
        }
        return { t: T.NUM, v: Number(s) };
      }
      if (c === '"') {
        // preprocessed string; "" is a quote, @@ is an at sign
        this.adv();
        let s = '', raw = '';
        for (;;) {
          const d = this.ch();
          if (d === '\n' || d === null) throw new Error(`string did not end at line ${this.line + 1}`);
          this.adv();
          if (d === '"') {
            if (this.ch() === '"') { this.adv(); s += '"'; raw += '""'; continue; }
            break;
          }
          if (d === '@') {
            if (this.ch() === '@') { this.adv(); s += '@'; raw += '@@'; continue; }
            throw new Error(`single @ in string at line ${this.line + 1}`);
          }
          s += d; raw += d;
        }
        return { t: T.STR, v: s };
      }
      if (c === "'") {
        this.adv();
        let s = '';
        for (;;) {
          const d = this.ch();
          if (d === '\n' || d === null) throw new Error(`Pascal string did not end at line ${this.line + 1}`);
          this.adv();
          if (d === "'") {
            if (this.ch() === "'") { this.adv(); s += "'"; continue; }
            break;
          }
          if (d === '@') { if (this.ch() === '@') this.adv(); s += '@'; continue; }
          s += d;
        }
        return { t: T.PSTR, v: s };
      }
      if (c === '{') { this.adv(); this.skipComment(); continue; }
      if (c === '@') {
        this.adv();
        const d = this.ch();
        this.adv();
        const code = controlCode(d);
        switch (code) {
          case '@': return { t: T.SYM, v: '@' };
          case 'OCT': {
            let s = '';
            while (/[0-7]/.test(this.ch() ?? '')) { s += this.ch(); this.adv(); }
            return { t: T.NUM, v: parseInt(s, 8) };
          }
          case 'HEX': {
            let s = '';
            while (/[0-9A-F]/.test(this.ch() ?? '')) { s += this.ch(); this.adv(); }
            return { t: T.NUM, v: parseInt(s, 16) };
          }
          case 'SUM': return { t: T.CTL, v: 'SUM' };
          case 'NEW': case 'DEF': case 'FMT': case 'PAS': return { t: T.CTL, v: code };
          case 'MOD': return { t: T.MOD, v: this.readModName() };
          case 'OCOM': return { t: T.OCOM };
          case 'CCOM': return { t: T.CCOM };
          case 'CTX': this.skipControlText(); continue;
          case 'JOIN': return { t: T.JOIN };
          case 'VERB': {
            let s = '';
            for (;;) {
              const e = this.ch();
              if (e === '\n' || e === null) break;
              this.adv();
              if (e === '@') { const f = this.ch(); this.adv(); if (f === '>') break; s += f === '@' ? '@' : '@' + f; continue; }
              s += e;
            }
            return { t: T.VERB, v: s };
          }
          default: continue; // ignored codes: @! @, @/ @| @# @+ @; @\ and so on
        }
      }
      this.adv();
      const two = c + (this.ch() ?? '');
      if ([':=', '<>', '<=', '>=', '..', '=='].includes(two)) {
        this.adv();
        return { t: T.SYM, v: two };
      }
      if (c === '(' && this.ch() === '*') { this.adv(); return { t: T.OCOM }; }
      if (c === '*' && this.ch() === ')') { this.adv(); return { t: T.CCOM }; }
      return { t: T.SYM, v: c };
    }
  }
}

function controlCode(c) {
  switch (c) {
    case '@': return '@';
    case "'": return 'OCT';
    case '"': return 'HEX';
    case '$': return 'SUM';
    // tangle.web gives each line a space at its end, so `@` at the end of a line starts a module
    case ' ': case '\t': case '\n': case '*': return 'NEW';
    case 'D': case 'd': return 'DEF';
    case 'F': case 'f': return 'FMT';
    case '{': return 'OCOM';
    case '}': return 'CCOM';
    case 'P': case 'p': return 'PAS';
    case 'T': case 't': case '^': case '.': case ':': return 'CTX';
    case '&': return 'JOIN';
    case '<': return 'MOD';
    case '=': return 'VERB';
    case '\\': return 'FORCE';
    default: return 'IGN';
  }
}

/**
 * Tangle a WEB program.
 * @param {string} webText the master WEB file
 * @param {{name:string,text:string}[]} changeFiles applied in order
 * @returns {{pascal:string, pool:string, stats:object}}
 */
export function tangle(webText, changeFiles = []) {
  let lines = webText.split(/\r?\n/);
  const changeCounts = [];
  for (const cf of changeFiles) {
    const r = applyChanges(lines, cf.text, cf.name);
    lines = r.lines;
    changeCounts.push({ name: cf.name, changes: r.count });
  }
  const sc = new WebScanner(lines);

  const macros = new Map(); // lower-case name -> {kind:'num'|'simple'|'param', value|tokens}
  const strings = new Map(); // string text -> pool number
  const pool = [];
  let checkSum = 271828;

  const stringToken = (s) => {
    if (s.length === 1) return { t: T.NUM, v: s.charCodeAt(0) };
    let n = strings.get(s);
    if (n === undefined) {
      n = 256 + pool.length;
      strings.set(s, n);
      pool.push(s);
      if (s.length > 99) throw new Error(`preprocessed string too long: ${s}`);
      checkSum = checkSum + checkSum + s.length;
      while (checkSum > CHECK_SUM_PRIME) checkSum -= CHECK_SUM_PRIME;
      for (const ch of s) {
        checkSum = checkSum + checkSum + ch.charCodeAt(0);
        while (checkSum > CHECK_SUM_PRIME) checkSum -= CHECK_SUM_PRIME;
      }
    }
    return { t: T.NUM, v: n };
  };

  // Phase one: scan the modules.
  const defs = []; // {name, tokens} in order of appearance
  const fullNames = new Set();
  const noteName = (n) => { if (!n.endsWith('...')) fullNames.add(n); };
  let code = sc.skipAhead();
  while (code !== 'NEW') code = sc.skipAhead();
  let moduleCount = 0;
  const STARTS = ['DEF', 'PAS', 'MOD', 'NEW'];
  while (!sc.eof()) {
    moduleCount++;
    // definition part
    let nc = null;
    for (;;) {
      while (nc === null || !STARTS.includes(nc)) nc = sc.skipAhead();
      if (nc !== 'DEF') break;
      const nameTok = sc.next();
      if (nameTok.t !== T.ID) throw new Error(`definition without identifier near line ${sc.line + 1}`);
      const name = nameTok.v.toLowerCase();
      let tok = sc.next();
      let param = false;
      if (tok.t === T.SYM && tok.v === '(') {
        const h = sc.next(), r = sc.next();
        if (!(h.t === T.SYM && h.v === '#' && r.t === T.SYM && r.v === ')')) throw new Error(`bad parameter of macro ${name}`);
        param = true;
        tok = sc.next();
      }
      if (tok.t === T.SYM && tok.v === '=' && !param) {
        // numeric macro: a sum of terms
        let value = 0, sign = 1, any = false;
        for (;;) {
          const save = { line: sc.line, pos: sc.pos };
          const x = sc.next();
          if (x.t === T.NUM) { value += sign * x.v; sign = 1; any = true; }
          else if (x.t === T.STR) { value += sign * stringToken(x.v).v; sign = 1; any = true; }
          else if (x.t === T.ID) {
            const m = macros.get(x.v.toLowerCase());
            if (!m || m.kind !== 'num') throw new Error(`numeric macro ${name} uses non-numeric ${x.v}`);
            value += sign * m.value; sign = 1; any = true;
          } else if (x.t === T.SYM && x.v === '+') { /* keep sign */ }
          else if (x.t === T.SYM && x.v === '-') sign = -sign;
          else if (x.t === T.CTL || x.t === T.MOD) { sc.line = save.line; sc.pos = save.pos; break; }
          else throw new Error(`bad token in numeric macro ${name}: ${JSON.stringify(x)}`);
        }
        if (!any) throw new Error(`empty numeric macro ${name}`);
        macros.set(name, { kind: 'num', value });
        nc = null;
        continue;
      }
      if (!(tok.t === T.SYM && tok.v === '==')) throw new Error(`bad macro ${name}: ${JSON.stringify(tok)}`);
      const { tokens, end } = scanRepl(sc, false, stringToken, noteName);
      macros.set(name, { kind: param ? 'param' : 'simple', tokens });
      nc = end;
    }
    if (nc === 'NEW') continue;
    let target = null;
    if (nc === 'MOD') {
      target = sc.readModName();
      noteName(target);
      let x = sc.next();
      while (x.t === T.SYM && x.v === '+') x = sc.next();
      if (!(x.t === T.SYM && (x.v === '=' || x.v === '=='))) throw new Error(`module <${target}>: = sign missing`);
    }
    const { tokens, end } = scanRepl(sc, true, stringToken, noteName);
    defs.push({ name: target, tokens });
    if (end !== 'NEW') throw new Error(`Pascal part ended by ${end}`);
  }

  // Resolve abbreviated module names against the full names.
  const fullList = [...fullNames];
  const resolveCache = new Map();
  const resolve = (name) => {
    if (!name.endsWith('...')) return name;
    let r = resolveCache.get(name);
    if (r) return r;
    const pre = name.slice(0, -3).trim();
    const hits = fullList.filter((n) => n.startsWith(pre));
    if (hits.length !== 1) throw new Error(`module prefix <${name}> matches ${hits.length} names`);
    resolveCache.set(name, hits[0]);
    return hits[0];
  };
  const modules = new Map();
  const unnamed = [];
  for (const d of defs) {
    if (d.name === null) { unnamed.push(d.tokens); continue; }
    const full = resolve(d.name);
    const arr = modules.get(full);
    if (arr) arr.push(d.tokens); else modules.set(full, [d.tokens]);
  }

  // Phase two: expand the unnamed module.
  const out = [];
  const used = new Set();
  const expandModule = (name, depth) => {
    const full = resolve(name);
    if (!modules.has(full)) throw new Error(`module never defined: <${full}>`);
    used.add(full);
    if (depth > 200) throw new Error(`module recursion at <${full}>`);
    for (const toks of modules.get(full)) expandTokens(toks, depth + 1);
  };
  const expandTokens = (toks, depth) => {
    // stream with push-back for macro argument collection
    const stream = { toks, i: 0, parent: null };
    expandStream(stream, depth);
  };
  const expandStream = (top, depth) => {
    let st = top;
    const nextTok = () => {
      while (st && st.i >= st.toks.length) { if (st === top) return null; st = st.parent; }
      return st ? st.toks[st.i++] : null;
    };
    const peekTok = () => {
      let s = st;
      while (s && s.i >= s.toks.length) { if (s === top) return null; s = s.parent; }
      return s ? s.toks[s.i] : null;
    };
    for (;;) {
      const tk = nextTok();
      if (!tk) return;
      if (tk.t === T.ID) {
        const m = macros.get(tk.v.toLowerCase());
        if (m) {
          if (m.kind === 'num') { out.push({ t: T.NUM, v: m.value }); continue; }
          if (m.kind === 'simple') { st = { toks: m.tokens, i: 0, parent: st }; continue; }
          // parametric: collect the argument
          const p = peekTok();
          if (!p || !(p.t === T.SYM && p.v === '(')) throw new Error(`macro ${tk.v} needs an argument`);
          nextTok();
          const arg = [];
          let bal = 0;
          for (;;) {
            const a = nextTok();
            if (!a) throw new Error(`argument of ${tk.v} did not end`);
            if (a.t === T.SYM && a.v === '(') bal++;
            if (a.t === T.SYM && a.v === ')') { if (bal === 0) break; bal--; }
            arg.push(a);
          }
          const body = [];
          for (const b of m.tokens) {
            if (b.t === T.PARAM) body.push(...arg); else body.push(b);
          }
          st = { toks: body, i: 0, parent: st };
          continue;
        }
        out.push(tk);
        continue;
      }
      if (tk.t === T.MOD) { expandModule(tk.v, depth); continue; }
      if (tk.t === T.CTL && tk.v === 'SUM') { out.push({ t: T.NUM, v: 'SUM' }); continue; }
      out.push(tk);
    }
  };
  for (const toks of unnamed) expandTokens(toks, 0);

  // Write the Pascal text. Meta-comments (@{ ... @}) are dropped with their contents.
  let pascal = '';
  let lineLen = 0;
  let commentDepth = 0;
  let joinNext = false;
  let prev = null;
  const emit = (s, kind) => {
    // no space next to a period, so that `0 . 0` of a macro becomes the real 0.0
    const glue = joinNext || s === '.' || prev === '.';
    if (lineLen > 100 && !glue) { pascal += '\n'; lineLen = 0; }
    else if (prev !== null && !glue) { pascal += ' '; lineLen++; }
    pascal += s;
    lineLen += s.length;
    prev = s === '.' ? '.' : kind;
    joinNext = false;
  };
  for (const tk of out) {
    if (tk.t === T.OCOM) { commentDepth++; continue; }
    if (tk.t === T.CCOM) { if (commentDepth > 0) commentDepth--; continue; }
    if (commentDepth > 0) continue;
    switch (tk.t) {
      case T.JOIN: joinNext = true; break;
      case T.ID: emit(tk.v, 'w'); break;
      case T.NUM: emit(String(tk.v === 'SUM' ? checkSum : tk.v), 'w'); break;
      case T.REAL: emit(tk.v, 'w'); break;
      case T.PSTR: emit("'" + tk.v.replace(/'/g, "''") + "'", 's'); break;
      case T.VERB: emit(tk.v, 'w'); break;
      case T.SYM: emit(tk.v, 's'); break;
      case T.STR: throw new Error('unconverted string');
      default: throw new Error(`token ${tk.t} in output`);
    }
  }
  pascal += '\n';

  let poolText = '';
  for (const s of pool) poolText += String(s.length).padStart(2, '0') + s + '\n';
  poolText += '*' + String(checkSum).padStart(9, '0') + '\n';
  const unused = [...modules.keys()].filter((n) => !used.has(n));
  return {
    pascal,
    pool: poolText,
    stats: { modules: moduleCount, macros: macros.size, namedModules: modules.size, strings: pool.length, checkSum, changeFiles: changeCounts, unusedModules: unused },
  };
}


// tangle scan_repl: tokens of a macro body (code=false) or a Pascal part (code=true).
function scanRepl(sc, code, stringToken, noteName) {
  const tokens = [];
  for (;;) {
    const save = { line: sc.line, pos: sc.pos };
    const tk = sc.next();
    if (tk.t === T.CTL) {
      if (tk.v === 'SUM') { tokens.push(tk); continue; }
      if (tk.v === 'NEW') return { tokens, end: 'NEW' };
      if (!code) return { tokens, end: tk.v };
      throw new Error(`@${tk.v} in Pascal text near line ${sc.line + 1}`);
    }
    if (tk.t === T.MOD) {
      if (!code) {
        // a module name ends a definition part: go back so that skipAhead finds it again
        sc.line = save.line; sc.pos = save.pos;
        return { tokens, end: null };
      }
      noteName(tk.v);
      tokens.push(tk);
      continue;
    }
    if (tk.t === T.STR) { tokens.push(stringToken(tk.v)); continue; }
    if (tk.t === T.SYM && tk.v === '#' && !code) { tokens.push({ t: T.PARAM }); continue; }
    tokens.push(tk);
  }
}
