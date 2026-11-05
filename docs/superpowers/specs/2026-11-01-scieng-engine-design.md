# Design: sciengjs, a local rendering engine for science and engineering diagrams

**Related:** [`../plans/2026-11-01-scieng-engine-build.md`](../plans/2026-11-01-scieng-engine-build.md) (the increments and the build process)

## Goal

`@danielsimonjr/sciengjs` is a TypeScript library that renders science and engineering sources to SVG, PNG, PDF, HTML and Markdown. It runs on the local machine. It sends no source to a web service.

`scieng-mcp` is the adapter. It gives the engine to an agent harness as MCP tools, slash commands and a skill. The split follows two existing pairs:

| Engine (library, npm) | Adapter (MCP server, plugin) |
|---|---|
| `@danielsimonjr/memoryjs` | `@danielsimonjr/memory-mcp` |
| MathTS (`@danielsimonjr/mathts-*`) | `@danielsimonjr/math-mcp` |
| `@danielsimonjr/sciengjs` (GitHub repo `danielsimonjr/sciengjs`) | `@danielsimonjr/scieng-mcp` |

The engine holds every renderer. The adapter holds no rendering logic. The adapter validates the input of a tool, calls the engine and writes the output file.

## Principles

1. **Local.** No render sends a source to a web service. The one network access is the first download of a WASM TeX bundle. The download comes from a configured URL. A pinned sha256 checks each bundle.
2. **Few dependencies.** The engine writes its own parsers, layouts, plotter, converters and browser client. The engine borrows outside software only when that software is decades of work: Graphviz layout, OpenCascade surface tessellation and TeX. Graphviz and OpenCascade are WASM builds of their projects. For TeX, the engine borrows only program sources: `tex.web` and the e-TeX change file `etex.ch`. The engine builds them to WASM with its own tools.
3. **One input drives one output.** A backend is a pure function of its source and options. The same request gives the same bytes.
4. **Configurable, never hard-coded.** Every path, URL, limit and timeout comes from the configuration (section "Configuration"). A missing required value fails with an error that names the value. No backend guesses a path.
5. **Untrusted input is the default.** Every backend accepts a source from an unknown author. No backend executes code from a source.
6. **Node is the release runtime. Bun is the development runtime.** The engine uses only APIs that both runtimes provide (section "Runtime").

## Scope

### In scope

| Input | Source format | Outputs | Stage |
|---|---|---|---|
| `dot` | Graphviz DOT | svg, png | graph |
| `dot` | Graphviz DOT | pdf | browser |
| `mermaid` (class, state, sequence) | Mermaid `classDiagram`, `stateDiagram-v2`, `sequenceDiagram` | svg, png, pdf | graph or native layout |
| `mermaid` (all other types) | Mermaid | svg, png, pdf | browser |
| `math` | LaTeX math | svg, png, pdf | math |
| `tikz` | a `tikzpicture` or a picture environment of a supported package | svg, png, pdf | tex |
| `plot` | the Plotly JSON subset of section "PLOT" | svg, png, pdf, html | plot |
| `sysml` | the SysML v2 textual subset of section "SysML" | svg, png, pdf | graph |
| `step`, `iges`, `brep` | ISO 10303-21, IGES, OpenCascade BREP | html, png, glb | mesh, browser |
| `cad` | the CSG document of section "CAD" | html, png, glb, stl | mesh, browser |
| `html` | an HTML document | png, pdf, md | browser, html |

`png` of an SVG that the engine draws comes from the raster stage (resvg), with no browser. `png` of an SVG that the browser stage draws comes from a browser screenshot. Those SVGs can hold `foreignObject` labels, and resvg does not render them. `pdf` needs the browser stage. The stage column of the table names the stage that decides whether a pair is ready on a machine. A pair that needs the browser stage lists `browser`. Any other pair lists the stage that draws its vector output, and a `png` that comes from the raster stage needs no other stage. So `dot` to `png` lists `graph`, and `dot` to `pdf` lists `browser`.

### Out of scope

- WireViz harness diagrams.
- An HTTP server. A later version can add one with `node:http`, behind an option, bound to 127.0.0.1.
- The OpenSCAD language. A later version can add an OpenSCAD reader as a second front end of the CAD document.
- TeX text in a language other than English. A fork can add the language packages.
- TeX packages with the GPL as their only licence. Section "tex" gives the replacement of each.
- SVG output for meshes.
- Mermaid diagram types other than class, state and sequence in the native layout. These types use the browser stage.

## Public API

