import { inputError } from "../errors.ts";
import { tokenize, type Token } from "./tokens.ts";

/** An attribute: its name, its type name, its literal value as written, and its line. */
export interface Attribute {
  name: string;
  type: string | undefined;
  value: string | undefined;
  line: number;
}

/** A part usage inside a part def. */
export interface PartUsage {
  name: string;
  type: string;
  multiplicity: string | undefined;
  line: number;
}

/** A port usage inside a part def. */
export interface PortUsage {
  name: string;
  type: string;
  line: number;
}

/** One end of a connection: a port of a part usage, or a port of the enclosing definition when `part` is undefined. */
export interface End {
  part: string | undefined;
  port: string;
}

/** A `connect` statement, or an `interface` usage when `name` and `def` are set. */
export interface Connection {
  name: string | undefined;
  def: string | undefined;
  from: End;
  to: End;
  line: number;
}

/** A part def with its members. */
export interface PartDef {
  name: string;
  base: string | undefined;
  attributes: Attribute[];
  parts: PartUsage[];
  ports: PortUsage[];
  connections: Connection[];
  line: number;
}

/** A port def or an interface def. */
export interface PlainDef {
  name: string;
  attributes: Attribute[];
  line: number;
}

/** A requirement usage. The address is `name` at the top level and `Owner.name` inside a requirement. */
export interface Requirement {
  name: string;
  address: string;
  def: string | undefined;
  attributes: Attribute[];
  children: Requirement[];
  line: number;
}

/** A requirement def. */
export interface RequirementDef {
  name: string;
  base: string | undefined;
  attributes: Attribute[];
  children: Requirement[];
  line: number;
}

/** A `satisfy` relation. The path is a part def name or `Def.part`, after resolution. */
export interface Satisfy {
  requirement: string;
  path: string;
  line: number;
}

/** A parsed SysML source and the warnings of lenient mode. */
export interface SysmlModel {
  partDefs: PartDef[];
  portDefs: PlainDef[];
  interfaceDefs: PlainDef[];
  requirementDefs: RequirementDef[];
  requirements: Requirement[];
  satisfies: Satisfy[];
  warnings: string[];
}

type Kind = "part def" | "port def" | "interface def" | "requirement def" | "requirement";

/** The place of a statement: the source or a package, or the body of one kind of element. */
type Place = "package" | "part def" | "port def" | "interface def" | "requirement";

/** A satisfy before resolution: the requirement path, the element path, the enclosing part def and the line. */
interface RawSatisfy {
  requirement: string[];
  path: string[];
  owner: string | undefined;
  line: number;
}

/** The statements that each place allows. */
const ALLOWED: Record<string, readonly Place[]> = {
  package: ["package"],
  "part def": ["package"],
  "port def": ["package"],
  "interface def": ["package"],
  "requirement def": ["package"],
  requirement: ["package", "requirement"],
  satisfy: ["package", "part def"],
  part: ["part def"],
  port: ["part def"],
  interface: ["part def"],
  connect: ["part def"],
  attribute: ["part def", "port def", "interface def", "requirement"],
};

const KEYWORDS: ReadonlySet<string> = new Set(["package", "part", "port", "interface", "requirement", "attribute", "connect", "satisfy"]);

/**
 * Parses a source of the SysML subset of the design. A construct outside the subset rejects with E_INPUT and the line.
 * With lenient, the parser skips a statement with an unknown keyword and records a warning. The names resolve after
 * the parser reads the whole source.
 */
export function parseSysml(source: string, lenient: boolean): SysmlModel {
  return new Parser(tokenize(source), lenient).run();
}

class Parser {
  private pos = 0;
  private readonly model: SysmlModel = {
    partDefs: [], portDefs: [], interfaceDefs: [], requirementDefs: [], requirements: [], satisfies: [], warnings: [],
  };
  private readonly names = new Map<string, Kind>();
  private readonly rawSatisfies: RawSatisfy[] = [];

