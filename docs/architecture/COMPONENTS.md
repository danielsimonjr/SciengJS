<!-- repo-map:no-verification -->
# sciengjs components

Each entry gives the path, the purpose and the exported signatures. The signatures copy the source.

## `src/index.ts`

Purpose: the public entry point of the package.

```ts
export function render(req: RenderRequest, config?: Partial<SciengConfig>): Promise<RenderResult>;
export function capabilities(config?: Partial<SciengConfig>): Promise<Capability[]>;
```

It re-exports `RenderError`, `RENDER_ERROR_CODES`, `loadConfig`, `INPUT_TYPES`, `OUTPUT_FORMATS` and the types.

## `src/core.ts`

Purpose: the render and capability logic. The registry and the configuration dependencies are parameters, so that tests inject them.

```ts
export function renderWithRegistry(
  req: RenderRequest,
  options: Partial<SciengConfig>,
  registry: Registry,
  configDeps?: Partial<ConfigDeps>,
): Promise<RenderResult>;

export function capabilitiesWithRegistry(
  options: Partial<SciengConfig>,
  registry: Registry,
  configDeps?: Partial<ConfigDeps>,
): Promise<Capability[]>;
```

## `src/config.ts`

Purpose: the configuration loader. It holds the only defaults of the engine.

```ts
export type NetworkPolicy = "none" | "tex-bundles" | "tex-bundles,images";

export interface SciengConfig {
  browser?: string;
  cacheDir: string;
  texBundleUrl: string;
  timeoutMs: number;
  maxSourceBytes: number;
  maxMemoryMb: number;
  allowNetwork: NetworkPolicy;
}

export function loadConfig(
  options?: Partial<SciengConfig>,
  deps?: Partial<ConfigDeps>,
): Promise<SciengConfig>;
```

`ConfigDeps` holds the environment, the platform, the home folder, the file reader and the engine version. A test injects each one.

## `src/errors.ts`

Purpose: the error type of the engine.

```ts
export const RENDER_ERROR_CODES: readonly [
  "E_INPUT", "E_UNSUPPORTED", "E_LIMIT", "E_TIMEOUT",
  "E_STAGE_MISSING", "E_CONFIG", "E_INTEGRITY", "E_INTERNAL",
];

export class RenderError extends Error {
  readonly code: RenderErrorCode;
  readonly line: number | undefined;
  readonly column: number | undefined;
  constructor(code: RenderErrorCode, message: string, position?: RenderErrorPosition);
}

export function inputError(line: number, message: string): RenderError;
```

`inputError` gives an `E_INPUT` error whose message starts with `line N:` and whose `line` is N.

## `src/registry.ts`

Purpose: maps `type:format` to a backend module.

```ts
export interface BackendEntry { backend: string; moduleUrl: string; }
export type Registry = Record<string, BackendEntry>;
export const DEFAULT_REGISTRY: Registry;
export function registryKey(type: string, format: string): string;
```

`DEFAULT_REGISTRY` names the backends of `dot` to `svg`, `dot` to `png`, `mermaid` to `svg` and `mermaid` to `png`.

## `src/pairs.ts`

Purpose: the table of supported pairs and the stage of each pair.

```ts
export interface PairSpec { type: InputType; format: OutputFormat; stage: string; }
export const PAIRS: readonly PairSpec[];
export function findPair(type: InputType, format: OutputFormat): PairSpec | undefined;
```

## `src/worker/run.ts`

Purpose: the main-thread side of a render.

```ts
export interface WorkerLimits { timeoutMs: number; maxMemoryMb: number; }
export function runInWorker(job: WorkerJob, limits: WorkerLimits): Promise<BackendOutput>;
```

## `src/worker/entry.ts`

Purpose: the worker side. The module has no export. The module reads `workerData`. The module imports the backend module. The module runs the backend module. The module posts one `WorkerMessage`.

## `src/worker/protocol.ts`

Purpose: the message shapes that the two sides share. It exports `WorkerJob`, `BackendOutput` and `WorkerMessage`.

## `src/graph/dot.ts`

Purpose: renders a DOT source to SVG with the viz library. The module removes the image attributes first. It maps the library messages to warnings. The library loads on the first call, and one module-level promise holds it.