```ts
export type InputType =
  | "dot" | "mermaid" | "math" | "tikz" | "plot" | "sysml"
  | "step" | "iges" | "brep" | "cad" | "html";

export type OutputFormat = "svg" | "png" | "pdf" | "html" | "md" | "glb" | "stl";

export interface RenderRequest {
  type: InputType;
  source: string | Uint8Array;   // text for text formats, bytes for step, iges and brep
  format: OutputFormat;
  options?: RenderOptions;       // per-type options, typed per InputType
}

export interface RenderResult {
  bytes: Uint8Array;
  mime: string;
  backend: string;               // the backend that rendered, for example "graph/viz"
  warnings: string[];            // each item names its source line when it has one
  assets?: { name: string; bytes: Uint8Array; mime: string }[];  // extracted images (html to md)
}

export function render(req: RenderRequest, config?: Partial<SciengConfig>): Promise<RenderResult>;
export function capabilities(config?: Partial<SciengConfig>): Promise<Capability[]>;
```

- `render` rejects with a `RenderError`. A `RenderError` has a `code` (`E_INPUT`, `E_UNSUPPORTED`, `E_LIMIT`, `E_TIMEOUT`, `E_STAGE_MISSING`, `E_CONFIG`, `E_INTEGRITY`, `E_INTERNAL`), a message and, when it has one, the source line and column. `E_LIMIT` covers two resource limits: the source size (`maxSourceBytes`) and the heap of the render worker (`maxMemoryMb`).
- `capabilities` reports each input and output pair, the stage that it needs, and whether that stage is ready on this machine. Example: `pdf` reports "not ready" when no browser is configured. The adapter uses `capabilities` to report a missing stage before a render. A pair can also have a `note`. Example: the Mermaid `svg` and `png` pairs note that types other than class, state and sequence need the browser stage.
- An unsupported pair (for example `dot` to `md`) rejects with `E_UNSUPPORTED`. It never falls back to another format.

### Subpath exports

The package exports one subpath per stage. A caller that imports `@danielsimonjr/sciengjs/plot` loads no WASM.

| Subpath | Content |
|---|---|
| `.` | `render`, `capabilities`, the types, the configuration loader |
| `./graph` | DOT to SVG through Graphviz WASM |
| `./mermaid` | the Mermaid parsers and the native layouts |
| `./math` | LaTeX math to SVG through MathJax |
| `./tex` | WASM TeX, the bundle manager, DVI to SVG |
| `./plot` | the SVG plotter and the Plotly JSON reader |
| `./sysml` | the SysML v2 parser and its views |
| `./mesh` | STEP, IGES, BREP and CAD to a mesh, glTF and STL writers, the Three.js page |
| `./browser` | the Chrome DevTools Protocol client |
| `./html` | HTML to Markdown |
| `./raster` | SVG to PNG through resvg |

## Stages

A stage is a shared service that several backends use. Each stage loads on first use.

| Stage | Borrowed engine | Licence | What the engine writes |
|---|---|---|---|
| graph | `@viz-js/viz` (Graphviz compiled to WASM) | wrapper MIT; Graphviz EPL-2.0 | the adapters that turn Mermaid, SysML into DOT |
| math | `@mathjax/src` 4.x | Apache-2.0 | the request wrapper and the SVG clean-up |
| tex | the engine compiles `tex.web` (the TeX program source) with `etex.ch` to WASM | `tex.web` and `etex.ch`: the licences of their authors; the TeX packages: LPPL; the outline fonts: OFL or GFL (see "tex") | the Pascal to WASM compiler, the change files, the WASM host functions, the format build, the bundle manager, the package detection, the DVI to SVG converter with glyph paths |
| mesh | `occt-import-js` (OpenCascade, WASM); `manifold-3d` | LGPL-2.1; Apache-2.0 | the CSG document reader, the glTF and STL writers, the Three.js viewer page |
| browser | the installed Chromium or Chrome | (system program) | the Chrome DevTools Protocol client |
| raster | `@resvg/resvg-wasm` | MPL-2.0 | the call wrapper |
| html | `parse5` | MIT | the HTML to Markdown converter |
| plot | (none) | (none) | the plotter, the tick algorithm, the Plotly JSON reader |

`three` (MIT) loads inside the viewer page. `three` is not a Node dependency of the engine.

The `@viz-js/viz` npm package declares MIT and ships no Graphviz licence file. The engine package ships `THIRD_PARTY_NOTICES.md` with the EPL-2.0 notice of Graphviz, the LGPL-2.1 notice of OpenCascade and the MPL-2.0 notice of resvg. The notices also give the licence of `tex.web`, the LPPL of the TeX packages and the font licences. The LGPL and MPL parts stay separate, unmodified WASM files.

### graph

