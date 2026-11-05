import { dotToSvg } from "../graph/dot.ts";
import { parseSysml } from "./parse.ts";
import { readSysmlOptions, sysmlToDot } from "./views.ts";

/** The SVG text and the warnings of one SysML render. */
export interface SysmlSvg {
  svg: string;
  warnings: string[];
}

/** Renders one SysML source to SVG: the parser, the selected view to DOT, then the graph stage. */
export async function renderSysmlSvg(source: string, options: Record<string, unknown>): Promise<SysmlSvg> {
  const opts = readSysmlOptions(options);
  const model = parseSysml(source, opts.lenient);
  const dot = await dotToSvg(sysmlToDot(model, opts));
  return { svg: dot.svg, warnings: [...model.warnings, ...dot.warnings] };
}