```ts
export interface DotSvgResult { svg: string; warnings: string[] }
export function dotToSvg(source: string, getViz?: () => Promise<Viz>): Promise<DotSvgResult>;
```

`getViz` returns the viz instance. The default is the shared instance. A test passes a new instance for each source, so that the library gives its warnings for each source.

## `src/graph/text.ts`

Purpose: the text helpers of the adapters that write DOT. The Mermaid and SysML stages use them.

```ts
export function sourceText(source: string | Uint8Array): string;
export function xmlSafe(text: string): string;
export function escapeDot(text: string): string;
export function escapeRecord(text: string): string;
```

`sourceText` reads a byte source as UTF-8. `xmlSafe` replaces each code point that XML 1.0 forbids with U+FFFD. `escapeDot` escapes text for a quoted DOT string. `escapeRecord` also escapes the record symbols `{ } | < >`.

## `src/graph/image.ts`

Purpose: scans the tokens of a DOT source. The scanner removes each assignment of the key `image` and reports its line and file name. It also removes each SVG image element from the output of the library.

```ts
export function stripImageAttributes(source: string): StripResult;
export function dropImageElements(svg: string): { svg: string; dropped: number };
```

## `src/graph/backend-svg.ts`

Purpose: the backend of `dot` to `svg`. It takes no options. Any option rejects with `E_INPUT`.

## `src/graph/backend-png.ts`

Purpose: the backend of `dot` to `png`. It takes the option `scale`. It reads the raster font, which is the file of `rasterFont` or the bundled font. It renders the SVG with `dotToSvg`, and then it renders the PNG with `svgToPng`.

```ts
export function svgDocumentToPng(svg: string, request: WorkerJob["request"]): Promise<BackendOutput>;
```

`svgDocumentToPng` renders an SVG document to PNG with the font rule of the DOT backend. The Mermaid PNG backend uses it.

## `src/raster/index.ts`

Purpose: SVG to PNG through resvg. The raster module loads the WASM file once for the process. It checks the pixel buffer against `maxMemoryMb` and against the fixed cap of 1024 MB before it renders. It checks the signature of a font file.

```ts
export interface SvgToPngOptions {
  scale: number;
  maxMemoryMb: number;
  font?: Uint8Array;
  readWasm?: () => Uint8Array;
}
export function svgToPng(svg: string, options: SvgToPngOptions): Promise<Uint8Array>;
export function isFontFile(bytes: Uint8Array): boolean;
```

`readWasm` replaces the reader of the resvg WASM file. The tests use it to fail the first start.

## `src/mermaid/common.ts`

Purpose: the header and option reader of each Mermaid source. It reads the front matter, the directives, the comment lines and the header line. It rejects a Mermaid type that the native layouts do not draw with `E_UNSUPPORTED`. It reads the option `lenient`. Any other option rejects with `E_INPUT`.

```ts
export type DiagramKind = "class" | "state" | "sequence";
export function prepare(source: string, options: Record<string, unknown>, extra?: readonly string[]): Source;
```

`Source` holds the diagram kind, the header line, the content lines, the lenient flag and the warnings.

## `src/mermaid/class.ts`

Purpose: parses a `classDiagram` and builds the DOT source of the diagram.

```ts
export function parseClassDiagram(src: Source): ClassModel;
export function classToDot(model: ClassModel): string;
```

It exports the types `ClassModel`, `ClassDef`, `ClassRelation`, `ClassArrow` and `Marker`.

## `src/mermaid/state.ts`

Purpose: parses a `stateDiagram-v2` and builds the DOT source of the diagram. A composite state is outside the grammar. In lenient mode, the parser skips the state and its body.

```ts
export function parseStateDiagram(src: Source): StateModel;
export function stateToDot(model: StateModel): string;
```

It exports the types `StateModel`, `StateDef` and `StateTransition`.

## `src/mermaid/sequence.ts`

Purpose: parses a `sequenceDiagram` into participants and events. The events are messages, notes, activations, deactivations and blocks. A block holds one or more branches.

```ts
export function parseSequenceDiagram(src: Source): SequenceModel;
```

It exports the types `SequenceModel`, `Participant`, `MessageEvent`, `NoteEvent`, `ActivateEvent`, `DeactivateEvent`, `Branch`, `BlockEvent` and `SeqEvent`.