- Input: DOT text. Output: SVG text.
- The Graphviz WASM build has no file system access and no network access. An `image`, `URL` or `href` attribute cannot fetch a file. The backend still removes `image` attributes and reports a warning, because the SVG would reference a file that the reader does not have. The backend also removes `stylesheet` attributes with a warning, because a viewer loads the style sheet of an `xml-stylesheet` instruction from its address. Any `xml-stylesheet` instruction in the output is removed too. A `URL` or `href` attribute stays as a hyperlink in the SVG. A viewer follows it only when a person clicks it.

### browser

- The client speaks the Chrome DevTools Protocol over the built-in `WebSocket` of Node 22 and Bun. The client has no npm dependency.
- The browser path comes from `SCIENG_BROWSER`, else the `browser` key of the configuration file. The client does not search for a browser. A missing path rejects with `E_STAGE_MISSING`.
- Each render starts the browser with a new temporary profile, headless, with no extensions.
- Each render starts the browser with these forced flags. Each flag closes one route off the host:
  - `--proxy-server` names a proxy in the engine process. The proxy refuses every connection, records each attempt and forwards nothing.
  - `--proxy-bypass-list=<-loopback>` sends loopback connections through the same proxy.
  - `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1` stops every DNS lookup.
  - `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` keeps WebRTC on the proxy.
  - `--disable-background-networking`, `--disable-component-update`, `--disable-sync`, `--no-pings` and `--disable-component-extensions-with-background-pages` stop the requests that the browser makes by itself.
- The client never passes `--no-sandbox`. A host where the browser sandbox cannot start rejects the render with `E_STAGE_MISSING`.
- The client intercepts every request through the `Fetch` domain. The client fulfils two kinds of request from the process. The first is the page that the client loads. The second is each exact pinned URL in the asset list of the engine. The list holds the Mermaid, Plotly, KaTeX, WaveDrom and Three.js builds that the engine pages name. The client fulfils a pinned URL with the local copy in the engine package. The client refuses every other network request and every other `file:` request.
- A page keeps its pinned CDN URLs, so the page also works in a normal browser. With the forced flags and the `Fetch` interception, a render sends no request and opens no connection out of the process. See `docs/analysis/t4-browser.md`.
- A test proves the block: a page that requests an unlisted image and an unlisted script records two refused requests. A second test renders a `render_html` page with each block type under the block and checks that each block draws.
- Outputs: a PNG screenshot of the page or of one element; a PDF through `Page.printToPDF`.

### math

- Input: LaTeX math. Output: standalone SVG with the glyphs as paths.
- The `mhchem` extension handles `\ce{}`. Plain math never goes to the tex stage.

### tex

- Input: a TikZ picture or a picture environment of a supported package. Output: SVG.
- Build:
  - `tangle` writes Pascal from `tex.web` and a stack of change files, applied in this order: `etex.ch`, then the change files of the engine. `tangle` is a build tool. The engine package does not hold `tangle`.
  - Each change file of the engine holds one concern: the system interface, the trip settings, the production settings, the utility primitives. A new extension is a new change file in the stack, not an edit of an old one.
  - The utility primitives are the primitives that the LaTeX kernel tests for at format build time and that `etex.ch` does not give, for example `\expanded`. The build plan names the set. The engine writes each primitive from the published description of its behaviour. The engine uses no part of the source of pdfTeX.
  - The format builds in the extended mode of e-TeX.
  - The engine compiler (in `tools/`, build time only) compiles the Pascal to WASM. The compiler accepts the Pascal subset that `tex.web` and `etex.ch` use.
  - The build uses no part of another TeX to WASM toolchain.
- Name: the build is a changed program, so it never uses the name TeX or e-TeX. Its banner names the engine. The primitives `\eTeXversion` and `\eTeXrevision` keep the values of `etex.ch`. The engine does not define `\pdftexversion`, so packages do not take the build for pdfTeX.
- Compatibility gates: CI runs the trip test of `tex.web` and the e-TRIP test of `etex.ch` on each WASM build. Each log may differ from the reference only in the banner line. A build that fails a gate does not ship.
- The format selects the pgf driver for DVI output that the DVI to SVG converter reads. The build plan names the driver file.
- Runtime: the engine writes the host functions of the WASM module: file open, read and write on the virtual file system, and the terminal output.
- The format holds LaTeX, `standalone`, `xcolor`, `tikz` and `circuitikz`. The text language is English only. No bundle holds `latex.fmt`.
- The format and the bundles build from the packages of one pinned TeX Live year.
- Licence rule: a package goes into a bundle only under the LPPL or in the public domain. A package that offers the LPPL as one option also qualifies. For a package with a licence choice, the engine uses the LPPL. A package with the GPL as its only licence does not go into a bundle. A font goes into a bundle only under the OFL or the GFL.
- Extra bundles hold the rest of the package set:
  - diagrams: `tikz-cd`, `tikz-3dplot`, `smartdiagram`, the `hobby` TikZ library;
  - science: `chemfig`, `mhchem`, `bussproofs`;
  - math and color: the AMS set, `xcolor`.
