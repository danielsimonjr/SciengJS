# sciengjs

> A local rendering engine for science and engineering diagrams, in TypeScript.

[![npm](https://img.shields.io/npm/v/@danielsimonjr/sciengjs)](https://www.npmjs.com/package/@danielsimonjr/sciengjs)
[![CI](https://github.com/danielsimonjr/sciengjs/actions/workflows/ci.yml/badge.svg)](https://github.com/danielsimonjr/sciengjs/actions/workflows/ci.yml)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

sciengjs turns diagram source into images on your own machine. It sends no source to a web service. Each render runs in a worker thread with a time limit and a memory limit, so a bad input cannot hang or crash the caller.

## What this release does

Release 0.9.0 holds ten input types. They are **Graphviz DOT**, **Mermaid** (every diagram type) and **LaTeX math** (to SVG, PNG and PDF). They also include **Plotly plots** (to SVG, PNG and HTML) and **HTML** (to PNG, PDF and Markdown). The CAD files **STEP**, **IGES** and **BREP** go to GLB, to a viewer page in HTML, and to PNG. A **CAD document** (a CSG model in JSON) goes to GLB, STL, HTML and PNG. A **SysML v2** source in a textual subset goes to SVG, PNG and PDF. A **TikZ** picture goes to SVG, PNG and PDF through the tex stage. The `tikz` input type includes circuitikz, tikz-cd and chemfig. The first render downloads the TeX bundles. The browser stage draws the Mermaid types other than class, state and sequence, and every PDF.

| Input | Output | Engine |
|---|---|---|
| DOT | SVG | Graphviz 16.1.0, compiled to WASM (`@viz-js/viz`) |
| DOT | PNG | Graphviz, then resvg compiled to WASM (`@resvg/resvg-wasm`), with a bundled font |
| Mermaid (class, state, sequence) | SVG | The engine's own parsers and layouts. Class and state diagrams go through Graphviz. |
| Mermaid (class, state, sequence) | PNG | The same SVG, then resvg compiled to WASM (`@resvg/resvg-wasm`), with a bundled font |
| Mermaid (all other types) | SVG, PNG, PDF | The pinned Mermaid 11.17.2 build in the browser stage. The engine serves the build from the package. |
| DOT, Mermaid | PDF | The SVG, printed by the browser stage |
| HTML | PNG, PDF | The browser stage |
| STEP, IGES, BREP | GLB, HTML, PNG | OpenCascade, compiled to WASM (`occt-import-js`); a Three.js viewer page |
| CAD document | GLB, STL, 3MF, HTML, PNG | The engine's own reader; the solid operations through `manifold-3d` (WASM) |
| SysML v2 (a textual subset) | SVG, PNG, PDF | The engine's own parser and views, then Graphviz; PDF through the browser stage |
| TikZ picture, circuitikz, tikz-cd, chemfig, mhchem, bussproofs, AMS math | SVG, PNG, PDF | An own WASM build of `tex.web` with `etex.ch`; the bundles download on first use (`SCIENG_TEX_BUNDLE_URL`, `SCIENG_CACHE_DIR`) and each has a pinned sha256; PNG through resvg; PDF through the browser stage |

- **No network.** The DOT and Mermaid paths make no network request. The browser stage starts Chrome or Chromium from `SCIENG_BROWSER` with a new profile. Its flags stop every connection out of the host. The client refuses every request except the page and the pinned Mermaid build. CI checks the browser process tree on Linux, macOS and Windows.
- **Unsafe attributes are removed.** The engine removes each `image` and `stylesheet` attribute before the layout and gives a warning for each one. A DOT file cannot make the engine or a browser fetch a file or a URL. A `URL` attribute stays as a link in the SVG.
- **The same text on every machine.** PNG text uses the bundled Liberation Serif font, not the fonts of the host. The engine gives a warning when the drawing asks for bold, italic or a character that the font does not have.
- **Limits.** Each render has a time limit, a source size limit and a heap limit. A PNG has a pixel limit of 1024 MB.
- **Typed errors.** A failed render rejects with a `RenderError` that has a code. The engine never falls back to another format.
- **Pinned runtime dependencies** only: `@viz-js/viz`, `@resvg/resvg-wasm`, `@mathjax/src`, `parse5`, `occt-import-js` and `manifold-3d`. No native module and no Python.

Each later release adds one input type. The [Roadmap](#roadmap) lists them.

## Install

```sh
npm install @danielsimonjr/sciengjs
```

The package needs Node 22 or later. The package is an ES module.

## Quick start

```js
import { writeFile } from "node:fs/promises";
import { render } from "@danielsimonjr/sciengjs";

const source = `digraph G {
  rankdir=LR;
  sensor -> filter -> controller -> actuator;
  controller -> sensor [label="feedback", style=dashed];
}`;

const svg = await render({ type: "dot", source, format: "svg" });
await writeFile("loop.svg", svg.bytes);

const png = await render({ type: "dot", source, format: "png", options: { scale: 2 } });
await writeFile("loop.png", png.bytes);

console.log(png.mime, png.backend, png.warnings);
// image/png graph/viz+raster/resvg []
```

`render` returns a `RenderResult`:

| Field | Holds |
|---|---|
| `bytes` | the output, as a `Uint8Array` |
| `mime` | the media type, for example `image/svg+xml` |
| `backend` | the backend that rendered, for example `graph/viz` |
| `warnings` | one string for each thing that the engine removed or could not draw |

The `png` format takes one option, `scale` (a number greater than 0, default 1). Any other option rejects with `E_INPUT`.

## Check what this machine can render

```js
import { capabilities } from "@danielsimonjr/sciengjs";

for (const pair of await capabilities()) {
  if (pair.ready) console.log(pair.type, "->", pair.format);
}
```

`capabilities` reports each input and output pair of the design, the stage that the pair needs, and whether the stage is ready here. Ready pairs include `dot -> svg`, `dot -> png`, `math -> svg` and `math -> png`. A pair that needs the browser stage is ready only when a browser is configured.

## Errors

```js
import { render, RenderError } from "@danielsimonjr/sciengjs";

try {
  await render({ type: "dot", source: "digraph { a -> }", format: "svg" });
} catch (err) {
  if (err instanceof RenderError) console.log(err.code, err.message);
}
```

| Code | Means |
|---|---|
| `E_INPUT` | the source or an option is not valid |
| `E_UNSUPPORTED` | this build has no backend for the pair, for example `tikz` to `svg` |
| `E_LIMIT` | the source, the heap or the PNG pixels are over a limit |
| `E_TIMEOUT` | the render took longer than `timeoutMs` |
| `E_STAGE_MISSING` | a file that a stage needs, for example the bundled font, is missing |
| `E_CONFIG` | a configuration value is not valid |
| `E_INTEGRITY` | a downloaded file does not have its expected hash |
| `E_INTERNAL` | a defect in the engine. Please report the defect |

## Configuration

Each render takes an optional configuration as its second argument. An environment variable or a configuration file can also set each value.

| Key | Environment variable | Default |
|---|---|---|
| `timeoutMs` | `SCIENG_TIMEOUT_MS` | 60000 |
| `maxSourceBytes` | `SCIENG_MAX_SOURCE_BYTES` | 10485760 (10 MiB) |
| `maxMemoryMb` | `SCIENG_MAX_MEMORY_MB` | 2048 |
| `rasterFont` | `SCIENG_RASTER_FONT` | the bundled Liberation Serif |
| `assetsUrl` | `SCIENG_ASSETS_URL` | the `assets/` folder of the package, which holds the font and `index_bg.wasm`. A `file:` URL with a host other than `localhost` rejects with `E_CONFIG`. |
| `allowNetwork` | `SCIENG_ALLOW_NETWORK` | `tex-bundles` (the DOT path makes no request) |
| `maxCadNodes` | `SCIENG_MAX_CAD_NODES` | 10000 |
| `maxCadFacets` | `SCIENG_MAX_CAD_FACETS` | 2000000 |

`SCIENG_CONFIG` names a JSON configuration file. `loadConfig` returns the resolved configuration.

```js
await render({ type: "dot", source, format: "png" }, { timeoutMs: 10000, maxMemoryMb: 512 });
```

The heap limit holds under Node. Bun runs the engine, but Bun does not enforce the heap limit of a worker.

## Stage subpaths

A caller that needs only one stage can import the subpath of that stage:

```js
import { dotToSvg } from "@danielsimonjr/sciengjs/graph";
import { svgToPng } from "@danielsimonjr/sciengjs/raster";

const { svg, warnings } = await dotToSvg("digraph { a -> b }");
const png = await svgToPng(svg, { scale: 1, maxMemoryMb: 512 });
```

A subpath call runs in the calling thread, without the worker and its limits. Use `render` for input that you do not trust.

## Mermaid

The `mermaid` input draws class, state and sequence diagrams without a browser. A line outside the grammar rejects the render with `E_INPUT`, and the message names the line. Set `lenient` to `true` to skip such a line and get a warning instead.

Other Mermaid types, for example `flowchart` and `gantt`, need the browser stage. A `png` takes the option `scale` (above 0, not more than 8, default 1) on both paths. The browser path sizes the page from the `viewBox` of the diagram. The `svg` of the browser path has an explicit `width` and `height`. Any other `png` option rejects with `E_INPUT`.

```js
import { render } from "@danielsimonjr/sciengjs";

const source = "sequenceDiagram\nAlice->>Bob: Hello Bob\nBob-->>Alice: Hi Alice";
const { bytes, warnings } = await render({ type: "mermaid", source, format: "svg" }, {});
```

Other Mermaid diagram types (for example flowchart and gantt) go through the browser stage. They need `SCIENG_BROWSER`. Without it they reject with `E_STAGE_MISSING`. The pinned Mermaid build ships in the package, and the browser stage serves it to the page, so no request leaves the process.

## Math

The `math` input renders LaTeX math through MathJax. The output draws each glyph as a path, so it needs no font. The packages `ams`, `boldsymbol`, `color` and `mhchem` are loaded. A `\require` of a loaded package has no effect. A `\require` of a different package rejects with `E_UNSUPPORTED`. A character that the math font does not hold also rejects with `E_UNSUPPORTED`. The message names the character.

A `png` takes the option `scale` (a finite number above 0, default 1). The `svg` takes no option.

```js
import { render } from "@danielsimonjr/sciengjs";

const svg = await render({ type: "math", source: "\\frac{a}{b}", format: "svg" });
const png = await render({ type: "math", source: "\\ce{H2O + CO2 -> H2CO3}", format: "png", options: { scale: 2 } });
```

## Plots

The `plot` input draws a chart from JSON. The source is a JSON text with the keys `data` and `layout`. The output formats are `svg`, `png` and `html`. The `svg` and `png` outputs make no network request.

```js
import { render } from "@danielsimonjr/sciengjs";

const source = JSON.stringify({
  data: [{ type: "scatter", mode: "lines+markers", x: [0, 1, 2], y: [0, 1, 4], name: "y = x^2" }],
  layout: { title: { text: "Square" } },
});
const { bytes } = await render({ type: "plot", source, format: "svg" }, {});
```

The engine reads a subset of the Plotly figure format. The subset holds `scatter` traces, page and grid layout keys, `line` and `rect` shapes, and linear or log axes. A key outside the subset rejects with `E_INPUT` and the key path. Set `lenient` to `true` to skip such a key and get a warning. The `html` output is a page that draws the figure with Plotly 4.2.0, the pinned build. The page loads that build from a CDN, with a subresource integrity hash. The package does not ship Plotly. The full subset is in the [design](docs/superpowers/specs/2026-11-01-scieng-engine-design.md), section PLOT.

The reader applies these rules:

- A figure has the top-level keys `data` and `layout` only.
- The first axis of each letter is `xaxis` or `yaxis`. The other axes are `xaxis2`, `xaxis3` and up, with no leading zero. Plotly also accepts `xaxis1` for the first axis. This reader rejects `xaxis1`, so that each axis has one name.
- An axis key must name an axis of a subplot in `layout.grid`.
- `tickformat` is `.Nf` only, with N from 0 to 20. N sets the fixed decimals of the tick labels.
- `dtick`, `width` and `height` must be above zero.
- One axis has 1000 ticks at most. A `dtick` that gives more ticks rejects with `E_INPUT` and the key path, for example `layout.xaxis.dtick`.

A tick label that needs more than 20 decimals uses exponent form, for example `1e-300`. A log axis that spans too many decades for minor ticks shows major ticks only.

### Control helpers

The `./plot` subpath has six helpers. Each helper takes a transfer function `{ num, den }` with the coefficients of the numerator and the denominator, highest power first. Each helper returns `{ figure, numbers }`. The `figure` is a plot figure. Pass it to `render` as JSON text to draw it. The `numbers` hold the key values that the analysis derives from the same model.

Frequencies are in rad/s. Margins and phases are in degrees. Overshoot is in percent.

`bode` returns the crossover frequencies and the margins:

```js
import { bode } from "@danielsimonjr/sciengjs/plot";

const { figure, numbers } = bode({ num: [10], den: [1, 1, 0] });
// numbers.gainCrossover is about 3.08, numbers.phaseMargin is about 17.96
```

`step` returns the final value, the rise time, the settling time, the overshoot and the peak time:

```js
import { step } from "@danielsimonjr/sciengjs/plot";

const { figure, numbers } = step({ num: [1], den: [1, 0.6, 1] });
// numbers.overshoot is about 37.2, numbers.riseTime is about 1.32
```

The step helper measures the peak and the overshoot in the direction of the final value, so a negative DC gain gives a correct overshoot. A response with no peak before the end of the time grid has a `peakTime` of `null` and an `overshoot` of 0. A system with a pole on or right of the imaginary axis has no final value: each number is `null`. The rise and settling times are interpolated between samples.

The helpers reject with `E_INPUT` when the roots of the model do not converge, or when a computed value is not finite. A pole or a zero at 0 is exact and does not set the frequency range.

`impulse` returns the peak value and its time:

```js
import { impulse } from "@danielsimonjr/sciengjs/plot";

const { figure, numbers } = impulse({ num: [1], den: [1, 1] });
// numbers.peak is 1, numbers.peakTime is 0
```

`nyquist` returns the least distance from the curve to the point -1:

```js
import { nyquist } from "@danielsimonjr/sciengjs/plot";

const { figure, numbers } = nyquist({ num: [10], den: [1, 1, 0] });
// numbers.minDistanceToMinusOne is about 0.299
```

`poleZero` returns the poles and the zeros:

```js
import { poleZero } from "@danielsimonjr/sciengjs/plot";

const { figure, numbers } = poleZero({ num: [1, 3], den: [1, 2, 5] });
// the poles are -1 + 2j and -1 - 2j, the zero is -3
```

`rootLocus` returns the breakaway points and the gain at each point:

```js
import { rootLocus } from "@danielsimonjr/sciengjs/plot";

const { figure, numbers } = rootLocus({ num: [1], den: [1, 3, 2] });
// numbers.breakawayPoints[0] is { re: -1.5, k: 0.25 }
```

To draw a helper figure, pass it to `render`:

```js
import { render } from "@danielsimonjr/sciengjs";
import { bode } from "@danielsimonjr/sciengjs/plot";

const { figure } = bode({ num: [10], den: [1, 1, 0] });
const { bytes } = await render({ type: "plot", source: JSON.stringify(figure), format: "html" }, {});
```

## CAD

A CAD document is a CSG model in JSON. The engine reads the document as data. The engine runs no code from the document. The node types are:

- the primitives `cube`, `cylinder`, `sphere` and `polyhedron`;
- the 2D profiles `rectangle`, `circle` and `polygon`, only as the child of `extrude` or `revolve`;
- the operations `union`, `difference` and `intersection`;
- the transforms `translate`, `rotate`, `scale` and `mirror`.

Each node can have a `name` and a `color`.

The builder functions of the `./mesh` subpath write the same document from a TypeScript program:

```js
import { cad } from "@danielsimonjr/sciengjs/mesh";
import { render } from "@danielsimonjr/sciengjs";

const plate = cad.difference([
  cad.cube([40, 20, 4], { color: [0.7, 0.7, 0.7] }),
  cad.translate([10, 10, -1], cad.cylinder(6, 3, { color: [0.2, 0.4, 1] })),
]);
const source = JSON.stringify(cad.cadDocument(plate, { segments: 48 }));
const { bytes } = await render({ type: "cad", source, format: "stl" }, {});
```

- The faces keep the colour of the primitive that made them. The cut face of a `difference` has the colour of the cutter.
- STL holds no colour and no name. A coloured model gives a warning in STL.
- `format: "3mf"` gives a 3MF package that keeps the colours and the names. The unit is millimeter.
- A document with more than `maxCadNodes` nodes rejects with `E_LIMIT` before the solid operations start. A model with more than `maxCadFacets` facets also rejects with `E_LIMIT`.
- A bad value rejects with `E_INPUT`. The message gives the JSON path, for example `model.children[1].radius`.

## SysML

The `sysml` input reads a subset of the SysML v2 text notation. The subset holds `package`, `part def`, `part`, `attribute`, `port def`, `port`, `connect`, `interface def`, `interface`, `requirement def`, `requirement`, `satisfy`, `:>` and comments. The [design](docs/superpowers/specs/2026-11-01-scieng-engine-design.md) gives the exact grammar.

The option `view` selects the drawing:

- `bdd` (the default): the definitions, the composition and the specialization;
- `ibd`: the parts, ports and connections of the part def that the option `root` names;
- `requirements`: the requirements and the `satisfy` relations.

```js
import { render } from "@danielsimonjr/sciengjs";

const source = "part def Car { part wheels : Wheel [4]; } part def Wheel;";
const { bytes } = await render({ type: "sysml", source, format: "svg" }, {});
```

- A construct outside the subset rejects with `E_INPUT`, and the message names the line.
- Set `lenient` to `true` to skip a statement with an unknown keyword and get a warning.
- A `png` takes the option `scale`. A `pdf` needs the browser stage.

## Roadmap

The [build plan](docs/superpowers/plans/2026-11-01-scieng-engine-build.md) gives the order of the increments. Each increment adds one input type, its tests and one release. The [design](docs/superpowers/specs/2026-11-01-scieng-engine-design.md) gives the API, the stages, the security controls and the licence of each engine.

| Input type | Stage | Status |
|---|---|---|
| DOT | graph, raster | released in 0.1.0 |
| Mermaid | graph, mermaid, browser | class, state and sequence: released in 0.2.0; other types: released in 0.3.0 |
| LaTeX math | math (MathJax) | svg, png and pdf are built; pdf needs the browser stage |
| TikZ, circuitikz, LaTeX | tex (an own WASM build of `tex.web`) | tikz svg, png and pdf are built (unreleased); the bundles come from `texBundleUrl` |
| Plots | plot | svg, png and html: released in 0.5.0; pdf is not planned |
| SysML v2 | sysml, graph | svg, png and pdf: released in 0.9.0 |
| STEP, IGES, BREP | mesh (OpenCascade WASM) | glb, html and png: released in 0.7.0 |
| CAD documents | mesh (`manifold-3d`) | glb, stl, html and png: released in 0.8.0; 3mf: unreleased |
| HTML to PNG, PDF and Markdown | html, browser | PNG and PDF: released in 0.3.0; Markdown: released in 0.6.0 |

## Use from an agent

[`scieng-mcp`](https://github.com/danielsimonjr/scieng-mcp) gives the engine to an agent harness as MCP tools, slash commands and a skill. The engine itself knows nothing about MCP.

## Development

Install Bun 1.4.4 and Node 22 or later. Then run `bun install --frozen-lockfile`.

| Command | Does |
|---|---|
| `bun test` | runs the full test suite |
| `bun run typecheck` | typechecks `src/` and `test/` |
| `bun run build` | writes the ESM package into `dist/` |
| `bun run smoke` | packs the build, installs it in a new folder and runs it under Node |

| Path | Holds |
|---|---|
| `src/` | the engine: the API, the configuration, the worker, the registry and the stages |
| `test/` | the unit tests, the corpus tests, the Node tests and the smoke test |
| `docs/superpowers/` | the design and the build plan |
| `docs/architecture/` | the architecture documents, gated by `repo-tools check` |
| `docs/analysis/` | the reports of the trial builds and the reviews |
| `trials/` | the trial builds of later stages. The package does not ship them |

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Report a security problem as [`SECURITY.md`](SECURITY.md) tells you.

## Licence

MIT. See [`LICENSE`](LICENSE). Each borrowed engine keeps its own licence. [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) lists them: Graphviz (EPL-2.0), resvg (MPL-2.0) and Liberation Serif (SIL Open Font License 1.1).
