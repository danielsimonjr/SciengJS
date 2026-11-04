# Changelog

This file records all notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- The `./mesh` subpath reads STEP, IGES and BREP files through `occt-import-js` 0.0.23 (exact pin). The pairs `step`, `iges` and `brep` to `glb` render through `render()`. The option `linearUnit` takes `millimeter` (default) or `meter` for STEP and IGES. BREP takes no option. Each colour of a face becomes one material. Faces without a colour use a default grey material. The WASM module loads once per process.
- The package exports `readCad()` and `writeGlb()` from `./mesh`.
- A `glb` render rejects with `E_LIMIT` when its peak memory estimate is over `maxMemoryMb`. The estimate is the bytes of the positions, the normals and the indices, times four copies. Geometry over 4 GiB also rejects with `E_LIMIT`.
- `writeGlb()` leaves out a mesh without triangles, so the file holds no unused accessor. Input with no triangle at all rejects with `E_INPUT`.
- The material colours are linear, as glTF requires. `occt-import-js` already converts the sRGB colours of a STEP file to linear values, so the writer does no conversion. A test checks the linear values of the coloured STEP sample.
- The test reader of glb files checks more. It checks the chunk order, the JSON space padding and the BIN zero padding. It checks unit normals, one material per colour, the scene and the nodes. Each accessor, buffer view and material must be used.
- The mutation audit of the glb writer and the glb limit is in `test/mutation/mesh-glb-mutants.json`. An assertion kills all 46 non-equivalent mutants. Three mutants are equivalent.
- The smoke test renders a BREP sample to `glb` from the installed tarball under Node. `test:node` runs a mesh test against `dist/`.
- A test renders a STEP part of 1,793,282 bytes (`linkrods.step` of OpenCascade, LGPL-2.1) to `glb` inside the default timeout and checks its 8,772 triangles. The part is not in git. CI downloads it from the pinned URL in `test/corpus/mesh/large.json` and checks its SHA-256. Without the file, a local run skips the test and CI fails it.

### Fixed

- The browser test of html to md in `test/unit/html-md-render.test.ts` has a timeout of 30 s. A headless browser start on a CI runner can take more than the 5 s default of `bun test`.

## [0.6.0] - 2026-11-04

### Added

- The `html` to `md` pair renders through `render()`. The render returns the Markdown and the images in `assets`. The option `downloadImages: true` saves each image as `image-N.<ext>`. A remote image is fetched only when `allowNetwork` is `tex-bundles,images`. A data: image needs no network. The option `browser: true` reads the DOM after the page scripts run, through the browser stage.
- `capabilities()` reports `html` to `md` as ready in the `html` stage.
- A remote image download of html to md accepts http and https only. It follows a maximum of three redirects. Each hop must resolve to public addresses only. The connection uses only an address that passed the check, so a DNS answer that changes after the check is refused. The reply must have an `image/*` type. The new keys `imageTimeoutMs` (default 15000) and `maxImageBytes` (default 10485760) set the limits. A refused image keeps its URL and gives a warning.
- html to md escapes a block marker at a line start, `$` in text, and `&` before an entity form. It writes the blocks of a list item under the item. It escapes `|` in a table cell, also in a code span. It wraps a link destination that has a space or a parenthesis in `<...>`.
- The images and the SVGs of one page use one asset counter, so no two asset names are equal. Only an image that the Markdown shows is downloaded.
- The `render` result carries an `assets` list for extra files, for example images.

- The `./html` subpath converts HTML to GitHub Flavored Markdown with `htmlToMarkdown()`, through `parse5` 8.1.0. A `data-scieng-source` block becomes a fenced block of its exact source. MathML TeX becomes `$…$` or `$$…$$`. `convertHtml()` also returns the inline SVG assets, linked as `image-N.svg`, with the `assetPrefix` option.

### Fixed

- The browser gate `attribution-control` no longer races the process sampler. The child process stays alive until the gate stops it, and a 60 s deadline bounds the wait. Before, a slow first sample on a Windows runner let the child exit at its 15 s timer, so the gate failed with no fault in the engine.

## [0.5.1] - 2026-11-04

### Fixed

- A plot trace with no colour takes the default Plotly colorway entry of its trace index. Before, every such trace and its legend swatch used one blue, so the magnitude and the phase of `bode()` had the same colour.

## [0.5.0] - 2026-11-04

### Added