- These packages have the GPL as their only licence. No bundle holds them. Each has a replacement:

  | Package | Replacement |
  |---|---|
  | `pgfplots` | the `plotly` input type and the plot stage |
  | `pgf-umlsd` | a Mermaid sequence diagram |
  | `xy` | `tikz-cd` |
  | `esvect` | `\vec` or `\overrightarrow` |
  | `mathrsfs` | `\mathscr` from the AMS `eucal` package |

- Package detection: the backend scans the source for environments and commands, and loads only the bundles that the source needs. The method follows the templater of the Upmath renderer (`parpalak/i.upmath.me`, MIT), with credit. A source that loads a package that no bundle holds rejects with `E_UNSUPPORTED`. The message names the package and its replacement when the table above gives one.
- Bundles download on first use from `SCIENG_TEX_BUNDLE_URL` into `SCIENG_CACHE_DIR`. Each bundle has a pinned sha256 in the engine package. A hash mismatch deletes the download and rejects with `E_INTEGRITY`.
- TeX runs on a virtual file system that holds only the bundles and the source. `\write18` is off. `\openin` and `\input` see only the virtual tree.
- DVI to SVG: the engine reads the DVI output and writes SVG with each glyph as a `<path>`. The outlines come from the Type 1 Computer Modern fonts of the AMS (OFL). Latin Modern (GFL) supplies the fonts that the AMS Type 1 fonts do not hold. The engine uses no font with a shareware licence.

### mesh

- STEP, IGES and BREP go through `occt-import-js` (`ReadStepFile`, `ReadIgesFile`, `ReadBrepFile`). The result is a list of meshes in the form that Three.js loads.
- A CAD document goes through `manifold-3d` for the solid operations.
- Outputs: a glTF binary (`glb`), an STL file, an HTML viewer page, and a PNG of the page through the browser stage.
- A `glb` render estimates its peak memory after the read: the bytes of the positions, the normals and the indices, times four copies. An estimate over `maxMemoryMb` megabytes rejects with `E_LIMIT`. Geometry over 4 GiB also rejects with `E_LIMIT`, because the `glb` header holds the file length in 32 bits.
- The viewer page loads Three.js and its orbit controls add-on. The page has section planes and an exploded view. The page embeds the `glb`. In a normal browser, the page requests only the pinned Three.js modules. Under the browser stage, the client fulfils those modules from the engine package.

### raster

- Input: SVG. Output: PNG at a given scale. No browser.
- The stage uses `@resvg/resvg-wasm`. The WASM build reads no file and finds no system font. A text element draws no pixel without a font.
- The stage bundles one default font: Liberation Serif Regular, version 2.1.5, under the SIL Open Font License 1.1. The font is metric-compatible with Times New Roman. Times-Roman, the default font of Graphviz, resolves to this font. The font file and its licence are in the `assets/fonts/` folder of the package. `THIRD_PARTY_NOTICES.md` lists the font.
- Every font family of an input resolves to the font in use. The font has one face. Bold and italic text draw in that face, and the render reports one warning for bold text and one for italic text. A character that the font does not hold draws no pixel, and the render reports one warning with the number of such characters.
- The configuration key `rasterFont` names a TrueType or OpenType file. The file replaces the default font. A file that cannot be read rejects the render with `E_CONFIG`. A file without a font signature also rejects the render with `E_CONFIG`. A TrueType collection (`ttcf` signature) is not one font and also rejects with `E_CONFIG`. A bundled font that is missing or has no font signature rejects the render with `E_STAGE_MISSING`.
- A PNG whose RGBA pixel buffer is larger than `maxMemoryMb` megabytes, or larger than 1024 megabytes, rejects with `E_LIMIT`. The bound of 1024 megabytes comes from a measure. Resvg in WASM holds about two copies of the pixel buffer. The WASM memory ends at 4 GiB.

## Backends

### Mermaid native layouts

