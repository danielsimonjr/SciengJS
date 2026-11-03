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
   5. The source size is within `maxSourceBytes`. Otherwise the render rejects with `E_LIMIT`. Heap exhaustion of the render worker also rejects with `E_LIMIT`.
   6. The registry has a backend for the pair. Otherwise the render rejects with `E_UNSUPPORTED`.
   7. The browser path exists when the stage needs a browser. Otherwise the render rejects with `E_STAGE_MISSING`.
5. `runInWorker` in `src/worker/run.ts` starts a worker. The worker runs `src/worker/entry.ts`.
6. The entry imports the backend module that the registry names. It calls `render` on that module and posts one message.
7. The main thread settles on the first of: the message, a worker error, a worker exit, or the time limit. It then terminates the worker.
8. `renderWithRegistry` returns the bytes, the MIME type, the backend name and the warnings.

## A DOT render to PNG

1. The registry names the backend `graph/viz+raster/resvg` for `dot` to `png`. The module is `src/graph/backend-png.ts`.
2. The backend checks the options. Only `scale` is allowed. The scale is a finite number above zero.
3. The backend reads the raster font. It reads the file named by `rasterFont`, or the bundled font. A file that cannot be read rejects the render. A file with no font signature also rejects the render.
4. `dotToSvg` in `src/graph/dot.ts` removes each `image` attribute and reports one warning for each. It renders the source with the viz library. It then removes each SVG image element of the output.
5. `svgToPng` in `src/raster/index.ts` loads resvg once for the process. It checks the pixel buffer against `maxMemoryMb` before it renders. It renders the SVG at the scale and returns the PNG bytes.

## A Mermaid render

1. The registry names the backend `mermaid/native` for `mermaid` to `svg`. The module is `src/mermaid/backend-svg.ts`. For `mermaid` to `png`, the registry names `mermaid/native+raster/resvg`. The module is `src/mermaid/backend-png.ts`.
2. `prepare` in `src/mermaid/common.ts` reads the front matter, the directives and the comment lines. It reads the header line. A type that the native layouts do not draw rejects with `E_UNSUPPORTED`. It reads the option `lenient`. Any other option rejects with `E_INPUT`.
3. A class diagram goes to `parseClassDiagram` and `classToDot`. A state diagram goes to `parseStateDiagram` and `stateToDot`. Each DOT source goes to `dotToSvg` in `src/graph/dot.ts`.
4. A sequence diagram goes to `parseSequenceDiagram`. `layoutSequence` in `src/mermaid/sequence-layout.ts` writes the SVG. The viz library does not run for a sequence diagram.
5. A line outside the grammar rejects the render with `E_INPUT` in strict mode. In lenient mode, the parser skips the line and adds one warning.
6. The PNG backend renders the SVG with `svgDocumentToPng` in `src/graph/backend-png.ts`. The PNG backend uses the same font rule as the DOT render.
7. The result holds the bytes and the warnings. The warnings are the parser warnings, then the DOT warnings.

## Errors

A backend throws a `RenderError` to report a code. Any other error becomes `E_INTERNAL` with its message.

## Capabilities

`capabilities(config?)` loads the configuration. It lists each pair of the table. A pair is ready when the registry has its backend. A browser pair is also ready only when `browser` is set.
