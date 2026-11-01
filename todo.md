# TODO

- Build the engine. Follow the increments of `docs/superpowers/plans/2026-11-01-scieng-engine-build.md`. The first item is the trial builds.
- 2026-11-01 five-axis (docs-only change: the design and the build plan): speed, stability, reliability, security and maintainability apply from increment I0.
- Increment I0 fills the empty folders: the ten documents of `docs/architecture/`, `THIRD_PARTY_NOTICES.md`, and the commands in `AGENTS.md` and `CONTRIBUTING.md`.
- 2026-11-01 five-axis (docs-only change: the repository layout and the context files): the five axes apply from increment I0.
- 2026-11-01 five-axis (increment I0, code and CI): speed: the worker render path and the page checker are measured; Bun 1.4.4 ignores the worker heap limit, Node 26 enforces it. stability: the page checker closes the browser over DevTools and waits for the port to stop; no test reads the user configuration. reliability: the CI smoke test packs and installs the tarball. security: pinned action SHAs, read-only token, no publish job. maintainability: one default per configuration key. Left for later: typed options per input type (I1), the browser stage (I4), a real render in the smoke test (I1).