- The engine parses `classDiagram`, `stateDiagram-v2` and `sequenceDiagram` with its own parser.
- Class and state diagrams become DOT and go through the graph stage.
- Sequence diagrams use the engine's own layout: one column per participant, one row per message, with notes, activations, loops, alternatives and parallel blocks.
- A construct outside the supported grammar rejects with `E_INPUT` and the line. The option `lenient: true` skips the construct and reports a warning.
- All other Mermaid types go to the browser stage. The page names the pinned Mermaid URL. The client fulfils that URL from the engine package. No request leaves the process.
- The router reads the first word of the first content line. It skips blank lines, comment lines, directives and front matter. Only a type in the list of other Mermaid types goes to the browser stage. An unknown header stays on the native path, which rejects it with `E_INPUT`.
- The engine package holds the sha256 of the pinned Mermaid build. A local copy with a different hash rejects with `E_INTEGRITY` before the browser starts.
- A Mermaid `png` takes the options `lenient` and `scale` on both paths. `scale` is a number above 0 and not more than 8. The default is 1. The browser path sizes the page from the `viewBox` of the diagram and uses `scale` as the device scale.

### PLOT

- Input: JSON `{ "data": [...], "layout": {...} }`, a subset of the Plotly figure format. A figure that renders in Plotly renders the same data in the engine.
- Accepted trace keys: `type` (`scatter`), `mode` (`lines`, `markers`, `lines+markers`, `markers+text`, `text`), `x`, `y`, `name`, `text`, `textposition`, `line.color`, `line.width`, `line.dash`, `marker.size`, `marker.color`, `marker.symbol`, `xaxis`, `yaxis`, `showlegend`.
- Accepted layout keys:
  - page: `title.text`, `width`, `height`, `paper_bgcolor`, `plot_bgcolor`, `font.color`, `font.size`, `showlegend`;
  - grid: `grid.rows`, `grid.columns`, `grid.pattern`;
  - shapes: `shapes` of type `line` and `rect`, with `xref` and `yref` set to an axis or to an axis domain;
  - each axis `xaxisN` and `yaxisN`: `type` (`linear`, `log`), `title.text`, `range`, `dtick`, `tickformat`, `gridcolor`, `zeroline`, `zerolinecolor`, `matches`.
- A key outside the subset rejects with `E_INPUT` and the key path. The option `lenient: true` ignores the key and reports a warning.
- Helpers build a figure from a transfer function given as numerator and denominator coefficients: `bode`, `step`, `impulse`, `nyquist`, `poleZero`, `rootLocus`. Each helper computes every point. Each helper returns the key numbers (crossover frequencies, gain and phase margins, rise time, overshoot, settling time) with the figure.
- The `html` output is a page that draws the same figure with Plotly, for interactive use.

### SysML

- Input: a subset of the SysML v2 textual notation: `package`, `part def`, `part`, `attribute`, `port def`, `port`, `connect … to …`, `interface def`, `interface`, `requirement def`, `requirement`, `satisfy`, `specializes` (`:>`), and comments.
- Views: block definition (definitions, composition and specialization), internal block (the parts, ports and connections of one definition) and requirements (requirements and `satisfy` relations). The option `view` selects the view. The option `root` selects the definition of an internal block view.
- Each view becomes DOT with record or HTML labels and goes through the graph stage.
- A construct outside the subset rejects with `E_INPUT` and the line, or with `lenient: true` reports a warning.
- No reference renderer exists for this subset. The expected test images of this backend need approval by a reviewer.

#### SysML grammar

- Tokens: a name (`[A-Za-z_][A-Za-z0-9_]*`), a number, a string in double quotes, the keywords, and the symbols `{ } ; : :> [ ] .. . = *`. The longest symbol wins, so `:>` is one token. A `//` comment runs to the end of its line. A `/* */` comment can hold several lines. Each token keeps its line and its column.
- A source is `member*`. A member of a source or a package is a `package`, a `part def`, a `port def`, an `interface def`, a `requirement def`, a `requirement` or a `satisfy`. A source with no definition and no requirement rejects.
- `package Name { member* }`. A package can hold a package. The definition names and the top-level requirement names of one source share one namespace. A second definition with the same name rejects. A qualified name (`A::B`) is outside the subset.
- The engine resolves the names after it reads the whole source, so a reference can come before its definition.
- `part def Name (:> Base)? ( ; | { member* } )`. A member is an `attribute`, a `part`, a `port`, a `connect`, an `interface` or a `satisfy`.
- `part name : Type ([n] | [n..m] | [n..*])? ;`. `Type` names a `part def`. A part usage is allowed only in a `part def`.
- `attribute name (: Type)? (= literal)? ;`. A literal is a number, a string or a name. `Type` is a name. The engine does not check it against a definition.
- `port def Name ( ; | { attribute* } )`. `port name : Type ;`, where `Type` names a `port def`.
- `connect a.p to b.q ;`. An end is `part.port`, or `port` for a port of the enclosing definition. Each end must name a port that exists.
- `interface def Name ( ; | { attribute* } )`. `interface name : Def connect a.p to b.q ;`, with the ends of `connect`.
- `requirement def Name (:> Base)? ( ; | { (attribute | requirement)* } )`. `requirement name (: Def)? ( ; | { (attribute | requirement)* } )`. A requirement usage is allowed in a package and in a requirement. A nested usage has the address `Owner.name`.
- `satisfy Req by Path ;`. `Req` names a requirement definition, a top-level requirement usage, or a nested usage as `Owner.name`. `Path` is a `part def` name, or `Def.part` for a part usage. In a `part def`, `Path` can also be a part usage of that definition.
- `:>` names the definition that a definition specializes. The base must be a definition of the same kind.
- Any other keyword or symbol is outside the subset. `doc`, `import`, `alias`, `action`, `state` and `item` are outside the subset.