- The `plot` stage draws a chart from a JSON text with the keys `data` and `layout`, a subset of the Plotly figure format. It renders to `svg`, `png` and `html`. The `svg` and `png` outputs are built in and make no request. An unsupported key rejects with `E_INPUT` and its path. The option `lenient` skips the key and gives a warning.
- The `html` output draws the figure with Plotly 4.2.0, the pinned build. The page loads the build from a CDN with a subresource integrity hash. The package does not ship Plotly.
- The `./plot` subpath exports the control helpers `bode`, `step`, `impulse`, `nyquist`, `poleZero` and `rootLocus`. Each takes a transfer function `{ num, den }` and returns `{ figure, numbers }`. Each helper computes every point from the model.
- `THIRD_PARTY_NOTICES.md` lists the Plotly build (MIT).
- The plot reader rejects a top-level key other than `data` and `layout`. It rejects the axis names `xaxis1`, `xaxis0` and `xaxis01`, and an axis key outside the grid.
- The plot reader accepts a `tickformat` of `.Nf` only, with N from 0 to 20. It rejects a `dtick`, `width` or `height` of zero or less. The plotter errors name the full key path.
- One plot axis has 1000 ticks at most. A larger `dtick` count rejects with `E_INPUT`.
- A tick label with more than 20 decimals uses exponent form. A log axis with too many decades shows major ticks only.
- Text labels are not cut by the clip path of the traces. The `html` page has a title and a viewport meta element.
- `polynomialRoots` gives an exact root at 0 for each trailing zero coefficient, and rejects with `E_INPUT` when the roots do not converge. A repeated root, for example of `(s+1)^20`, is accepted when each residual is rounding error. A root at 0 does not set the frequency range of `bode` and `nyquist`.
- `step` measures the peak and the overshoot in the direction of the final value. It gives `null` for each number of a system that is not stable, and a `null` peak time for a response with no peak. `StepNumbers.peakTime` is `number | null`. The settling time is interpolated.
- `nyquist` refines the least distance to -1 by golden-section search.
- The control helpers reject with `E_INPUT` instead of returning a value that is not finite.
- The corpus files keep their bytes on every system (`test/corpus/** -text`).

## [0.4.0] - 2026-11-04

### Added

- The math stage renders LaTeX math to `svg`, `png` and `pdf`. The stage uses `@mathjax/src` 4.1.3 and writes a standalone SVG with the glyphs as paths. The SVG has no text element and no font reference. The `\ce{}` command works through the mhchem package of the build. The `png` takes the option `scale`, as the `dot` and Mermaid `png` do. The `pdf` needs a browser. Without one, it rejects with `E_STAGE_MISSING`.
- The `./math` subpath exports `mathToSvg`.
- The math stage rejects a TeX package that the build does not hold with `E_UNSUPPORTED`, and a TeX input error with `E_INPUT`. A `\require` of a held package has no effect.
- The math stage rejects a character that the math font does not hold with `E_UNSUPPORTED`, and names the character and its code point. Such a character no longer becomes system-font text.
- The mhchem arrows `<-`, `<->`, `<=>`, `<=>>`, `<<=>`, `<-->` and the labelled arrows such as `->[x]` draw as paths. Each one uses a standard arrow glyph of the bundled math font.
- A Node test renders math from the built package to `svg` and `png`. The README shows a math example.

### Fixed

- A `<`, `&` or `"` in the TeX source made the math SVG invalid XML, and the `png` rejected with `E_INPUT`. The math stage now writes the SVG with the XML serializer, which escapes the attribute values.
- The third-party notices list `commander` 14.0.3 (MIT) and `lru-cache` 11.5.3 (BlueOak-1.0.0), which `@mathjax/src` installs.

## [0.3.2] - 2026-11-03

### Fixed

- Fix `E_INTERNAL` render rejections under `node --test` and `node --input-type=module -e`. The render worker gets no `execArgv` key when no flag is removed. When a flag is removed, the worker gets the filtered `execArgv` list. If the Worker constructor throws `ERR_WORKER_INVALID_EXEC_ARGV`, the code constructs the worker again with an empty `execArgv`.

## [0.3.1] - 2026-11-03

### Fixed

- A render from `node --input-type=module -e` rejected with `E_INTERNAL`: the render worker inherited `--input-type` from the parent and could not load its entry. The worker now gets the parent's execArgv without the input and mode flags (`--input-type`, `-e`/`--eval`, `-p`/`--print`, `-i`, `-c`). Other flags, such as `--conditions` and `--enable-source-maps`, still pass to the worker.

