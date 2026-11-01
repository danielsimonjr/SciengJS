<!-- repo-map:no-verification -->
# sciengjs data flow

## A render

1. The caller calls `render(req, config?)` from `src/index.ts`.
2. `render` calls `renderWithRegistry` in `src/core.ts` with the built-in registry.
3. `loadConfig` in `src/config.ts` resolves the configuration. The order is: call option, environment, file, default.
4. The request checks run in this order:
   1. The input type is known. Otherwise the render rejects with `E_INPUT`.
   2. The output format is known. Otherwise the render rejects with `E_INPUT`.
   3. The pair is in the table. Otherwise the render rejects with `E_UNSUPPORTED`.
   4. The source kind matches the input type. Otherwise the render rejects with `E_INPUT`.
   5. The source size is within `maxSourceBytes`. Otherwise the render rejects with `E_LIMIT`.
   6. The registry has a backend for the pair. Otherwise the render rejects with `E_UNSUPPORTED`.
   7. The browser path exists when the stage needs a browser. Otherwise the render rejects with `E_STAGE_MISSING`.
5. `runInWorker` in `src/worker/run.ts` starts a worker. The worker runs `src/worker/entry.ts`.
6. The entry imports the backend module that the registry names. It calls `render` on that module and posts one message.
7. The main thread settles on the first of: the message, a worker error, a worker exit, or the time limit. It then terminates the worker.
8. `renderWithRegistry` returns the bytes, the MIME type, the backend name and the warnings.

## Errors

A backend throws a `RenderError` to report a code. Any other error becomes `E_INTERNAL` with its message.

## Capabilities

`capabilities(config?)` loads the configuration. It lists each pair of the table. A pair is ready when the registry has its backend. A browser pair is also ready only when `browser` is set.