#### SysML views and options

- `view`: `bdd` (the default), `ibd` or `requirements`. `root`: the name of a `part def`. `ibd` needs `root`. `root` with another view rejects. `lenient`: true or false.
- `bdd` draws each `part def`, `port def` and `interface def` as a record node: the kind in ASCII (`part def`), the name, the attributes and the ports. A part usage draws a composition edge from its owner to its type. The edge has a filled diamond at the owner, and the name and the multiplicity at the type. `:>` draws an edge with an empty triangle at the base. Requirements are not in `bdd`.
- `ibd` draws the root as a cluster. Each part usage of the root is a record node with one field for each port of its type. Each port of the root is a node on the cluster. Each `connect` and `interface` is an edge between the two ports. An interface edge has the label `name : Def`.
- `requirements` draws each requirement definition and each requirement usage as a record node with its attributes. A usage inside a requirement draws a containment edge from the owner. `: Def` draws a dashed edge to the definition. `:>` draws an edge with an empty triangle. Each `satisfy` draws a dashed edge from a node of its path to the requirement, with the label `<<satisfy>>`. Each path that a `satisfy` names is a node of this view: a `part def` as a record, and `Def.part` as `part : Type`.

#### SysML rejections

Each rejection gives `E_INPUT` with the line:

- an unknown keyword, an unknown symbol, or a statement in a place that the grammar does not allow;
- an unclosed block, an unclosed comment or an unclosed string;
- a name that is defined twice, a type that names no definition of the correct kind, or a base of another kind;
- a `connect` end that names no part or no port;
- a `satisfy` that names an unknown requirement or an unknown path;
- a `root` that names no `part def`, `ibd` without `root`, or an unknown `view`.

With `lenient: true`, a statement with an unknown keyword is skipped to its `;` or to its closed block, and the engine reports a warning. The other rejections stay errors in lenient mode.

### CAD

- Input: a CSG document in JSON. The document is data. The engine executes no code from it.
- Nodes: primitives (`cube`, `cylinder`, `sphere`, `polyhedron`), 2D profiles (`rectangle`, `circle`, `polygon`), `extrude`, `revolve`, the operations `union`, `difference`, `intersection`, and the transforms `translate`, `rotate`, `scale`, `mirror`. Each node can carry a `name` and a `color`.
- The engine exports a TypeScript builder API that writes the document. A caller can write the model as a TypeScript program. The program runs in the caller's process, under the caller's trust, never inside the engine.
- Limits: the node count (`maxCadNodes`), the facet count (`maxCadFacets`) and the time of the solid operations (`timeoutMs`).
- The document is one JSON object: `version` (the number 1), `model` (the root node) and an optional `segments`. `segments` is the default number of segments of a full circle, a whole number from 3 to 1024. A node with `segments` overrides the default for its own shape.
- A node is one JSON object with a `type`. `extrude`, `revolve` and the transforms take one `child`. The operations take a `children` list of one node or more. `difference` subtracts the second and later children from the first.
- A 2D profile is allowed only as the `child` of `extrude` or `revolve`. A 3D node is not allowed there.
- An unknown key, a missing key, a wrong type, a number that is not finite, or a size that is not positive rejects with `E_INPUT`. The message gives the JSON path of the value, for example `model.children[1].radius`.
- The reader counts the nodes before the solid operations start. A document with more than `maxCadNodes` nodes rejects with `E_LIMIT`.
- The reader estimates the facets of each primitive from its segments before the solid operations start. An estimate over `maxCadFacets` rejects with `E_LIMIT`. The result of the solid operations is checked again, because an operation can add facets.
- A `color` is three numbers from 0 to 1 (red, green, blue). A node without a colour takes the colour of the nearest parent with one. A face of the result keeps the colour of the primitive that made it. Thus the cut face of a `difference` has the colour of the cutting solid. The `glb`, `html` and `png` outputs carry the colours. The `stl` output carries no colour and no name.

