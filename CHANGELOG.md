# Changelog

This file records all notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Trial T6: the T5 compiler builds `tex.web` with `etex.ch` and five utility primitives (`\expanded`, `\filesize`, `\pdfstrcmp`, `\creationdate`, `\shellescape`). The build passes the e-TRIP gate, makes the LaTeX format in extended mode with the pgf driver `pgfsys-dvisvgm.def`, and renders a `circuitikz` circuit with each glyph as a `<path>` under Bun and Node. Report: `docs/analysis/t6-etex-build.md`.
- Trial T5 tools: the tangler starts a module at a line that ends in `@`. The download, the program build and the trip steps move into shared modules. The T5 results do not change.

- Design, tex stage: the build tangles `tex.web` with `etex.ch`, then one engine change file per concern. The engine writes the utility primitives that the LaTeX kernel needs from their published behaviour. The build never uses the name TeX or e-TeX. CI runs the trip test and the e-TRIP test (trial T5).
- Build plan: trial T6 measures the e-TeX build, the primitive set and the pgf DVI driver. I12 takes its change files and format from T6. A new risk row covers the e-TRIP test.
- Design and build plan: STE fixes in the tex stage text and in two risk rows of the plan.
- Design, tex stage: the engine compiles `tex.web` to WASM with its own compiler and runtime, and CI runs the trip test on each build. Bundles hold only packages under the LPPL or in the public domain. The five packages with the GPL as their only licence leave the package set, each with a replacement. Glyphs become paths from the AMS Type 1 fonts (OFL) and Latin Modern (GFL) (trial T3).
- Build plan: trial T5 measures the TeX build of the engine. I12 builds on T5. The I12 gate adds the trip test, the glyph paths and the rejection of a GPL-only package.
- Design, browser stage: forced flags send all browser traffic to a refusing proxy in the engine process, and block DNS. The client never passes `--no-sandbox` (trial T4).
- Build plan, I4: gates for the network namespace, the socket sample, the sandbox and a large screenshot.
- Build plan, I9: face colors come from `brep_faces[].color`. A STEP part of 1.8 MB renders inside the default timeout. A new risk row records the read time of large parts (trial T2).
- Build plan, I1: `@viz-js/viz` makes the expected SVG files, not the Graphviz CLI. The gate checks that no `href` to an image file remains. Corpus graphs stay small for the default timeout. A new risk row records the layout time of large graphs (trial T1).

### Fixed

- Page checker: a browser that publishes no DevTools port now gives its exit state and the tail of its stderr in the error. Before, the error gave no cause.
- A render settles only after its worker has exited. A heap exhaustion rejects with `E_LIMIT`. Other worker crashes stay `E_INTERNAL`.
- A platform cache default is resolved only when no source gives `cacheDir` a value. Each platform folder needs only its own variable.
- A missing or failing browser path rejects with the path in the message. The page checker no longer waits for a DevTools port that never opens.
- An SVG drawing with no drawn child, or with only zero-size children, fails the drawing check.
- Node 22 runs the worker path of the built package: `test/node/worker.node.mjs`, run by `bun run test:node` and by the CI smoke job. Bun does not enforce the heap limit, so the heap limit holds only under Node.
- The SVG comparison and the config loader have mutation-audit tests. Each test kills a mutant that the earlier tests let through.
- The page checker stops the launched browser before it removes the profile. A Windows run no longer waits for a locked profile and loses its result.
- The page checker treats a locked DevTools port file as "not yet" and polls again.
- A render settles with `E_INTERNAL` when its worker does not stop cleanly. A stop that never resolves is bounded by `terminateWaitMs`.
- A file that exists but cannot start rejects with the browser path in the message.
- An svg whose only child is an empty `foreignObject` fails the drawing check.
- The profile removal retries `EPERM` and `ENOTEMPTY`. A port timeout names the last held read.
- The design and the architecture documents state that `E_LIMIT` covers the worker heap limit, and that `E_INTERNAL` covers other worker crashes.
- The platform-default tests write their Windows paths with escaped backslashes.
- The mutation audit runner and its mutant list are in `test/mutation/`.
- The mutation runner restores each mutated file on SIGINT, SIGTERM, an uncaught exception and exit. After a hard kill, the next run restores the file first, but only when the file still holds the recorded mutation. A file that a person edited is kept, and the run exits non-zero.
- The git ignore list covers the backup and hash files of the mutation runner.
- The leak check polls only the profile folder of its own check, for up to 5 seconds. A process of an earlier run cannot fail it.

