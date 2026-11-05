<!-- repo-map:no-verification -->
# sciengjs public API

## Entry point `.`

### `render(req, config?)`

Renders one source to one format.

| Parameter | Type | Meaning |
|---|---|---|
| `req` | `RenderRequest` | The input type, the source, the output format and the options. |
| `config` | `Partial<SciengConfig>`, optional | Call options. They override the environment, the file and the defaults. |

Returns `Promise<RenderResult>`. The result holds `bytes`, `mime`, `backend`, `warnings` and, when present, `assets`.

Rejects with `RenderError`. The codes are: `E_INPUT`, `E_UNSUPPORTED`, `E_LIMIT`, `E_TIMEOUT`, `E_STAGE_MISSING`, `E_CONFIG`, `E_INTEGRITY` and `E_INTERNAL`. The render never falls back to another format. `E_LIMIT` covers the source size, the heap limit of the render worker and the pixel buffer of a PNG render. A worker crash for any other reason is `E_INTERNAL`.

### Options of the graph stage

| Pair | Option | Type | Default | Meaning |
|---|---|---|---|---|
| `dot` to `svg` | none | | | Any option rejects with `E_INPUT`. |
| `dot` to `png` | `scale` | finite number above zero | `1` | Multiplies the size of the image. A pixel buffer over `maxMemoryMb` or over 1024 MB rejects with `E_LIMIT`. Any other option rejects with `E_INPUT`. |

The graph stage removes each `image` attribute and each `stylesheet` attribute of the source before it renders. It reports one warning for each removed attribute. It also removes any `xml-stylesheet` instruction from the SVG. A `URL` or `href` attribute stays as a hyperlink. The stage reads no image file and opens no network connection.

The PNG render draws text with the bundled font, Liberation Serif Regular 2.1.5. The font is licensed under the SIL Open Font License 1.1. The package does not bundle the bold and italic faces. Bold and italic text draw in the regular face, and the render reports one warning for each. A character that the font does not hold draws no pixel, and the render reports one warning. The configuration key `rasterFont` (environment variable `SCIENG_RASTER_FONT`) names another TrueType or OpenType file. A file that the stage cannot read rejects with `E_CONFIG`. A file with no font signature, and a TrueType collection, also reject with `E_CONFIG`. A bundled font that is missing or invalid rejects with `E_STAGE_MISSING`.

### Graph size and `timeoutMs`

The default `timeoutMs` is 60000. On one development host, the graph stage renders a 100-node seeded random graph in 0.79 s to 1.21 s warm. It renders a 200-node seeded random graph in 3.3 s to 6.6 s warm. The random graphs have two edges per node, drawn from a fixed seed. The times come from five runs. The trial graph `large200.dot` has 200 nodes and 399 edges. It takes 40 s to 44 s per warm render on the same host. The trial report T1 measured it at 12 s to 51 s per warm render, and at 153 s in one local run. Layout time depends on the graph, not only on the node count. A large graph can therefore pass `timeoutMs`. Such a render rejects with `E_TIMEOUT`. The caller raises `timeoutMs` for that graph.

### Options of the Mermaid stage

| Pair | Option | Type | Default | Meaning |
|---|---|---|---|---|
| `mermaid` to `svg` | `lenient` | `true` or `false` | `false` | Strict mode rejects a line outside the grammar with `E_INPUT`. The message gives the line number and the line text. Lenient mode skips the line and adds one warning that names the line. Any other option rejects with `E_INPUT`. |
| `mermaid` to `png` | `lenient` | `true` or `false` | `false` | The same as `mermaid` to `svg`. |

The stage reads the header line of the source after the front matter, the directives and the comment lines. The header names the diagram type: `classDiagram`, `stateDiagram-v2` or `sequenceDiagram`. Any other Mermaid type rejects with `E_UNSUPPORTED`, and the message names the browser stage. A class diagram and a state diagram go through the graph stage. A sequence diagram uses the layout of the Mermaid stage.

The sequence layout measures each text run as 8 px for each character. A label with wide characters can run past its box. The PNG render of a Mermaid source uses the same font rule as the DOT render. The key `rasterFont` changes the font of the Mermaid render and the DOT render.

### `capabilities(config?)`

Lists each supported pair with its stage and its readiness.

Returns `Promise<Capability[]>`. Each entry holds `type`, `format`, `stage`, `ready` and, when the pair is not ready, `reason`.

### `loadConfig(options?, deps?)`

Resolves the configuration. Returns `Promise<SciengConfig>`. It rejects with `E_CONFIG`.

### `RenderError`

| Member | Type | Meaning |
|---|---|---|
| `name` | `"RenderError"` | The error name. |
| `code` | `RenderErrorCode` | One of the eight codes. |
| `message` | `string` | The message. |
| `line` | `number \| undefined` | The one-based source line, when the failure has one. |
| `column` | `number \| undefined` | The one-based source column, when the failure has one. |

### Types

| Type | Values |
|---|---|
| `InputType` | `dot`, `mermaid`, `math`, `tikz`, `plot`, `sysml`, `step`, `iges`, `brep`, `cad`, `html` |
| `OutputFormat` | `svg`, `png`, `pdf`, `html`, `md`, `glb`, `stl` |
| `RenderRequest` | `{ type, source, format, options? }`. The `source` is text, or bytes for `step`, `iges` and `brep`. |
| `RenderResult` | `{ bytes, mime, backend, warnings, assets? }` |
| `RenderAsset` | `{ name, bytes, mime }` |
| `Capability` | `{ type, format, stage, ready, reason? }` |
| `SciengConfig` | The eight configuration keys. `browser` and `rasterFont` are optional. |
| `NetworkPolicy` | `none`, `tex-bundles`, `tex-bundles,images` |

## Subpaths

| Subpath | Content |
|---|---|
| `./graph` | DOT to SVG through the viz library. It exports `dotToSvg`. |
| `./raster` | SVG to PNG through resvg. It exports `svgToPng` and `isFontFile`. |
| `./mermaid` | The Mermaid parsers, the DOT builders, the sequence layout and the SVG render. It exports `prepare`, `parseClassDiagram`, `classToDot`, `parseStateDiagram`, `stateToDot`, `parseSequenceDiagram`, `layoutSequence` and `renderMermaidSvg`. |
| `./mesh` | The mesh stage. The subpath exports `readCad` (STEP, IGES and BREP through occt-import-js), `writeGlb`, `writeStl`, `readMeshOptions`, `parseCadDocument`, `checkCadDocument`, `buildCad`, the segment constants `DEFAULT_SEGMENTS`, `MIN_SEGMENTS` and `MAX_SEGMENTS`, the node types of a CAD document, and `cad`, the builder functions. |
| `./math` | The math stage. It exports `mathToSvg` and the type `MathOptions`. |
| `./plot` | The plot stage. It exports `plotToSvg`, `readPlotFigure`, `linearTicks`, `logTicks`, `paddedRange`, `bode`, `step`, `impulse`, `poleZero`, `nyquist`, `rootLocus`, `checkTransferFunction`, `polynomialRoots` and their types. |
| `./html` | The html stage. It exports `htmlToMarkdown`. |
| `./browser` | The browser stage. It exports `CdpConnection`, `forcedBrowserFlags`, `startRefusingProxy`, `renderHtmlPage` and their types. |

The package exports only the subpaths that have content. A caller that imports a subpath loads no WASM file.