### STEP, IGES, BREP

- Input: the file bytes. The option `linearUnit` sets the output unit (millimeter by default) for STEP and IGES.
- The face colors of the source carry into the glTF materials.

### HTML

- HTML to PNG and HTML to PDF use the browser stage, with the network block of that stage.
- HTML to Markdown:
  - `parse5` parses the document. The option `browser: true` first loads the page in the browser stage. The converter then reads the DOM after the page scripts run.
  - The output is GitHub Flavored Markdown: headings, lists, task lists, tables, fenced code with its language, footnotes, links and images.
  - A block with a `data-scieng-source` attribute becomes a fenced block of its source. The fence language is the block type, for example ` ```mermaid ` or ` ```tikz `. The round trip of a scieng page is exact.
  - Math with a MathML `annotation` of type `application/x-tex` becomes `$…$` or `$$…$$`. Other rendered math keeps its text.
  - An inline SVG becomes an asset file and an image link.
  - An image keeps its URL. The option `downloadImages: true` saves each image as an asset. The download follows the network rules of the configuration.
  - A remote download uses http or https only. The engine follows a maximum of three redirects. Each hop must resolve to public addresses only: the engine refuses loopback, private, link-local and unspecified addresses. The reply must have an `image/*` type. The download must be in the limits `imageTimeoutMs` and `maxImageBytes`. A refused image keeps its URL and gives a warning.

## Configuration

One loader reads the configuration. Each key has one default, in the loader. An environment variable overrides the configuration file. A call option overrides both.

| Key | Environment variable | Default | Use |
|---|---|---|---|
| config file path | `SCIENG_CONFIG` | `<user config dir>/scieng/config.json` | the location of the configuration file |
| `browser` | `SCIENG_BROWSER` | none (required for the browser stage) | the path of Chromium or Chrome |
| `cacheDir` | `SCIENG_CACHE_DIR` | `<user cache dir>/scieng` | the TeX bundles and other downloads |
| `texBundleUrl` | `SCIENG_TEX_BUNDLE_URL` | the release asset URL of the engine version | the base URL of the TeX bundles |
| `timeoutMs` | `SCIENG_TIMEOUT_MS` | 60000 | the time limit of one render |
| `maxSourceBytes` | `SCIENG_MAX_SOURCE_BYTES` | 10485760 | the size limit of one source |
| `maxMemoryMb` | `SCIENG_MAX_MEMORY_MB` | 2048 | the heap limit of the worker of one render |
| `allowNetwork` | `SCIENG_ALLOW_NETWORK` | `tex-bundles` | the network uses that are allowed: `none`, `tex-bundles`, or `tex-bundles,images` |
| `imageTimeoutMs` | `SCIENG_IMAGE_TIMEOUT_MS` | 15000 | the time limit of one remote image download, for all its redirects |
| `maxImageBytes` | `SCIENG_MAX_IMAGE_BYTES` | 10485760 | the size limit of the body of one remote image |
| `maxCadNodes` | `SCIENG_MAX_CAD_NODES` | 10000 | the node limit of one CAD document |
| `maxCadFacets` | `SCIENG_MAX_CAD_FACETS` | 2000000 | the facet (triangle) limit of one CAD model, estimated before and checked after the solid operations |
| `rasterFont` | `SCIENG_RASTER_FONT` | none (the bundled font of the raster stage) | the path of a TrueType or OpenType font for the raster stage |
| `assetsUrl` | `SCIENG_ASSETS_URL` | the `assets/` folder of the package, resolved from `dist/config.js` | the `file:` URL of the folder that holds `fonts/` and the resvg WASM file `index_bg.wasm`. The build copies the WASM file into that folder. A value without a trailing slash gets a trailing slash. A value that is not a `file:` URL rejects with `E_CONFIG`. A `file:` URL with a host other than `localhost` rejects with `E_CONFIG`. On Windows, such a URL names a network share. A value with a query or a fragment rejects with `E_CONFIG`. A value with an encoded slash or backslash in its path rejects with `E_CONFIG`. A value that the operating system cannot open as a folder path rejects the render with `E_CONFIG`. A missing or unusable file under the folder rejects the render with `E_STAGE_MISSING`. |

The user directories follow the platform: `%APPDATA%` and `%LOCALAPPDATA%` on Windows, `~/Library` on macOS, `XDG_CONFIG_HOME` and `XDG_CACHE_HOME` on Linux. The loader rejects an unreadable configuration file with `E_CONFIG`. The loader never falls back to the defaults.

