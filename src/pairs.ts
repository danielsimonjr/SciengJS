import type { InputType, OutputFormat } from "./types.ts";

/** One (input, output) pair of the design, with the stage that renders it. */
export interface PairSpec {
  type: InputType;
  format: OutputFormat;
  stage: string;
}

/** The pairs of the design section "Scope". A pair missing here is unsupported. */
export const PAIRS: readonly PairSpec[] = [
  { type: "dot", format: "svg", stage: "graph" },
  { type: "dot", format: "png", stage: "graph" },
  { type: "dot", format: "pdf", stage: "browser" },
  { type: "mermaid", format: "svg", stage: "graph" },
  { type: "mermaid", format: "png", stage: "graph" },
  { type: "mermaid", format: "pdf", stage: "browser" },
  { type: "math", format: "svg", stage: "math" },
  { type: "math", format: "png", stage: "math" },
  { type: "math", format: "pdf", stage: "browser" },
  { type: "tikz", format: "svg", stage: "tex" },
  { type: "tikz", format: "png", stage: "tex" },
  { type: "tikz", format: "pdf", stage: "browser" },
  { type: "plot", format: "svg", stage: "plot" },
  { type: "plot", format: "png", stage: "plot" },
  { type: "plot", format: "pdf", stage: "browser" },
  { type: "plot", format: "html", stage: "plot" },
  { type: "sysml", format: "svg", stage: "graph" },
  { type: "sysml", format: "png", stage: "graph" },
  { type: "sysml", format: "pdf", stage: "browser" },
  { type: "step", format: "html", stage: "mesh" },
  { type: "step", format: "png", stage: "browser" },
  { type: "step", format: "glb", stage: "mesh" },
  { type: "iges", format: "html", stage: "mesh" },
  { type: "iges", format: "png", stage: "browser" },
  { type: "iges", format: "glb", stage: "mesh" },
  { type: "brep", format: "html", stage: "mesh" },
  { type: "brep", format: "png", stage: "browser" },
  { type: "brep", format: "glb", stage: "mesh" },
  { type: "cad", format: "html", stage: "mesh" },
  { type: "cad", format: "png", stage: "browser" },
  { type: "cad", format: "glb", stage: "mesh" },
  { type: "cad", format: "stl", stage: "mesh" },
  { type: "html", format: "png", stage: "browser" },
  { type: "html", format: "pdf", stage: "browser" },
  { type: "html", format: "md", stage: "html" },
];

/** Returns the pair of the table, or undefined when the design does not list it. */
export function findPair(type: InputType, format: OutputFormat): PairSpec | undefined {
  return PAIRS.find((p) => p.type === type && p.format === format);
}