  constructor(private readonly tokens: Token[], private readonly lenient: boolean) {}

  run(): SysmlModel {
    this.members("package", undefined, undefined);
    const m = this.model;
    if (m.partDefs.length + m.portDefs.length + m.interfaceDefs.length + m.requirementDefs.length + m.requirements.length === 0) {
      throw inputError(1, "the source holds no definition and no requirement");
    }
    new Resolver(m, this.names).resolve(this.rawSatisfies);
    return m;
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private lastLine(): number {
    return this.tokens[this.tokens.length - 1]?.line ?? 1;
  }

  private next(what: string): Token {
    const token = this.tokens[this.pos];
    if (token === undefined) throw inputError(this.lastLine(), `expected ${what}, found the end of the source`);
    this.pos += 1;
    return token;
  }

  private symbol(value: string): Token {
    const token = this.next(`"${value}"`);
    if (token.kind !== "symbol" || token.value !== value) {
      throw inputError(token.line, `expected "${value}", found "${token.value}"`);
    }
    return token;
  }

  private isSymbol(value: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token !== undefined && token.kind === "symbol" && token.value === value;
  }

  private name(what = "a name"): string {
    const token = this.next(what);
    if (token.kind !== "name") throw inputError(token.line, `expected ${what}, found "${token.value}"`);
    return token.value;
  }

  private isWord(value: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token !== undefined && token.kind === "name" && token.value === value;
  }

  /** Reads `name ("." name)*`. */
  private path(): string[] {
    const parts = [this.name()];
    while (this.isSymbol(".")) {
      this.pos += 1;
      parts.push(this.name());
    }
    return parts;
  }

  /** Reads members until `}` when `open` is a line, or until the end of the source. */
  private members(place: Place, owner: unknown, open: number | undefined): void {
    for (;;) {
      const token = this.peek();
      if (token === undefined) {
        if (open !== undefined) throw inputError(open, "the block is not closed by }");
        return;
      }
      if (open !== undefined && token.kind === "symbol" && token.value === "}") {
        this.pos += 1;
        return;
      }
      this.statement(place, owner);
    }
  }

  /** Reads `;` or a block of members. */
  private bodyOrEnd(place: Place, owner: unknown): void {
    if (this.isSymbol(";")) {
      this.pos += 1;
      return;
    }
    const open = this.symbol("{");
    this.members(place, owner, open.line);
  }

  private define(name: string, kind: Kind, line: number): void {
    if (this.names.has(name)) throw inputError(line, `${name} is defined twice`);
    this.names.set(name, kind);
  }

  private statement(place: Place, owner: unknown): void {
    const token = this.peek()!;
    if (token.kind !== "name") throw inputError(token.line, `unexpected "${token.value}"`);
    const line = token.line;
    if (!KEYWORDS.has(token.value)) {
      if (!this.lenient) throw inputError(line, `the keyword "${token.value}" is outside the subset`);
      this.skip(token);
      return;
    }
    const isDef = this.isWord("def", 1) && token.value !== "attribute" && token.value !== "connect" && token.value !== "satisfy" && token.value !== "package";
    const statement = isDef ? `${token.value} def` : token.value;
    if (!ALLOWED[statement]!.includes(place)) {
      throw inputError(line, `${statement} is not allowed in ${place === "package" ? "a package" : `a ${place}`}`);
    }
    this.pos += isDef ? 2 : 1;
    switch (statement) {
      case "package":
        this.name();
        this.members("package", undefined, this.symbol("{").line);
        return;
      case "part def":
        return this.partDef(line);
      case "port def":
      case "interface def":
        return this.plainDef(statement, line);
      case "requirement def":
        return this.requirementDef(line);
      case "requirement":
        return this.requirement(owner as Owner | undefined, line);
      case "satisfy":
        return this.satisfy(owner as PartDef | undefined, line);
      case "attribute":
        return this.attribute(owner as Owner, line);
      case "part":
        return this.partUsage(owner as PartDef, line);
      case "port":
        return this.portUsage(owner as PartDef, line);
      case "interface":
        return this.interfaceUsage(owner as PartDef, line);
      default:
        return this.connect(owner as PartDef, line);
    }
  }

  /** Skips an unknown statement to its `;` or to its closed block, and records a warning. */
  private skip(start: Token): void {
    let depth = 0;
    for (;;) {
      const token = this.peek();
      if (token === undefined || (depth === 0 && token.kind === "symbol" && token.value === "}")) {
        throw inputError(start.line, `the statement "${start.value}" is not closed`);
      }
      this.pos += 1;
      if (token.kind !== "symbol") continue;
      if (token.value === "{") depth += 1;
      else if (token.value === "}") {
        depth -= 1;
        if (depth === 0) break;
      } else if (token.value === ";" && depth === 0) break;
    }
    this.model.warnings.push(`line ${start.line}: skipped the unsupported statement "${start.value}"`);
  }

  private base(): string | undefined {
    if (!this.isSymbol(":>")) return undefined;
    this.pos += 1;
    return this.name("a base name");
  }

  private partDef(line: number): void {
    const name = this.name();
    this.define(name, "part def", line);
    const def: PartDef = { name, base: this.base(), attributes: [], parts: [], ports: [], connections: [], line };
    this.model.partDefs.push(def);
    this.bodyOrEnd("part def", def);
  }

  private plainDef(kind: "port def" | "interface def", line: number): void {
    const name = this.name();
    this.define(name, kind, line);
    const def: PlainDef = { name, attributes: [], line };
    (kind === "port def" ? this.model.portDefs : this.model.interfaceDefs).push(def);
    this.bodyOrEnd(kind, def);
  }

  private requirementDef(line: number): void {
    const name = this.name();
    this.define(name, "requirement def", line);
    const def: RequirementDef = { name, base: this.base(), attributes: [], children: [], line };
    this.model.requirementDefs.push(def);
    this.bodyOrEnd("requirement", def);
  }

  private requirement(owner: Owner | undefined, line: number): void {
    const name = this.name();
    let def: string | undefined;
    if (this.isSymbol(":")) {
      this.pos += 1;
      def = this.name("a requirement def name");
    }
    const ownerAddress = owner === undefined ? undefined : "address" in owner ? owner.address : owner.name;
    const usage: Requirement = {
      name, address: ownerAddress === undefined ? name : `${ownerAddress}.${name}`, def, attributes: [], children: [], line,
    };
    if (owner === undefined) {
      this.define(name, "requirement", line);
      this.model.requirements.push(usage);
    } else {
      claimFeature(owner, name, line);
      (owner as RequirementDef).children.push(usage);
    }
    this.bodyOrEnd("requirement", usage);
  }

  private satisfy(owner: PartDef | undefined, line: number): void {
    const requirement = this.path();
    if (!this.isWord("by")) {
      const token = this.peek();
      throw inputError(token?.line ?? line, `expected "by", found ${token === undefined ? "the end of the source" : `"${token.value}"`}`);
    }
    this.pos += 1;
    const path = this.path();
    this.symbol(";");
    this.rawSatisfies.push({ requirement, path, owner: owner?.name, line });
  }

  private attribute(owner: Owner, line: number): void {
    const name = this.name();
    claimFeature(owner, name, line);
    let type: string | undefined;
    let value: string | undefined;
    if (this.isSymbol(":")) {
      this.pos += 1;
      type = this.name("a type name");
    }
    if (this.isSymbol("=")) {
      this.pos += 1;
      const literal = this.next("a literal");
      if (literal.kind === "symbol") throw inputError(literal.line, `expected a literal, found "${literal.value}"`);
      value = literal.kind === "string" ? JSON.stringify(literal.value) : literal.value;
    }
    this.symbol(";");
    owner.attributes.push({ name, type, value, line });
  }

  private typed(what: string): string {
    this.symbol(":");
    return this.name(what);
  }

  private partUsage(owner: PartDef, line: number): void {
    const name = this.name();
    claimFeature(owner, name, line);
    const type = this.typed("a part def name");
    let multiplicity: string | undefined;
    if (this.isSymbol("[")) {
      this.pos += 1;
      multiplicity = this.number();
      if (this.isSymbol("..")) {
        this.pos += 1;
        multiplicity += `..${this.isSymbol("*") ? (this.pos += 1, "*") : this.number()}`;
      }
      this.symbol("]");
    }
    this.symbol(";");
    owner.parts.push({ name, type, multiplicity, line });
  }

  private number(): string {
    const token = this.next("a number");
    if (token.kind !== "number") throw inputError(token.line, `expected a number, found "${token.value}"`);
    return token.value;
  }

  private portUsage(owner: PartDef, line: number): void {
    const name = this.name();
    claimFeature(owner, name, line);
    const type = this.typed("a port def name");
    this.symbol(";");
    owner.ports.push({ name, type, line });
  }

  private end(): End {
    const first = this.name("a connection end");
    if (!this.isSymbol(".")) return { part: undefined, port: first };
    this.pos += 1;
    return { part: first, port: this.name("a port name") };
  }

  private ends(): { from: End; to: End } {
    const from = this.end();
    if (!this.isWord("to")) {
      const token = this.peek();
      throw inputError(token?.line ?? this.lastLine(), `expected "to", found ${token === undefined ? "the end of the source" : `"${token.value}"`}`);
    }
    this.pos += 1;
    const to = this.end();
    this.symbol(";");
    return { from, to };
  }

  private connect(owner: PartDef, line: number): void {
    owner.connections.push({ name: undefined, def: undefined, ...this.ends(), line });
  }

  private interfaceUsage(owner: PartDef, line: number): void {
    const name = this.name();
    const def = this.typed("an interface def name");
    if (!this.isWord("connect")) {
      const token = this.peek();
      throw inputError(token?.line ?? line, `expected "connect", found ${token === undefined ? "the end of the source" : `"${token.value}"`}`);
    }
    this.pos += 1;
    owner.connections.push({ name, def, ...this.ends(), line });
  }
}

type Owner = PartDef | PlainDef | RequirementDef | Requirement;

/** The feature names of each owner, so that a name inside one owner is defined once. */
const features = new WeakMap<object, Set<string>>();

function claimFeature(owner: object, name: string, line: number): void {
  let set = features.get(owner);
  if (set === undefined) {
    set = new Set();
    features.set(owner, set);
  }
  if (set.has(name)) throw inputError(line, `${name} is defined twice`);
  set.add(name);
}

/** Checks every reference of a parsed model and resolves the satisfy paths. */
class Resolver {
  private readonly partDefs = new Map<string, PartDef>();
  private readonly requirementAddresses = new Set<string>();

