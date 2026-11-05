/** The approval manifest of the SysML corpus: each source, its render options and its approval. */
export interface SysmlApproval {
  entries: { source: string; options: Record<string, unknown>; approved: boolean }[];
}

/** The checkable properties of a Graphviz SVG: the title of each node, in order, and the number of edges. */
export function svgProperties(svg: string): { nodes: string[]; edges: number } {
  const nodes = [...svg.matchAll(/<g id="node\d+" class="node">\s*<title>([^<]*)<\/title>/g)].map((m) => m[1]!);
  const edges = [...svg.matchAll(/<g id="edge\d+" class="edge">/g)].length;
  return { nodes, edges };
}