## `src/mermaid/sequence-layout.ts`

Purpose: lays out a sequence model as one SVG document. There is one column for each participant. There is one row for each message or note. Each element carries its source line in `data-scieng-line`.

```ts
export function layoutSequence(model: SequenceModel): string;
```

The layout measures each text run as 8 px for each character.

## `src/mermaid/render.ts`

Purpose: renders one Mermaid source to SVG. A class diagram or a state diagram goes through its DOT builder and `dotToSvg`. A sequence diagram goes through `layoutSequence`.

```ts
export interface MermaidSvg { svg: string; warnings: string[] }
export function renderMermaidSvg(source: string, options: Record<string, unknown>): Promise<MermaidSvg>;
```

## `src/mermaid/backend-svg.ts`

Purpose: the backend of `mermaid` to `svg`. The backend returns the SVG from `renderMermaidSvg`.

```ts
export function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/mermaid/backend-png.ts`

Purpose: the backend of `mermaid` to `png`. It renders the SVG with `renderMermaidSvg`. It then renders the PNG with `svgDocumentToPng`.

```ts
export function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/mermaid/index.ts`

Purpose: the public entry of the `./mermaid` subpath. It re-exports the functions and the types of the Mermaid stage.

## `src/sysml/tokens.ts`

Purpose: splits a SysML source into tokens. It skips the comments and the white space. The longest symbol wins, so `:>`, `::` and `..` are one token each.

```ts
export type TokenKind = "name" | "number" | "string" | "symbol";
export interface Token { readonly kind: TokenKind; readonly value: string; readonly line: number; readonly column: number }
export function tokenize(source: string): Token[];
```

## `src/sysml/parse.ts`

Purpose: the recursive-descent parser of the SysML subset. It reads the whole source, then resolves the names. Each rejection is `E_INPUT` with the line.

```ts
export interface SysmlModel {
  partDefs: PartDef[]; portDefs: PlainDef[]; interfaceDefs: PlainDef[];
  requirementDefs: RequirementDef[]; requirements: Requirement[]; satisfies: Satisfy[]; warnings: string[];
}
export interface Specializable { name: string; base: string | undefined; line: number }
export function parseSysml(source: string, lenient: boolean): SysmlModel;
export function baseChain<T extends Specializable>(defs: readonly T[], def: T): T[];
```

`baseChain` returns a definition and its bases. The parser and the views use it for the inherited parts, ports and connections.

## `src/sysml/views.ts`

Purpose: reads the options and builds the DOT source of one view.

```ts
export type SysmlView = "bdd" | "ibd" | "requirements";
export interface SysmlOptions { view: SysmlView; root: string | undefined; lenient: boolean }
export function readSysmlOptions(options: Record<string, unknown>): SysmlOptions;
export function sysmlToDot(model: SysmlModel, options: SysmlOptions): string;
```

## `src/sysml/render.ts`

Purpose: renders one SysML source to SVG: the options, the parser, the view and `dotToSvg`.

```ts
export interface SysmlSvg { svg: string; warnings: string[] }
export function renderSysmlSvg(source: string, options: Record<string, unknown>): Promise<SysmlSvg>;
```

## `src/sysml/backend-svg.ts`, `src/sysml/backend-png.ts`, `src/sysml/backend-pdf.ts`

Purpose: the backends of `sysml` to `svg`, `png` and `pdf`. The png backend reads `scale` and calls `svgDocumentToPng`. The pdf backend calls `drawSvgToPdf` in the browser stage.

```ts
export function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/sysml/index.ts`

Purpose: the public entry of the `./sysml` subpath. It re-exports the functions and the types of the SysML stage.

## `src/math/tex.ts`

Purpose: the MathJax stage of the math subpath. It converts LaTeX math to a standalone SVG. The module holds the list `MATH_PACKAGES` and the type `MathOptions`.

```ts
export function stripRequires(source: string): string;
export function rejectFontFallback(svg: string): void;
export function exToPx(value: string): string;
export function standaloneSvg(container: string): string;
export async function mathToSvg(source: string, options: MathOptions): Promise<string>;
```

The function `stripRequires` removes each `\require` command of a held package. A `\require` of any other package rejects with `E_UNSUPPORTED`.

## `src/math/font-ranges.ts`

