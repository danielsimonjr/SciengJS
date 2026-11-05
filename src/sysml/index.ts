/**
 * The public surface of the SysML stage. The surface holds the tokenizer, the parser of the design subset, the option reader,
 * the views to DOT and the SVG render.
 */
export { tokenize, type Token, type TokenKind } from "./tokens.ts";
export {
  parseSysml,
  baseChain,
  type SysmlModel,
  type PartDef,
  type PlainDef,
  type PartUsage,
  type PortUsage,
  type Attribute,
  type Connection,
  type End,
  type Requirement,
  type RequirementDef,
  type Satisfy,
} from "./parse.ts";
export { readSysmlOptions, sysmlToDot, type SysmlOptions, type SysmlView } from "./views.ts";
export { renderSysmlSvg, type SysmlSvg } from "./render.ts";
