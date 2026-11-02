# Changelog

This file records all notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Build plan, I9: face colors come from `brep_faces[].color`. A STEP part of 1.8 MB renders inside the default timeout. A new risk row records the read time of large parts (trial T2).
- Build plan, I1: `@viz-js/viz` makes the expected SVG files, not the Graphviz CLI. The gate checks that no `href` to an image file remains. Corpus graphs stay small for the default timeout. A new risk row records the layout time of large graphs (trial T1).

### Fixed

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

- Trial T1 (graph): the report `docs/analysis/t1-graph.md` and its sources in `trials/t1-graph/`. `@viz-js/viz` 3.31.0 renders DOT under Bun 1.4.4 and Node 22 on three systems, with the same SVG bytes in all six jobs. The layout differs from the Graphviz CLI 2.43.0. A 200-node graph takes 13 s to 42 s for each warm render.
- Trial T2 (mesh): the report `docs/analysis/t2-mesh.md` and its sources in `trials/t2-mesh/`. `occt-import-js` 0.0.23 reads a STEP, an IGES and a BREP sample under Bun 1.4.4 and Node 22 on three systems. Each sample gives the same geometry hash in all six jobs. The option `linearUnit` scales the coordinates as the design states. The STEP and IGES readers return face colours.
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
