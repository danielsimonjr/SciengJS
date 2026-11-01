# sciengjs

> A local rendering engine for science and engineering diagrams, in TypeScript.

## Overview

sciengjs renders DOT, Mermaid, LaTeX math, TikZ, plots, SysML v2, STEP, IGES, BREP, CAD documents and HTML to SVG, PNG, PDF, HTML or Markdown. It runs on the local machine. It sends no source to a web service.

- npm: `@danielsimonjr/sciengjs`
- Adapter: [`scieng-mcp`](https://github.com/danielsimonjr/scieng-mcp) gives the engine to an agent harness as MCP tools, slash commands and a skill.

## Tech Stack

- Language: TypeScript, ESM.
- Runtime: Node 22 LTS or later for the package. Bun for development and tests.
- Engines: WASM and JavaScript libraries, with few dependencies and no Python. The "Stages" section of the [design](docs/superpowers/specs/2026-11-01-scieng-engine-design.md) names each engine and its licence.
- Browser stage: a local Chromium or Chrome, for Mermaid fallback layouts, HTML to PNG and HTML to PDF.

## Project Structure

| Path | Holds |
|---|---|
| `docs/superpowers/specs/` | the design: the API, the stages, each input type, the configuration, the runtime, the security controls and the tests |
| `docs/superpowers/plans/` | the build plan: the trial builds and the increments, each with one scope, one gate and one release |
| `docs/architecture/` | the ten architecture documents, gated by `repo-tools check` |
| `docs/development/` | the procedures for development: setup, tests, code style, releases |
| `docs/guides/` | the guides for users of the engine |
| `docs/analysis/` | the reports of reviews and audits |
| `docs/roadmap/` | the work after the build plan |
| `memory/` | the project memory of the agents (see `AGENTS.md`) |
| `.github/` | the pull request template |

The source (`src/`), the tests and the CI workflows arrive with increment I0 of the build plan.

## Quick Start

No package release exists. The build plan gives the order of the increments. The first npm release is increment I1.

## Key Concepts

- **Stage.** A shared engine that several input types use: graph, math, tex, mesh, browser, raster, html and plot.
- **Backend.** The code for one input type. It parses the source and calls one or more stages.
- **Worker.** Each render runs in a worker thread with a time limit and a heap limit.
- **Adapter.** `scieng-mcp` calls the engine. The engine knows nothing about MCP.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Report a security problem as [`SECURITY.md`](SECURITY.md) tells you.

## Licence

MIT. See [`LICENSE`](LICENSE). The borrowed engines keep their own licences. The design lists each licence.
