import { RenderError } from "../errors.ts";
import { escapeDot, escapeRecord } from "../graph/text.ts";
import { baseChain, type Attribute, type PartDef, type PlainDef, type Requirement, type RequirementDef, type SysmlModel } from "./parse.ts";

/** The views of the design: block definition, internal block and requirements. */
export type SysmlView = "bdd" | "ibd" | "requirements";

/** The options of a SysML render after the check. */
export interface SysmlOptions {
  view: SysmlView;
  root: string | undefined;
  lenient: boolean;
}

const VIEWS: readonly SysmlView[] = ["bdd", "ibd", "requirements"];

/**
 * Reads the options `view`, `root` and `lenient`. Another key, an unknown view, `ibd` without `root`, and `root` with
 * another view reject with E_INPUT. An undefined value counts as an absent key.
 */
export function readSysmlOptions(options: Record<string, unknown>): SysmlOptions {
  const out: SysmlOptions = { view: "bdd", root: undefined, lenient: false };
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    if (key === "lenient") {
      if (typeof value !== "boolean") throw new RenderError("E_INPUT", "option lenient must be true or false");
      out.lenient = value;
    } else if (key === "view") {
      if (!VIEWS.includes(value as SysmlView)) throw new RenderError("E_INPUT", "option view must be bdd, ibd or requirements");
      out.view = value as SysmlView;
    } else if (key === "root") {
      if (typeof value !== "string") throw new RenderError("E_INPUT", "option root must be the name of a part def");
      out.root = value;
    } else {
      throw new RenderError("E_INPUT", `sysml takes no option ${key}`);
    }
  }
  if (out.view === "ibd" && out.root === undefined) throw new RenderError("E_INPUT", "the ibd view needs the option root");
  if (out.view !== "ibd" && out.root !== undefined) throw new RenderError("E_INPUT", "the option root is only for the ibd view");
  return out;
}

/** Builds the DOT source of one view of a parsed model. */
export function sysmlToDot(model: SysmlModel, options: SysmlOptions): string {
  const out = ["digraph sysml {"];
  if (options.view === "bdd") bdd(model, out);
  else if (options.view === "ibd") ibd(model, options.root!, out);
  else requirements(model, out);
  out.push("}");
  return out.join("\n") + "\n";
}

const q = (text: string): string => `"${escapeDot(text)}"`;

function attributeText(a: Attribute): string {
  return `${a.name}${a.type === undefined ? "" : ` : ${a.type}`}${a.value === undefined ? "" : ` = ${a.value}`}`;
}

/** A record label: the head, then one compartment for each non-empty list of lines. */
function record(head: string, ...compartments: string[][]): string {
  const fields = [head, ...compartments.filter((c) => c.length > 0).map((c) => c.map((l) => `${escapeRecord(l)}\\l`).join(""))];
  return `{${fields.join("|")}}`;
}

function defHead(kind: string, name: string): string {
  return `${kind}\\n${escapeRecord(name)}`;
}

function bdd(model: SysmlModel, out: string[]): void {
  out.push("  rankdir=TB;", "  node [shape=record];");
  for (const def of model.partDefs) {
    const label = record(defHead("part def", def.name), def.attributes.map(attributeText), def.ports.map((p) => `port ${p.name} : ${p.type}`));
    out.push(`  ${q(def.name)} [label="${label}"];`);
  }
  const plain = (kind: string, def: PlainDef): void => {
    out.push(`  ${q(def.name)} [label="${record(defHead(kind, def.name), def.attributes.map(attributeText))}"];`);
  };
  for (const def of model.portDefs) plain("port def", def);
  for (const def of model.interfaceDefs) plain("interface def", def);
  for (const def of model.partDefs) {
    for (const part of def.parts) {
      const name = part.multiplicity === undefined ? part.name : `${part.name} [${part.multiplicity}]`;
      out.push(`  ${q(def.name)} -> ${q(part.type)} [dir=both, arrowtail=diamond, arrowhead=none, headlabel=${q(name)}];`);
    }
    if (def.base !== undefined) out.push(`  ${q(def.name)} -> ${q(def.base)} [arrowhead=empty];`);
  }
}