## [0.3.0] - 2026-11-03

### Added

- Mermaid types other than class, state and sequence (for example flowchart and gantt) render through the browser stage, to svg, png and pdf. The pinned Mermaid 11.17.2 build ships in the package. The browser stage serves it to the page from the package bytes. Without a browser path these reject with `E_STAGE_MISSING`. Only a first word in the list of other Mermaid types routes to the browser stage. The router skips directives and front matter and never throws, so `lenient: true` still applies to the native types, and an unknown header rejects with `E_INPUT`.
- The engine holds the SHA-256 of the pinned Mermaid build. A copy with a different hash rejects with `E_INTEGRITY`. A page that cannot load the pinned build rejects with `E_INTERNAL`, not `E_INPUT`.
- A Mermaid `png` takes the option `scale` on both paths (above 0, not more than 8). The browser path sizes the page from the `viewBox` of the diagram, so a wide diagram is not clipped. The `svg` of the browser path has an explicit `width` and `height`.
- `capabilities` has an optional `note`. The Mermaid `svg` and `png` pairs note that types other than class, state and sequence need the browser stage.
- `THIRD_PARTY_NOTICES.md` lists the licences of the packages inside the pinned Mermaid build. `assets/licenses/mermaid-bundle.txt` holds their licence texts. `scripts/mermaid-licenses.mjs` writes that file.
- The formats `pdf` for `dot`, `mermaid`, `math`, `tikz`, `plot` and `sysml` list the browser stage. `dot` to `pdf` and `mermaid` to `pdf` are built in.
- The browser stage draws a page that reports its result: svg, png (a clip of the diagram) and pdf.
- The subpath `./browser`: a Chrome DevTools Protocol client over the built-in `WebSocket`, with no npm dependency. Each start uses a new temporary profile and runs headless. Each start uses the forced flags: a refusing proxy, the loopback bypass list, a DNS block and the WebRTC policy. Other flags stop the background requests of the browser. The client never passes `--no-sandbox`. The `Fetch` domain refuses each page request, except the page itself. The client attaches each frame in another process, each worker and each pop-up before it runs, and intercepts its requests. The load wait uses the loader of the navigation.
- The formats `html` to `png` (a screenshot of the page at a given width, height and device scale) and `html` to `pdf` (`Page.printToPDF`). Both need the browser stage. The browser path comes from `SCIENG_BROWSER` or the `browser` key. Without it, both reject with `E_STAGE_MISSING`, and `capabilities` reports them as not ready.
- The browser profile, the proxy and the browser process tree are removed before a render returns, on the success path and on each failure path. One deadline covers the cleanup. Each DevTools request has a deadline, so a page that does not stop rejects with `E_TIMEOUT`.
- The `html` to `png` options have limits: width and height to 16384, scale to 8, and 64 Mi device pixels. The warnings of refused requests stop at 50. Each URL is cut to 200 characters, and its control characters are escaped.

### Changed

- The browser gates run in CI on each system under Bun and under Node 22 (`test/node/browser-gates.mjs`). They sample the browser process tree during each render. They check that no socket leaves the host and that no process carries the sandbox-off flag. They also check a 4000 by 3000 screenshot. On Linux the gates run in a network namespace with only loopback, with a negative control. A positive control holds one loopback connection open, so the socket sampler must find it on each system. On macOS the sampler gives lsof one `-i` option, because `-a` ANDs two `-i` options and then lsof selects no socket. On Windows one PowerShell session takes all the samples, so at least 5 samples land during the large render.
- The refusing proxy of the browser stage handles socket errors. A reset from the browser no longer ends the process.
- The smoke test imports the `./browser` subpath. It no longer checks that the subpath is absent.
- The test page checker starts the browser with the forced flags of the browser stage and a refusing proxy. A test fails when a file in `src/` or `test/` names the flag that turns the sandbox off.

## [0.2.0] - 2026-11-03

### Added

