import { RenderError } from "../errors.ts";
import { stripImageAttributes, dropImageElements } from "./image.ts";

type VizModule = typeof import("@viz-js/viz");
type Viz = Awaited<ReturnType<VizModule["instance"]>>;

let vizInstancePromise: Promise<Viz> | undefined;

async function createVizInstance(): Promise<Viz> {
  const viz = await import("@viz-js/viz");
  return viz.instance();
}

function vizInstance(): Promise<Viz> {
  if (vizInstancePromise === undefined) {
    vizInstancePromise = createVizInstance();
  }
  return vizInstancePromise;
}

/** The SVG of a DOT graph, and the warnings of the render. */
export interface DotSvgResult {
  svg: string;
  warnings: string[];
}

/** Renders a DOT source to SVG with the viz library. Image attributes are removed first. A syntax error rejects with E_INPUT. */
export async function dotToSvg(source: string): Promise<DotSvgResult> {
  const stripped = stripImageAttributes(source);
  const warnings: string[] = [];
  for (const removed of stripped.removed) {
    warnings.push(
      `line ${removed.line}: image attribute "${removed.file}" removed; the graph stage reads no image file`,
    );
  }

  const viz = await vizInstance();
  const result = viz.render(stripped.source, { format: "svg" });

  if (result.status === "failure") {
    const error = result.errors.find((entry) => entry.level === "error") ?? result.errors[0];
    const lineMatch = /line (\d+)/.exec(error.message);
    throw new RenderError(
      "E_INPUT",
      error.message,
      lineMatch === null ? undefined : { line: Number(lineMatch[1]) },
    );
  }

  for (const entry of result.errors) {
    warnings.push(
      entry.level === "warning" ? "graphviz warning: " + entry.message : "graphviz message: " + entry.message,
    );
  }

  const dropped = dropImageElements(result.output);
  if (dropped.dropped > 0) {
    warnings.push("an image element that referenced a file was removed");
  }

  return { svg: dropped.svg, warnings };
}

/** The text of a DOT request. The function reads a byte source as UTF-8. */
export function dotSourceText(source: string | Uint8Array): string {
  return typeof source === "string" ? source : new TextDecoder().decode(source);
}