## Runtime

- The release target is Node 22 LTS or later. Node 22 has the built-in `WebSocket` that the browser client uses.
- The source uses `node:` modules, WASM and web APIs that Node 22 and Bun both provide. It uses no `Bun.*` API and no Node API that Bun lacks. A lint rule rejects `Bun.` in `src/`.
- Development uses Bun: `bun test`, `bun run`. The package build emits ESM for Node.
- Each render runs in a `worker_threads` worker with `resourceLimits` set from `maxMemoryMb`. A render that passes `timeoutMs` terminates its worker and rejects with `E_TIMEOUT`. A heap exhaustion of the render worker rejects with `E_LIMIT`. A worker crash for any other reason rejects with `E_INTERNAL`. Either crash leaves the next render unaffected.

## The adapter: scieng-mcp

- `scieng-mcp` depends on `@danielsimonjr/sciengjs` by a caret range, as `memory-mcp` depends on `memoryjs`.
- The adapter keeps its tool names. `render_mermaid`, `render_dot` and `render_latex` render through the engine. The remote services (mermaid.ink, quickchart.io, latex.codecogs.com) leave the adapter when the engine covers their input.
- `render_html` keeps its typed blocks. Each block element carries a `data-scieng-source` attribute with its source. A `plot` block can render as a static SVG through the engine.
- New tools: `render` (any input type and output format, with `output_path`), `html_to_markdown`, and `capabilities`.
- `ooxml_replace` stays in the adapter. It edits Word documents and is not a renderer.
- The plugin ships `bundle/index.mjs`, which `node` starts with no shell. The WASM files and the pinned Mermaid and Three.js builds ship in `bundle/assets/`. The engine reads the WASM files and the pinned Mermaid and Three.js builds from the folder that the `assetsUrl` key names. The adapter sets the `assetsUrl` key to `bundle/assets/`. A CI step builds the bundle again and compares the new bundle with the committed bundle, as `memory-mcp` and `math-mcp` do.
- The adapter has one slash command per input type, as the existing commands do. The existing commands stay: `mermaid`, `dot`, `latex`, `wavedrom`, `plot`, `circuit`, `playground`. The new commands are `tikz`, `sysml`, `step`, `cad` and `markdown`.

## Security

| Risk | Control |
|---|---|
| A source that loops or explodes | the time limit and the heap limit of the worker; node and facet limits for CAD; `maxSourceBytes` |
| A DOT attribute that names a file or URL | Graphviz WASM has no file system and no network; `image` attributes are removed with a warning |
| TeX file access or shell escape | a virtual file system; `\write18` off |
| An HTML page that fetches a resource | the browser stage blocks every request except the loaded page |
| A tampered TeX bundle | a pinned sha256 per bundle; a mismatch deletes the file |
| Code in a CAD source | the CAD input is JSON data; the engine evaluates no code |
| A browser path from an untrusted source | the path comes only from the configuration |

The engine is not a sandbox for a hostile process. The worker limits stop a runaway render. They do not isolate the machine from a defect in a WASM engine. A host that renders hostile input at scale runs the engine in a container.

## Testing

- **Corpus.** Each input type has a folder of example sources. Each example has an expected output.
- **SVG comparison.** The test normalizes each SVG (ids, number precision, attribute order) and compares it with the expected file. A change to an expected file needs a review of its image.
- **Visual check.** A page checker loads each HTML output in the browser stage and fails on a script error, a renderer error or an empty drawing. A test page with a deliberate defect proves that the checker can fail.
- **Parsers.** The Mermaid, SysML, Plotly JSON and CSG readers have a test for each grammar rule, a test for each rejection, and a mutation audit.
- **Numbers.** Each plot helper compares its key numbers with values from a second method. An example is a gain margin from the closed form at the phase crossover.
- **Network.** A test of each stage runs with `allowNetwork: none` and asserts that no request leaves the process.
- **Runtimes and platforms.** CI runs the tests under Bun on Windows, Linux and macOS. CI also runs a smoke test of the built package under Node 22 on the same three systems.

## Documentation

- The engine repository follows the architecture-docs standard of `memoryjs` and MathTS: the root README and the ten documents of `docs/architecture/`, gated by `repo-tools check`.
- Every document is in ASD-STE100 Simplified Technical English and passes `repo-tools ste`.
- `THIRD_PARTY_NOTICES.md` lists every borrowed engine with its licence and its version.

## Licence

The engine and the adapter are MIT. The borrowed engines, the TeX packages and the fonts keep their licences, listed in "Stages" and "tex". No part with the GPL as its only licence is in the engine package or in a TeX bundle.