- The `mermaid` input draws `classDiagram`, `stateDiagram-v2` and `sequenceDiagram` to SVG and PNG with no browser. A class diagram and a state diagram go through the graph stage. A sequence diagram has its own layout: one column for each participant and one row for each message.
- The option `lenient` for the `mermaid` input. A line outside the grammar rejects the render with `E_INPUT` and the line number. With `lenient: true`, the parser skips the line and the render gives one warning that names the line.
- The subpath `./mermaid`: the Mermaid parsers, the DOT builders, the sequence layout and the SVG render.
- The Mermaid corpus: nine sources and their expected SVG files. The approval manifest lists each expected file as approved by a maintainer.
- `assets/licenses/MIT-viz-js.txt`, the MIT licence text of the `@viz-js/viz` wrapper. The npm package of the wrapper does not ship this file. `THIRD_PARTY_NOTICES.md` names `assets/licenses/MIT-viz-js.txt`. `.gitattributes` stores the files of `assets/` without line-ending conversion.

### Changed

- The smoke test imports the `./mermaid` subpath and renders the three diagram types from the packed tarball. It checks that a flowchart rejects with `E_UNSUPPORTED`.
- The raster cap test uses one row of 1.5 billion pixels. The former square input drew a 1 GiB buffer without the cap, and the mutation audit timed out on that test.
- The README and the architecture documents describe the Mermaid stage and remove the increment-I0 and increment-I1 status claims.
- The mutation audit gives the full text of each mutant in its report. Each kill names its cause: an assertion, or an error that the code throws. The rejection helpers of the test suite fail as assertions. An assertion kills all 127 non-equivalent mutants.
- The Mermaid corpus test requires a maintainer approval for each expected SVG file. A maintainer records each approval in `test/corpus/mermaid/approval.json`. Nine expected SVG files await approval.

### Fixed

- The `mermaid` input replaces each character that XML 1.0 forbids with U+FFFD. The forbidden characters include a lone surrogate. Before this fix, the SVG kept the character, and the PNG render failed with `resvg cannot read the SVG`.
- The `mermaid` input warns once for each source line that holds a forbidden character.
- A class relation label accepts a colon with no space before it, as in `Driver --> Car: drives`.
- A sequence id accepts a hyphen between name parts, as in `User-1->>Web-2: hi`.
- The page checker starts the browser once before its timed checks. A first browser start on a fresh CI runner can exceed the 20 s start budget and fail a timed check. The warm-up has its own start budget of 60 s. The timed checks keep their 20 s budget.

## [0.1.1] - 2026-11-03

The asset root for bundled use. A bundle of the engine names the folder of its font and its WASM file.

### Added

- The configuration key `assetsUrl`, with the environment variable `SCIENG_ASSETS_URL`. The key names the folder URL that holds the `fonts` folder and the resvg WASM file `index_bg.wasm`. The default is the `assets/` folder of the package. A value without a trailing slash gets a trailing slash. A value that is not a `file:` URL rejects with `E_CONFIG`. A `file:` URL with a host other than `localhost` rejects with `E_CONFIG`. On Windows, such a URL names a network share. A value with a query, a fragment, or an encoded slash or backslash in its path rejects with `E_CONFIG`. A value that the operating system cannot open as a folder rejects the render with `E_CONFIG`. The configuration has nine keys.
- The build copies `index_bg.wasm` into `assets/`. The packed tarball ships the file. The smoke test checks that the shipped file equals the locked file. The smoke test renders a PNG from the packed package.

### Changed

- `scripts/prepare-build.mjs` writes the engine version to `src/version.ts` at build time. The loader reads no package file at run time, so a single-file bundle runs with no `node_modules` folder. A test checks the version against `package.json`.
- The PNG render reads the bundled font and the WASM file from `assetsUrl`. The raster function `svgToPng` takes an optional `assetsUrl`. The default is the `assets/` folder of the package.
- A WASM file that the runtime cannot compile, link or start rejects with `E_STAGE_MISSING`, and the message names `index_bg.wasm`.
- The build script runs `scripts/prepare-build.mjs` before `tsc`.
- Design, configuration: the design has the `assetsUrl` row. The adapter sets the key to `bundle/assets/`.

### Fixed

- A render error keeps its code in a bundled build. Each output file of a bundle holds its own copy of the error class. The worker checked the class, so an error from another copy reached the caller as `E_INTERNAL`. The worker now checks the name and the code. A missing font gives `E_STAGE_MISSING`, and a DOT syntax error gives `E_INPUT`.
- The smoke test starts npm with one quoted command on Windows, so Node prints no DEP0190 warning.
- The loader test compares the real path of the temporary folder. It passes on macOS, where that folder is a link.
- The generated file `src/version.ts` keeps LF line endings. The file `.gitattributes` sets `src/version.ts text eol=lf`. After `bun run build`, `git status` shows no change for the file. A clone made before this release keeps its CRLF copy. Run `git checkout -- src/version.ts` once in that clone.

