import { RenderError } from "../errors.ts";
import { stripImageAttributes, dropImageElements, dropStylesheetInstructions } from "./image.ts";

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

/** Renders a DOT source to SVG with the viz library. Image and stylesheet attributes are removed first. A syntax error rejects with E_INPUT. The viz instance is a parameter so that a test can fail it. */
export async function dotToSvg(source: string, getViz: () => Promise<Viz> = vizInstance): Promise<DotSvgResult> {
  const stripped = stripImageAttributes(source);
  const warnings: string[] = [];
  for (const removed of stripped.removed) {
    warnings.push(
      removed.key === "image"
        ? `line ${removed.line}: image attribute "${removed.file}" removed; the graph stage reads no image file`
        : `line ${removed.line}: ${removed.key} attribute "${removed.file}" removed; the graph stage links no external style sheet`,
    );
  }

  const viz = await getViz();
  const result = viz.render(stripped.source, { format: "svg" });

  if (result.status === "failure") {
    const error = result.errors.find((entry) => entry.level === "error") ?? result.errors[0];
    const message = error?.message ?? "graphviz failed and gave no error message";
    const lineMatch = /line (\d+)/.exec(message);
    throw new RenderError("E_INPUT", message, lineMatch === null ? undefined : { line: Number(lineMatch[1]) });
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

  const sheets = dropStylesheetInstructions(dropped.svg);
  if (sheets.dropped > 0) {
    warnings.push("a style sheet instruction that referenced a file was removed");
  }

  return { svg: sheets.svg, warnings };
}
