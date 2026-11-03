import { dotToSvg } from "../graph/dot.ts";
import { classToDot, parseClassDiagram } from "./class.ts";
import { prepare } from "./common.ts";
import { parseSequenceDiagram } from "./sequence.ts";
import { layoutSequence } from "./sequence-layout.ts";
import { parseStateDiagram, stateToDot } from "./state.ts";

/** The SVG text and the warnings of one Mermaid render. */
export interface MermaidSvg {
  svg: string;
  warnings: string[];
}

/**
 * Renders one Mermaid source to SVG. A class or state diagram goes through DOT and the graph stage.
 * A sequence diagram is laid out here. The only option is lenient.
 */
export async function renderMermaidSvg(source: string, options: Record<string, unknown>): Promise<MermaidSvg> {
  const src = prepare(source, options);
  if (src.kind === "class") {
    const dot = await dotToSvg(classToDot(parseClassDiagram(src)));
    return { svg: dot.svg, warnings: [...src.warnings, ...dot.warnings] };
  }
  if (src.kind === "state") {
    const dot = await dotToSvg(stateToDot(parseStateDiagram(src)));
    return { svg: dot.svg, warnings: [...src.warnings, ...dot.warnings] };
  }
  const svg = layoutSequence(parseSequenceDiagram(src));
  return { svg, warnings: [...src.warnings] };
}
