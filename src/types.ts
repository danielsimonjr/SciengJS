/** The input types of the design. */
export const INPUT_TYPES = [
  "dot",
  "mermaid",
  "math",
  "tikz",
  "plot",
  "sysml",
  "step",
  "iges",
  "brep",
  "cad",
  "html",
] as const;

/** One input type of the design. */
export type InputType = (typeof INPUT_TYPES)[number];

/** The output formats of the design. */
export const OUTPUT_FORMATS = ["svg", "png", "pdf", "html", "md", "glb", "stl", "3mf", "dxf"] as const;

/** One output format of the design. */
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/** Input types whose source is bytes, not text. */
export const BINARY_INPUT_TYPES: readonly InputType[] = ["step", "iges", "brep"];

/** Per-type options. Each increment types its own keys. I0 keeps the bag open. */
export type RenderOptions = Record<string, unknown>;

/** One render request. The source is text, or bytes for the binary input types. */
export interface RenderRequest {
  type: InputType;
  /** Text for text formats, bytes for step, iges and brep. */
  source: string | Uint8Array;
  format: OutputFormat;
  options?: RenderOptions;
}

/** One extracted asset, for example an image. */
export interface RenderAsset {
  name: string;
  bytes: Uint8Array;
  mime: string;
}

/** The result of one render. */
export interface RenderResult {
  bytes: Uint8Array;
  mime: string;
  /** The backend that rendered, for example "graph/viz". */
  backend: string;
  /** Each item names its source line when it has one. */
  warnings: string[];
  /** Extracted images, for example from an HTML to Markdown render. */
  assets?: RenderAsset[];
}

/** One supported pair with its stage and its readiness. */
export interface Capability {
  type: InputType;
  format: OutputFormat;
  /** The stage that the pair needs. */
  stage: string;
  /** True when the stage is ready on this machine. */
  ready: boolean;
  /** Why the pair is not ready, when it is not. */
  reason?: string;
  /** A note on the pair, for example that some inputs of the pair need another stage. */
  note?: string;
}
