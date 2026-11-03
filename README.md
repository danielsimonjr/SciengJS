# sciengjs

> A local rendering engine for science and engineering diagrams, in TypeScript.

[![npm](https://img.shields.io/npm/v/@danielsimonjr/sciengjs)](https://www.npmjs.com/package/@danielsimonjr/sciengjs)
[![CI](https://github.com/danielsimonjr/sciengjs/actions/workflows/ci.yml/badge.svg)](https://github.com/danielsimonjr/sciengjs/actions/workflows/ci.yml)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

sciengjs turns diagram source into images on your own machine. It sends no source to a web service. Each render runs in a worker thread with a time limit and a memory limit, so a bad input cannot hang or crash the caller.

## What this release does

Release 0.1.0 holds the first input type: **Graphviz DOT**.

| Input | Output | Engine |
|---|---|---|
| DOT | SVG | Graphviz 16.1.0, compiled to WASM (`@viz-js/viz`) |
| DOT | PNG | Graphviz, then resvg compiled to WASM (`@resvg/resvg-wasm`), with a bundled font |

- **No network.** The DOT path makes no network request.
- **Unsafe attributes are removed.** The engine removes each `image` and `stylesheet` attribute before the layout and gives a warning for each one. A DOT file cannot make the engine or a browser fetch a file or a URL. A `URL` attribute stays as a link in the SVG.
- **The same text on every machine.** PNG text uses the bundled Liberation Serif font, not the fonts of the host. The engine gives a warning when the drawing asks for bold, italic or a character that the font does not have.
- **Limits.** Each render has a time limit, a source size limit and a heap limit. A PNG has a pixel limit of 1024 MB.
- **Typed errors.** A failed render rejects with a `RenderError` that has a code. The engine never falls back to another format.
- **Two runtime dependencies**, both pinned: `@viz-js/viz` and `@resvg/resvg-wasm`. No native module and no Python.

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

`capabilities` reports each input and output pair of the design, the stage that the pair needs, and whether the stage is ready here. In this release only `dot -> svg` and `dot -> png` are ready.

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
| `E_UNSUPPORTED` | this build has no backend for the pair, for example `math` to `svg` |
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

```js
import { render } from "@danielsimonjr/sciengjs";

const source = "sequenceDiagram\nAlice->>Bob: Hello Bob\nBob-->>Alice: Hi Alice";
const { bytes, warnings } = await render({ type: "mermaid", source, format: "svg" }, {});
```

Other Mermaid diagram types reject with `E_UNSUPPORTED`.

## Roadmap

The [build plan](docs/superpowers/plans/2026-11-01-scieng-engine-build.md) gives the order of the increments. Each increment adds one input type, its tests and one release. The [design](docs/superpowers/specs/2026-11-01-scieng-engine-design.md) gives the API, the stages, the security controls and the licence of each engine.

| Input type | Stage | Status |
|---|---|---|
| DOT | graph, raster | released in 0.1.0 |
| Mermaid | graph, mermaid, browser | class, state and sequence: released in 0.2.0; other types: planned |
| LaTeX math | math (MathJax) | planned |
| TikZ, circuitikz, LaTeX | tex (an own WASM build of `tex.web`) | trial builds pass |
| Plots | plot | planned |
| SysML v2 | sysml | planned |
| STEP, IGES, BREP | mesh (OpenCascade WASM) | trial build passes |
| HTML to PNG, PDF and Markdown | html, browser | planned |

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
