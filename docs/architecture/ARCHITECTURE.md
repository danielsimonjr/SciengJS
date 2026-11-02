<!-- repo-map:no-verification -->
# sciengjs architecture

## System context

The engine is a library. A host process imports it and calls `render` or `capabilities`. The adapter `scieng-mcp` is a separate repository. It wraps the engine as tools for an agent harness. The engine knows nothing about that adapter.

The engine reads three external inputs:

- the configuration file, at the platform config folder or at the path that `SCIENG_CONFIG` names;
- the environment variables with the `SCIENG_` prefix;
- the call options of each request.

The engine writes no file on its own. A later stage writes a cache, for example the TeX bundles, to `cacheDir`.

## Architecture principles

1. **Local.** No render sends a source to a web service. A network request needs `allowNetwork` in the configuration.
2. **Few dependencies.** The engine writes its own parsers, layouts and clients. It borrows an engine only when that engine is a large body of work.
3. **One input, one output.** A backend is a pure function of its source and options.
4. **Configurable.** A path, a URL, a limit and a timeout come from the configuration. Each default is set in one place: `src/config.ts`.
5. **Untrusted input.** A backend treats every source as written by an unknown author. No backend runs code from a source.
6. **Node is the release runtime. Bun is the development runtime.** The source uses only APIs that Node and Bun provide. A test rejects the `Bun` global in `src/`.

## Key decisions

### A render runs in a worker

Each render starts a `worker_threads` worker with one job. The main thread holds the timer. A render that passes its time limit ends its worker and rejects with `E_TIMEOUT`. A worker that exits before it returns rejects with `E_INTERNAL`. The next render starts a new worker, so a crash does not affect the next render.

The heap limit comes from `maxMemoryMb`. Node enforces it, and Node is the release runtime. Bun 1.4.4 accepts the option and does not enforce it. The heap limit therefore holds only under Node. The Bun suite checks the time limit and the crash only. The Node test `test/node/worker.node.mjs` checks the heap limit against the built package.

### The registry is data

The registry maps `type:format` to a backend module URL. The worker imports that module. The public `render` uses the built-in registry. The tests pass their own registry through `renderWithRegistry`. The public surface does not change.

In increment I0 the built-in registry is empty. A pair that is in the table but has no backend rejects with `E_UNSUPPORTED`.

### Configuration failures stop the render

An unreadable file, an invalid file, an unknown key and an invalid value reject with `E_CONFIG`. The loader does not fall back to the defaults for a source that the loader could not read. A missing file is an error only when `SCIENG_CONFIG` names it. At the default path, a missing file is not an error.

### Browser closing is by protocol

Chrome can relaunch itself when the session is elevated. The process that the checker starts is not the browser. The page checker therefore asks the browser to close over the DevTools protocol. It then waits until the DevTools port stops answering. A hard kill is not used. A hard kill orphans the browser helper processes and holds the profile folder.

## Quality attributes

| Attribute | Measure |
|---|---|
| Speed | A worker render with a 500 ms limit ends at 739 ms under Node 26. |
| Stability | No test reads the user configuration. The page checker tests skip only when no browser is named. CI never skips them. |
| Reliability | The CI smoke test packs the package. The CI smoke test installs the tarball in a fresh folder. The CI smoke test imports the tarball under Node 22. |
| Security | Pinned action SHAs. A read-only token. No job publishes a package. |
| Maintainability | One default per configuration key. One table of supported pairs. |

## Open decisions

- The per-type render options are an open bag in increment I0. Each increment types its own keys.
- The browser stage, the mesh stage and the TeX stage need their trial results before their designs are final.