  constructor(private readonly model: SysmlModel, private readonly names: Map<string, Kind>) {
    for (const def of model.partDefs) this.partDefs.set(def.name, def);
    const walk = (list: Requirement[]): void => {
      for (const r of list) {
        this.requirementAddresses.add(r.address);
        walk(r.children);
      }
    };
    for (const def of model.requirementDefs) {
      this.requirementAddresses.add(def.name);
      walk(def.children);
    }
    walk(model.requirements);
  }

  private expect(name: string, kind: Kind, line: number): void {
    if (this.names.get(name) !== kind) throw inputError(line, `${name} names no ${kind}`);
  }

  private chain(def: PartDef): PartDef[] {
    return baseChain(this.model.partDefs, def);
  }

  private partOf(def: PartDef, name: string): PartUsage | undefined {
    for (const at of this.chain(def)) {
      const found = at.parts.find((p) => p.name === name);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  private hasPort(def: PartDef, name: string): boolean {
    return this.chain(def).some((at) => at.ports.some((p) => p.name === name));
  }

  resolve(raw: RawSatisfy[]): void {
    const m = this.model;
    for (const def of m.partDefs) {
      if (def.base !== undefined) this.expect(def.base, "part def", def.line);
    }
    for (const def of m.requirementDefs) {
      if (def.base !== undefined) this.expect(def.base, "requirement def", def.line);
    }
    this.noCycle(m.partDefs);
    this.noCycle(m.requirementDefs);
    for (const def of m.partDefs) {
      for (const part of def.parts) this.expect(part.type, "part def", part.line);
      for (const port of def.ports) this.expect(port.type, "port def", port.line);
    }
    for (const def of m.partDefs) {
      for (const c of def.connections) {
        if (c.def !== undefined) this.expect(c.def, "interface def", c.line);
        this.end(def, c.from, c.line);
        this.end(def, c.to, c.line);
      }
    }
    const usages = (list: Requirement[]): void => {
      for (const r of list) {
        if (r.def !== undefined) this.expect(r.def, "requirement def", r.line);
        usages(r.children);
      }
    };
    for (const def of m.requirementDefs) usages(def.children);
    usages(m.requirements);
    for (const s of raw) m.satisfies.push(this.satisfy(s));
  }

  private noCycle(defs: readonly Specializable[]): void {
    for (const def of defs) {
      const chain = baseChain(defs, def);
      const last = chain[chain.length - 1]!;
      if (chain.some((d) => d.name === last.base)) throw inputError(def.line, `the specialization of ${def.name} is a cycle`);
    }
  }

  private end(def: PartDef, end: End, line: number): void {
    if (end.part === undefined) {
      if (!this.hasPort(def, end.port)) throw inputError(line, `${end.port} names no port of ${def.name}`);
      return;
    }
    const part = this.partOf(def, end.part);
    if (part === undefined) throw inputError(line, `${end.part} names no part of ${def.name}`);
    if (!this.hasPort(this.partDefs.get(part.type)!, end.port)) {
      throw inputError(line, `${end.port} names no port of ${end.part}`);
    }
  }

  private satisfy(raw: RawSatisfy): Satisfy {
    const requirement = raw.requirement.join(".");
    if (!this.requirementAddresses.has(requirement)) throw inputError(raw.line, `${requirement} names no requirement`);
    const [first, second, ...rest] = raw.path;
    if (rest.length > 0) throw inputError(raw.line, `the path ${raw.path.join(".")} has more than two names`);
    if (second === undefined) {
      const owner = raw.owner === undefined ? undefined : this.partDefs.get(raw.owner);
      if (owner !== undefined && this.partOf(owner, first!) !== undefined) {
        return { requirement, path: `${owner.name}.${first}`, line: raw.line };
      }
      this.expect(first!, "part def", raw.line);
      return { requirement, path: first!, line: raw.line };
    }
    this.expect(first!, "part def", raw.line);
    if (this.partOf(this.partDefs.get(first!)!, second) === undefined) {
      throw inputError(raw.line, `${second} names no part of ${first}`);
    }
    return { requirement, path: `${first}.${second}`, line: raw.line };
  }
}

/** A definition that can name a base with `:>`. */
export interface Specializable {
  name: string;
  base: string | undefined;
  line: number;
}

/**
 * The chain of a definition and its bases, the definition first. The chain stops at a base that names no definition
 * of the list. The chain also stops at a base that is already in the chain, so a cycle cannot loop.
 */
export function baseChain<T extends Specializable>(defs: readonly T[], def: T): T[] {
  const out: T[] = [];
  for (let at: T | undefined = def; at !== undefined && !out.includes(at); at = defs.find((d) => d.name === at!.base)) {
    out.push(at);
  }
  return out;
}
