# sciengjs overview

`@danielsimonjr/sciengjs` is a TypeScript library. The library renders science and engineering sources to SVG, PNG, PDF, HTML, and Markdown. The library runs on the local machine. The library sends no source to a web service.

Status: increment I0, the skeleton. The package renders no input yet. The package has the public API, the configuration loader, the worker runner, the stage registry and the test harnesses. The first backend, DOT to SVG, arrives with increment I1.

## What the engine does

- It accepts a source and an output format. The render returns the bytes, the MIME type, the backend name and the warnings.
- It rejects an unsupported pair with `E_UNSUPPORTED`. It never falls back to another format.
- It runs each render in a worker thread. A render that passes its time limit ends with `E_TIMEOUT`.
- It reads its settings from a configuration file, from environment variables and from the call options. The precedence is: call option, environment, file, default.

## Layout

| Path | Content |
|---|---|
| `src/index.ts` | The public API: `render`, `capabilities` and the types. |
| `src/core.ts` | The render and capability logic, with an injectable registry. |
| `src/config.ts` | The configuration loader. |
| `src/errors.ts` | `RenderError` and its eight codes. |
| `src/registry.ts` | The stage registry: a map from `type:format` to a backend module. |
| `src/pairs.ts` | The table of supported pairs and their stages. |
| `src/worker/` | The worker runner and the worker entry. |
| `src/graph`, `src/mermaid`, `src/math`, `src/tex`, `src/plot`, `src/sysml`, `src/mesh`, `src/browser`, `src/html`, `src/raster` | The subpath stubs. Each stage fills its folder in its increment. |
| `test/unit/` | Unit tests of each module. |
| `test/integration/` | The page checker tests. They need a browser. |
| `test/support/` | Test-only helpers: the SVG comparison, the Bun global scan, the page checker and the stub backends. |
| `test/smoke/smoke.mjs` | The Node smoke test of the built package. |

## Numbers

`repo-tools map` measures the values in the table below. The gate checks each value against a new parse.

Regenerate: `repo-tools map . --out=docs/architecture` · Check: `repo-tools check . --docs=docs/architecture`

## Verification

Two tools measure the repository. The tools use different scopes.

The table lists `repo-tools map` metrics. `repo-tools map` parses each source file that git tracks, in `src/`, `test/` and `trials/`. The gate compares each row with a new parse.

| Claim | Value | Source |
|---|---|---|
| totalSourceFiles | 49 | repo-tools map |
| totalLinesOfCode | 3962 | repo-tools map |
| totalExports | 77 | repo-tools map |
| totalTypeOnlyImports | 9 | repo-tools map |
| totalModules | 2 | repo-tools map |
| entryRoots | 20 | repo-tools map |
