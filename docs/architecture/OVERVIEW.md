# sciengjs overview

`@danielsimonjr/sciengjs` is a TypeScript library. The library renders science and engineering sources to SVG, PNG, PDF, HTML, and Markdown. The library runs on the local machine. The library sends no source to a web service.

Status: the graph, raster and Mermaid stages exist. The package renders DOT to SVG and DOT to PNG. It renders Mermaid class, state and sequence diagrams to SVG and PNG. The other stages do not exist yet. A pair of a missing stage rejects with `E_UNSUPPORTED`.

## What the engine does

- It accepts a source and an output format. The render returns the bytes, the MIME type, the backend name and the warnings.
- It rejects an unsupported pair with `E_UNSUPPORTED`. It never falls back to another format.
- The engine draws Mermaid class, state and sequence diagrams. The graph stage draws a class diagram and a state diagram. The engine draws a sequence diagram with its own layout. Other Mermaid diagram types reject with `E_UNSUPPORTED`.
- It runs each render in a worker thread. A render that passes its time limit ends with `E_TIMEOUT`.
- It reads its settings from a configuration file, from environment variables and from the call options. The precedence is: call option, environment, file, default.

## Layout

| Path | Content |
|---|---|
| `src/index.ts` | The public API: `render`, `capabilities` and the types. |
| `src/core.ts` | The render and capability logic, with an injectable registry. |
| `src/config.ts` | The configuration loader. |
| `src/assets.ts` | The asset folder: the check of `assetsUrl`, the bundled font path, and the reads of the font and the WASM file. |
| `src/types.ts` | The input types, the output formats and the request and result types. |
| `src/version.ts` | The engine version. The build writes it. Do not edit it by hand. |
| `src/errors.ts` | `RenderError`, its eight codes and `isRenderError`. |
| `src/registry.ts` | The stage registry: a map from `type:format` to a backend module. |
| `src/pairs.ts` | The table of supported pairs and their stages. |
| `src/worker/` | The worker runner and the worker entry. |
| `src/graph/` | The graph stage: the DOT to SVG wrapper, the image attribute scanner, the text helpers of the DOT adapters and the backends (SVG, PNG and PDF). |
| `src/raster/` | The raster stage: SVG to PNG through resvg, and the font check. |
| `src/mermaid/` | The Mermaid stage: the header and option reader, the parsers of the class, state and sequence diagrams, the DOT builders, the sequence layout and the SVG render. |
| `src/math/` | The math stage: LaTeX math to SVG through MathJax, and the SVG, PNG and PDF backends. |
| `src/plot/` | The plot stage: the reader of the Plotly JSON subset, the tick algorithm, the control plots, and the SVG, PNG and HTML backends. |
| `src/sysml/` | The SysML stage: the tokenizer and parser of the SysML v2 subset, the bdd, ibd and requirements views to DOT, the SVG render, and the SVG, PNG and PDF backends. |
| `src/browser/` | The browser stage: the Chrome DevTools Protocol client, the browser flags and profile, the page render, and the PNG and PDF backends. |
| `src/html/` | The html stage: HTML to Markdown through parse5, the image download, and the md backend. |
| `src/mesh/` | The mesh stage. It holds the STEP, IGES and BREP reader through occt-import-js, the CAD document reader, the builder functions and the solid operations through manifold-3d. It also holds the glTF binary and STL writers, and the glb, stl, html and png backends with their output limits. |
| `assets/` | The files that ship in the package: the bundled raster font, the resvg WASM file `index_bg.wasm` and the licence texts. |
| `scripts/` | `prepare-build.mjs`, which the build runs. The script writes `src/version.ts` and copies `index_bg.wasm` into `assets/`. |
| `test/unit/` | Unit tests of each module. |
| `test/corpus/` | The DOT and Mermaid corpora: each source and its expected SVG. |
| `test/integration/` | The page checker tests. They need a browser. |
| `test/support/` | Test-only helpers: the SVG comparison, the Bun global scan, the network guard, the page checker and the stub backends. |
| `test/smoke/smoke.mjs` | The Node smoke test of the built package. |

## Numbers

`repo-tools map` measures the values in the table below. The gate checks each value against a new parse.

Regenerate: `repo-tools map . --out=docs/architecture` · Check: `repo-tools check . --docs=docs/architecture`

## Verification

Two tools measure the repository. The tools use different scopes.

The table lists `repo-tools map` metrics. `repo-tools map` parses each source file that git tracks, in `src/`, `test/` and `trials/`. The gate compares each row with a new parse.

| Claim | Value | Source |
|---|---|---|
| totalSourceFiles | 297 | repo-tools map |
| totalLinesOfCode | 35289 | repo-tools map |
| totalExports | 747 | repo-tools map |
| totalTypeOnlyImports | 91 | repo-tools map |
| totalModules | 3 | repo-tools map |
| entryRoots | 109 | repo-tools map |