Purpose: the font ranges of the math stage. It registers the dynamic font ranges of MathJax-Newcm, so that no range loads at run time. The module holds the table `MHCHEM_ALIASES`.

```ts
export function loadFontRanges(font: object): void;
export function defineMhchemVariant(font: object): void;
```

## `src/math/backend-svg.ts`

Purpose: the math to SVG backend. The worker calls the function `render`. The backend takes no options. Any option rejects with `E_INPUT`.

```ts
export async function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/math/backend-png.ts`

Purpose: the math to PNG backend. It renders the SVG of the formula. Then it converts that SVG to PNG at the option scale.

```ts
export async function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/math/backend-pdf.ts`

Purpose: the math to PDF backend. It renders the SVG of the formula. Then it draws that SVG to PDF in the browser stage. The backend takes no options.

```ts
export async function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/math/index.ts`

Purpose: the public entry of the `./math` subpath. It re-exports the function `mathToSvg` and the type `MathOptions`.

## `src/plot/reader.ts`

Purpose: the reader of the Plotly JSON subset. Each allowed key maps to a type rule. A key outside the tables rejects with its full path. In lenient mode, the reader drops that key and adds a warning.

```ts
export function readPlotFigure(
  input: unknown,
  options?: { lenient?: boolean },
): {
  figure: { data: Array<Record<string, unknown>>; layout: Record<string, unknown> };
  warnings: string[];
};
```

## `src/plot/plotter.ts`

Purpose: the plotter. It converts a Plotly figure subset to a standalone SVG. Every number has a fixed count of decimals. So one figure always gives the same bytes.

```ts
export function plotToSvg(source: string | object, options?: { lenient?: boolean }): { svg: string; warnings: string[] };
```

## `src/plot/ticks.ts`

Purpose: the tick algorithm of the plot stage. The module holds the type `LogTick` and the constant `MAX_TICKS`. The constant sets the most ticks for one axis. A larger request rejects with `E_INPUT`.

```ts
export function paddedRange(min: number, max: number): [number, number];
export function linearTicks(min: number, max: number): number[];
export function logTicks(min: number, max: number): LogTick[];
```

## `src/plot/control.ts`

Purpose: the control-system helpers. The helpers draw Bode, step, impulse, pole-zero, Nyquist and root locus figures. Each helper returns a figure in the Plotly subset that `readPlotFigure` accepts. Each helper also returns the numbers of its analysis. The module has no dependencies.

```ts
export function checkTransferFunction(input: unknown): TransferFunction;
export function polynomialRoots(coeffs: number[]): Complex[];
export function bode(input: unknown, options: FrequencyOptions = {}): ControlResult<BodeNumbers>;
export function step(input: unknown, options: TimeOptions = {}): ControlResult<StepNumbers>;
export function impulse(input: unknown, options: TimeOptions = {}): ControlResult<ImpulseNumbers>;
export function poleZero(input: unknown): ControlResult<PoleZeroNumbers>;
export function nyquist(input: unknown, options: FrequencyOptions = {}): ControlResult<NyquistNumbers>;
export function rootLocus(input: unknown, options: RootLocusOptions = {}): ControlResult<RootLocusNumbers>;
```

## `src/plot/backend-svg.ts`

Purpose: the plot to SVG backend. The function `readPlotOptions` checks the options. The only option is `lenient`, a boolean. The function `render` calls `plotToSvg` with that option.

```ts
export function readPlotOptions(options: Record<string, unknown>, allowed: readonly string[]): { lenient: boolean };
export async function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/plot/backend-png.ts`

Purpose: the plot to PNG backend. It renders the SVG of the figure. Then it converts that SVG to PNG at the option scale. The accepted options are `lenient` and `scale`.

```ts
export async function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/plot/backend-html.ts`

Purpose: the plot to HTML backend. It writes one standalone page. The page loads the pinned Plotly build and draws the figure. The page title is the figure title, or `plot` when the figure has no title.

```ts
export async function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/plot/index.ts`

Purpose: the public entry of the `./plot` subpath. It re-exports the plotter, the reader, the tick functions, the control helpers and their types.

## `src/html/convert.ts`

Purpose: the HTML to Markdown converter. The parse5 library parses the document. A tree walk emits GitHub Flavored Markdown. The module holds the types `Asset`, `ConvertOptions`, `AssetCounter` and `ConvertResult`.

