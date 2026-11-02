# Changelog

This file records all notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- A render settles only after its worker has exited. A heap exhaustion rejects with `E_LIMIT`. Other worker crashes stay `E_INTERNAL`.
- A platform cache default is resolved only when no source gives `cacheDir` a value. Each platform folder needs only its own variable.
- A missing or failing browser path rejects with the path in the message. The page checker no longer waits for a DevTools port that never opens.
- An SVG drawing with no drawn child, or with only zero-size children, fails the drawing check.
- Node 22 runs the worker path of the built package: `test/node/worker.node.mjs`, run by `bun run test:node` and by the CI smoke job. Bun does not enforce the heap limit, so the heap limit holds only under Node.
- The SVG comparison and the config loader have mutation-audit tests. Each test kills a mutant that the earlier tests let through.
- The page checker stops the launched browser before it removes the profile. A Windows run no longer waits for a locked profile and loses its result.
- The page checker treats a locked DevTools port file as "not yet" and polls again.

### Added

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