function chain(model: SysmlModel, def: PartDef): PartDef[] {
  return baseChain(model.partDefs, def);
}

function ibd(model: SysmlModel, rootName: string, out: string[]): void {
  const root = model.partDefs.find((d) => d.name === rootName);
  if (root === undefined) throw new RenderError("E_INPUT", `the option root: ${rootName} names no part def`);
  const defs = chain(model, root);
  out.push("  rankdir=LR;", "  subgraph cluster_root {", `    label=${q(root.name)};`);
  for (const part of defs.flatMap((d) => d.parts)) {
    const type = model.partDefs.find((d) => d.name === part.type)!;
    const ports = chain(model, type).flatMap((d) => d.ports).map((p) => `<${p.name}> ${escapeRecord(p.name)}`);
    const head = escapeRecord(`${part.name} : ${part.type}${part.multiplicity === undefined ? "" : ` [${part.multiplicity}]`}`);
    const label = ports.length === 0 ? `{${head}}` : `{${head}|{${ports.join("|")}}}`;
    out.push(`    ${q(`part:${part.name}`)} [shape=record, label="${label}"];`);
  }
  for (const port of defs.flatMap((d) => d.ports)) {
    out.push(`    ${q(`port:${port.name}`)} [shape=box, label=${q(`${port.name} : ${port.type}`)}];`);
  }
  out.push("  }");
  const end = (e: { part: string | undefined; port: string }): string =>
    e.part === undefined ? q(`port:${e.port}`) : `${q(`part:${e.part}`)}:${q(e.port)}`;
  for (const c of defs.flatMap((d) => d.connections)) {
    const label = c.name === undefined ? "" : `, label=${q(`${c.name} : ${c.def}`)}`;
    out.push(`  ${end(c.from)} -> ${end(c.to)} [dir=none${label}];`);
  }
}

function requirements(model: SysmlModel, out: string[]): void {
  out.push("  rankdir=TB;");
  const id = (address: string): string => q(`req:${address}`);
  const node = (address: string, label: string): void => {
    out.push(`  ${id(address)} [shape=record, label="${label}"];`);
  };
  const edges: string[] = [];
  const usage = (r: Requirement, owner: string | undefined): void => {
    const head = defHead("requirement", r.def === undefined ? r.name : `${r.name} : ${r.def}`);
    node(r.address, record(head, r.attributes.map(attributeText)));
    if (owner !== undefined) edges.push(`  ${id(owner)} -> ${id(r.address)} [dir=both, arrowtail=odot, arrowhead=none];`);
    if (r.def !== undefined) edges.push(`  ${id(r.address)} -> ${id(r.def)} [style=dashed, arrowhead=normal];`);
    for (const child of r.children) usage(child, r.address);
  };
  const def = (d: RequirementDef): void => {
    node(d.name, record(defHead("requirement def", d.name), d.attributes.map(attributeText)));
    if (d.base !== undefined) edges.push(`  ${id(d.name)} -> ${id(d.base)} [arrowhead=empty];`);
    for (const child of d.children) usage(child, d.name);
  };
  model.requirementDefs.forEach(def);
  model.requirements.forEach((r) => usage(r, undefined));
  const seen = new Set<string>();
  for (const s of model.satisfies) {
    const element = q(`elem:${s.path}`);
    if (!seen.has(s.path)) {
      seen.add(s.path);
      const [defName, partName] = s.path.split(".");
      if (partName === undefined) {
        out.push(`  ${element} [shape=record, label="${record(defHead("part def", defName!))}"];`);
      } else {
        const owner = model.partDefs.find((d) => d.name === defName)!;
        const part = chain(model, owner).flatMap((d) => d.parts).find((p) => p.name === partName)!;
        out.push(`  ${element} [shape=box, label=${q(`${part.name} : ${part.type}`)}];`);
      }
    }
    edges.push(`  ${element} -> ${id(s.requirement)} [style=dashed, arrowhead=open, label="<<satisfy>>"];`);
  }
  out.push(...edges);
}