## [0.1.0] - 2026-11-02

The first release on npm. The release renders Graphviz DOT to SVG and PNG.

### Removed

- The eight subpaths with no content (`./mermaid`, `./math`, `./tex`, `./plot`, `./sysml`, `./mesh`, `./browser`, `./html`). Each subpath returns with the increment that gives the subpath content. The smoke test checks that the package refuses each subpath.

### Changed

- README: the package page. The page gives the scope of the release, the install, the API with tested examples, the error codes, the configuration and the roadmap.
- Third-party notices: the TeX rows name the own WASM build of `tex.web` and refer to the design for the licence of each TeX input.
- Trial T6: the T5 compiler builds `tex.web` with `etex.ch` and five utility primitives (`\expanded`, `\filesize`, `\pdfstrcmp`, `\creationdate`, `\shellescape`). The build passes the e-TRIP gate. The build makes the LaTeX format in extended mode with the pgf driver `pgfsys-dvisvgm.def`. The build renders a `circuitikz` circuit with each glyph as a `<path>` under Bun and Node. Report: `docs/analysis/t6-etex-build.md`.
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
- Design, raster stage: the stage bundles a default font, so PNG text does not depend on the fonts of the host.

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
- Increment I1 (graph and raster): `render` of `dot` to `svg` and of `dot` to `png`. The DOT stage uses `@viz-js/viz` 3.31.0. The raster stage uses `@resvg/resvg-wasm` 2.6.2. The subpaths `./graph` and `./raster` export `dotToSvg` and `svgToPng`.
- The DOT stage removes each `image` attribute and each `stylesheet` attribute of a source and reports one warning for each. It also removes any `xml-stylesheet` instruction from the SVG. A key or value that the source builds with the DOT `+` operator is read as one string. The output holds no external reference except the hyperlink of a `URL` or `href` attribute, and the stage opens no network connection.
- The PNG option `scale` (default 1). A PNG over `maxMemoryMb`, or over 1024 MB, rejects with `E_LIMIT`. The 1024 MB bound comes from a measure: a render holds two copies of the pixel buffer, and the WASM memory ends at 4 GiB.
- The PNG render reports one warning for bold text, one for italic text and one for characters that the raster font cannot draw. The package bundles one face.
- The PNG render frees its resvg handle on every path, retries a failed WASM start, and reports an SVG that resvg cannot read as `E_INPUT`. A bundled font that is missing or invalid rejects with `E_STAGE_MISSING`. A TrueType collection as `rasterFont` rejects with `E_CONFIG`.
- A DOT source with 20000 image attributes takes 70 ms to scan. The scan counted lines from the start for each attribute and took 20 s.
- The scope table of the design lists `dot` to `png` under `graph` and `dot` to `pdf` under `browser`. One rule explains the stage column.
- The raster font: Liberation Serif Regular 2.1.5 under the SIL Open Font License 1.1, in `assets/fonts/`. The configuration key `rasterFont` (environment variable `SCIENG_RASTER_FONT`) replaces the font. The configuration now has eight keys.
- The DOT corpus: eight sources and their expected SVG files in `test/corpus/dot/`.
- The mutation audit of the scanner, the PNG budget, the character map reader and the raster font setting adds 20 mutants. The audit kills 40 of 40 non-equivalent mutants.
- Trial T4 round 3: the client never passes `--no-sandbox`. Renders run with the Chrome sandbox on, on three systems.
- Trial T4 (browser): the report `docs/analysis/t4-browser.md` and its sources in `trials/t4-browser/`. The protocol client starts Chrome under Bun 1.4.4 and Node 22 on three systems. It renders a PNG and a PDF, and it refuses the page's unlisted requests. A forced refusing proxy and an Ubuntu network namespace close the connection gap (finding F1).
- Trial T1 (graph): the report `docs/analysis/t1-graph.md` and its sources in `trials/t1-graph/`. `@viz-js/viz` 3.31.0 renders DOT under Bun 1.4.4 and Node 22 on three systems, with the same SVG bytes in all six jobs. The layout differs from the Graphviz CLI 2.43.0. In the six CI jobs, the 200-node trial graph takes 13 s to 42 s for each warm render.
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