### Added

- Trial T5 (tex build): the report `docs/analysis/t5-tex-build.md` and its sources in `trials/t5-tex-build/`. An own tangler and an own Pascal to WASM compiler build `tex.web`. The build passes the trip test; only the banner line differs. The build runs under Bun 1.4.4 and Node 22 on three systems and makes `plain.fmt`. Each glyph of the SVG is a `<path>` from the AMS Type 1 fonts. LaTeX, `tikz` and `circuitikz` need e-TeX, so the format of the design cannot build on `tex.web` alone.
- Trial T4 round 3: the client never passes `--no-sandbox`. Renders run with the Chrome sandbox on, on three systems.
- Trial T4 (browser): the report `docs/analysis/t4-browser.md` and its sources in `trials/t4-browser/`. The protocol client starts Chrome under Bun 1.4.4 and Node 22 on three systems. It renders a PNG and a PDF, and it refuses the page's unlisted requests. A forced refusing proxy and an Ubuntu network namespace close the connection gap (finding F1).
- Trial T1 (graph): the report `docs/analysis/t1-graph.md` and its sources in `trials/t1-graph/`. `@viz-js/viz` 3.31.0 renders DOT under Bun 1.4.4 and Node 22 on three systems, with the same SVG bytes in all six jobs. The layout differs from the Graphviz CLI 2.43.0. A 200-node graph takes 13 s to 42 s for each warm render.
- Trial T2 (mesh): the report `docs/analysis/t2-mesh.md` and its sources in `trials/t2-mesh/`. `occt-import-js` 0.0.23 reads a STEP, an IGES and a BREP sample under Bun 1.4.4 and Node 22 on three systems. Each sample gives the same geometry hash in all six jobs. The option `linearUnit` scales the coordinates as the design states. The STEP and IGES readers return face colours.
- Trial T3 (tex): the report `docs/analysis/t3-tex.md` and its sources in `trials/t3-tex/`. The TikZJax format with `tikz` and `circuitikz` builds in CI. The format renders under Bun 1.4.4 and Node 22 on three systems. The SVG keeps text elements, not glyph paths.
- Create the package skeleton. Create `package.json` for `@danielsimonjr/sciengjs` 0.0.0. Create the subpath export map. Create stub modules for each stage.
- Implement `render` and `capabilities` with the types of the design. A render runs in a `worker_threads` worker with a time limit. A worker crash rejects with `E_INTERNAL`.
- Implement the configuration loader with the keys, environment variables, and defaults of the design. An unreadable or invalid source rejects with `E_CONFIG`.
- `RenderError` with the eight codes of the design.
- Implement the stage registry. Implement the pair table of the design. Implement a test-only backend.
- Implement a test-only SVG comparison harness. Implement a check that rejects the Bun global in `src/`. Implement a test-only page checker over the Chrome DevTools Protocol.
- The CI workflow: Bun tests on three systems, and a Node 22 smoke test of the built package on three systems.
- `THIRD_PARTY_NOTICES.md` and the architecture documents in `docs/architecture/`.
- The design of the engine: `docs/superpowers/specs/2026-11-01-scieng-engine-design.md`.
- The incremental, subagent-driven build plan: `docs/superpowers/plans/2026-11-01-scieng-engine-build.md`.
- `README.md`, `LICENSE` (MIT), `todo.md` and this changelog.
- The repository layout of memoryjs: `docs/architecture/`, `docs/development/`, `docs/guides/`, `docs/analysis/` and `docs/roadmap/`.
- The Agentic Context File Suite at the Standard tier: `AGENTS.md`, `CLAUDE.md` and `memory/`.
- `CONTRIBUTING.md`, `SECURITY.md` and `.github/pull_request_template.md`.