```ts
export function isDropped(el: Element): boolean;
export function convertHtml(html: string, options: ConvertOptions = {}): ConvertResult;
export function htmlToMarkdown(html: string, options: ConvertOptions = {}): string;
```

## `src/html/md.ts`

Purpose: the page conversion of the html stage. The function `convertPage` converts an HTML page to Markdown. When `downloadImages` is true, the function saves each image as an asset.

```ts
export async function convertPage(html: string, options: PageOptions): Promise<PageResult>;
```

## `src/html/images.ts`

Purpose: the image helpers of the html stage. The function `decodeDataUrl` decodes a `data:` URL. The function `extensionForMime` maps a media type to a file extension. The module holds the types `FetchedImage` and `FetchImage`.

```ts
export function decodeDataUrl(url: string): FetchedImage | undefined;
export function extensionForMime(mime: string): string;
```

## `src/html/fetch-image.ts`

Purpose: the remote image download of the html stage. The function follows redirects by hand. It checks the address of each hop. The function sets a time limit and a size limit on each download.

```ts
export function isPrivateAddress(address: string): boolean;
export function createImageFetcher(opts: ImageFetcherOptions): FetchImage;
```

The function `isPrivateAddress` returns `true` for a private, loopback or link-local address. A text that is not an IP address also returns `true`.

## `src/html/backend-md.ts`

Purpose: the HTML to Markdown backend. The function `render` checks the options. Each option is a boolean. When `browser` is true, the function loads the page in the headless browser first. Then it converts the page with `convertPage`.

```ts
export async function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/html/index.ts`

Purpose: the public entry of the `./html` subpath. It re-exports the function `htmlToMarkdown`.

## `src/browser/cdp.ts`

Purpose: the Chrome DevTools Protocol client. The client has no npm dependency. The class `CdpConnection` sends protocol commands over one socket. The function `connectCdp` opens that connection before the deadline.

```ts
export class CdpConnection {
export function connectCdp(
  address: string,
  deadline: number,
  makeSocket: (address: string) => CdpSocket = runtimeSocket,
): Promise<CdpConnection>;
```

## `src/browser/flags.ts`

Purpose: the forced flags of the headless browser. The function builds the command-line flags from a profile folder and the port of the refusing proxy. The type `FlagInputs` holds those two values.

```ts
export function forcedBrowserFlags(input: FlagInputs): string[];
```

## `src/browser/input.ts`

Purpose: the option parsers of the html stage. The functions parse the options of html to PNG and html to PDF. The module holds the default and limit constants, such as `DEFAULT_WIDTH` and `MAX_SIDE`. It also holds the type `PngOptions`.

```ts
export function parsePngOptions(options: Record<string, unknown>): PngOptions;
export function parsePdfOptions(options: Record<string, unknown>): void;
export function htmlSource(source: string | Uint8Array): string;
export function browserPathOf(browser: string | undefined): string;
export function blockedWarnings(blocked: readonly string[]): string[];
```

## `src/browser/page.ts`

Purpose: the HTML page builders of the browser stage. Each function returns the text of one page. The functions escape each value, so that a value cannot end a script element.

```ts
export function scriptJson(text: string): string;
export function scriptData(value: unknown): string;
export function plotlyPageHtml(figure: unknown, cdnUrl: string, sri: string, title = "plot"): string;
export function svgPageHtml(svg: string): string;
export function mermaidPageHtml(source: string, cdnUrl: string): string;
```

## `src/browser/pinned.ts`

Purpose: the pinned assets of the browser stage. The module holds the versions, the URLs and the SHA-256 hashes of the Mermaid, Plotly and Three.js builds. The client refuses a local copy with other bytes. The module holds the types `PinnedAsset` and `ThreeModule`.

## `src/browser/profile.ts`

Purpose: the profile folders of the headless browser. The function `makeProfile` creates a new profile folder. Each folder name starts with the constant `PROFILE_PREFIX`. The function `removeProfile` removes a profile folder within a deadline.

```ts
export function makeProfile(): string;
export async function removeProfile(profile: string, deadline: number): Promise<void>;
```

## `src/browser/proxy.ts`

Purpose: the refusing proxy. The proxy refuses every request. It records the host of each attempt. The function `startRefusingProxy` starts the proxy on a loopback port. The module holds the type `RefusingProxy`.

```ts
export async function startRefusingProxy(): Promise<RefusingProxy>;
```

## `src/browser/render.ts`

Purpose: the page renderer of the headless browser. The function `renderHtmlPage` draws one HTML page in a new headless browser. The function returns the bytes of the requested format. The browser runs with a new profile, the forced flags and the refusing proxy. The sandbox of the browser stays on.

```ts
export async function capturePage(cdp: CdpConnection, req: HtmlPageRequest, deadline: number): Promise<HtmlPageResult>;
export async function renderHtmlPage(req: HtmlPageRequest): Promise<HtmlPageResult>;
```

The constant `PAGE_URL` holds the address of the loaded page. The client answers that address from memory.

## `src/browser/backend-png.ts`

Purpose: the html to PNG backend. The backend parses the options `width`, `height` and `scale`. Then it takes a screenshot of the page in the headless browser.

```ts
export async function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/browser/backend-pdf.ts`

Purpose: the html to PDF backend. The backend calls `Page.printToPDF` in the headless browser. The backend takes no options.

```ts
export async function render(request: WorkerJob["request"]): Promise<BackendOutput>;
```

## `src/browser/index.ts`

Purpose: the public entry of the `./browser` subpath. It re-exports the class `CdpConnection`, the function `forcedBrowserFlags`, the function `startRefusingProxy`, the function `renderHtmlPage` and their types.

## `src/mesh/cad-document.ts`

Purpose: the reader of a CAD document. The reader checks the JSON value against the node types and gives the JSON path of a bad value with `E_INPUT`. The reader counts the nodes and estimates the facets of each primitive before any solid operation. A count over a limit rejects with `E_LIMIT`. The reader accepts a 2D profile only as the child of `extrude` or `revolve`.

```ts
export function parseCadDocument(text: string, limits: CadLimits): CheckedCadDocument;
export function checkCadDocument(value: unknown, limits: CadLimits): CheckedCadDocument;
export function sphereFacets(segments: number): number;
```

## `src/mesh/cad-build.ts`

Purpose: the solid operations of a checked document through manifold-3d. The WASM module loads once for each process. Each primitive becomes an original solid with its colour. Each run of output triangles keeps the colour of the primitive that made the run. The build frees every WASM object in a `finally` block. A result over the facet limit rejects with `E_LIMIT`.

```ts
export function loadManifold(): Promise<ManifoldModule>;
export function buildCad(document: CadDocument, maxFacets: number): Promise<CadBuildResult>;
```

## `src/mesh/cad-builder.ts`

Purpose: the builder functions. Each function returns a plain node object with only the keys that the caller gives. `cadDocument` wraps the model in a document. The `./mesh` subpath exports the module as `cad`.

## `src/mesh/stl.ts`

Purpose: the binary STL writer: an 80-byte header, a 32-bit facet count, and 50 bytes for each facet, little-endian. The facet normal comes from the vertex order. STL holds no colour and no name.

```ts
export function writeStl(meshes: CadMesh[]): Uint8Array;
export function stlByteLength(meshes: CadMesh[]): number;
```

## `src/mesh/backend-glb.ts`

Purpose: the backend of `step`, `iges`, `brep` and `cad` to `glb`. `readMeshes` reads the meshes of a mesh render: a CAD document through the reader and the build, a STEP, IGES or BREP file through occt-import-js. The html and png backends also call `readMeshes` through this render. An output over `maxMemoryMb` rejects with `E_LIMIT`.

```ts
export function readMeshes(request: WorkerJob["request"], deps?: Partial<GlbDeps>): Promise<CadMesh[]>;
export function render(request: WorkerJob["request"], deps?: Partial<GlbDeps>): Promise<BackendOutput>;
```

## `src/mesh/backend-stl.ts`

Purpose: the backend of `cad` to `stl`. A model with a colour gives a warning, because STL holds no colour. An output over `maxMemoryMb` rejects with `E_LIMIT`.

## `src/types.ts`

Purpose: the public types. It exports `INPUT_TYPES`, `OUTPUT_FORMATS`, `BINARY_INPUT_TYPES`, `RenderRequest`, `RenderResult`, `RenderAsset`, `Capability` and `RenderOptions`.
