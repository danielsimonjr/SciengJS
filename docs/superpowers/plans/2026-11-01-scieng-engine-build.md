# Plan: build sciengjs and move scieng-mcp onto it

**Design:** [`../specs/2026-11-01-scieng-engine-design.md`](../specs/2026-11-01-scieng-engine-design.md)

## How to read this plan

The build is a sequence of increments. Each increment ships alone. Each increment has one scope, one gate and one release. An increment starts only after the release of each increment that it depends on. Four trial builds come first. Their measured numbers decide whether the design of the tex, mesh, graph and browser stages holds. A fifth trial, T5, measures the TeX build of the engine before the tex stage starts.

Two repositories take part:

- `danielsimonjr/sciengjs`: the engine, published as `@danielsimonjr/sciengjs`.
- `danielsimonjr/scieng-mcp`: the adapter, published as `@danielsimonjr/scieng-mcp` and installed as a plugin.

An increment marked **A** changes the adapter. Every other increment changes the engine.

## Roles

| Role | Who | Owns |
|---|---|---|
| Lead (coordinator and planner) | the session lead | the brief of each increment, the plan changes, the review decisions, the merge, the tag, the npm publish, the adapter deploy |
| Executor | a subagent (relay execution phase) | the code, the tests and the docs of one increment, on its own branch, in its own worktree; commit and push |
| Reviewer | a fresh subagent (relay review phase) | an independent review of the actual diff and the gate evidence |
| Junior helper | a local model on the model host, else Haiku | the STE first pass over new prose; the first-pass code against a failing test |

The executor does not merge, tag, release or publish. The reviewer does not review its own work. The reviewer receives no executor context except the brief, the diff and the evidence.

## The process of one increment

Each increment runs the steps below in order. The skills named in brackets hold the full procedure.

1. **Brief** (relay, spawning-agents). The lead writes the brief: the outcome, the inputs, the constraints, the acceptance gate and the return format. The brief carries the dispatch contract of spawning-agents, from explicit ownership to the survival protocol.
2. **Route** (relay). The lead announces the route before each delegation: the phase, the model, the model tier, the effort and the reason. The saved relay map sets the models:

   | Phase | Model | Effort |
   |---|---|---|
   | Planning | opus | high |
   | Execution | haiku | max |
   | Review | sonnet | xhigh |

   Each relay run classifies the tier of each model from current evidence (relay `MODEL_SELECTION.md`). The route table of each increment shows the tier of each model. The table names each phase whose model is below the tier that the rules ask for. The review phase needs a frontier model by those rules; the saved map can set a lower one. The lead promotes the executor to a stronger model when a gate failure shows a capability gap. The lead returns to planning when the evidence breaks the plan.
3. **Baseline** (spawning-agents). The lead takes the sweep baseline before the dispatch.
4. **Execute** (dev-workflow, junior-helper). The executor runs all the dev-workflow steps, from the plan to the push. The tests come first: RED, then GREEN. For a code first pass, the executor writes the failing test first. Then the executor gives the test to a junior helper (junior-helper task 2). The executor accepts the output only when the full suite and the typecheck pass. A line-by-line review must also find no defect.
5. **Junior STE pass** (junior-helper task 1). The executor runs `junior-ste.ts review` over the diff of the new prose. The executor decides each finding and records `junior chain run: yes, N of M accepted (<model>)`, or the reason for no run.
6. **Review** (relay review phase). A fresh reviewer receives the brief, the diff and the gate output. Each finding is fixed and checked again, or rejected with evidence.
7. **Sweep** (spawning-agents). After the final return of each agent, the lead runs the sweep against its baseline. The increment is not done until `Clean=True`, or until the lead records the reason for an override.
8. **Verify** (rfl, honesty). The lead checks each load-bearing claim of the report by a second method. Examples: CI by the head SHA, and the test counts from the test summary.
9. **Release.** The lead merges and tags. The release machine publishes the engine with `npm publish`. CI holds no publish job. Then the lead checks the registry with `npm view @danielsimonjr/sciengjs version` and a clean install. An **A** increment deploys the plugin with the release steps in the `AGENTS.md` of scieng-mcp and checks the plugin cache file by file.

### Gates common to every increment

- The typecheck passes. The full test suite passes under Bun on Windows, Linux and macOS.
- The smoke test of the built package passes under Node 22 on the same three systems.
- `repo-tools check` and `repo-tools docs check` pass. `repo-tools ste` passes on every changed document.
- The CHANGELOG has an entry. The repository `todo.md` has the five-axis line.
- A new parser or a new numeric routine has a mutation audit with a baseline. The report counts only mutants that a test assertion killed.
- No `Bun.` call exists in `src/`.

## Increments

### I0: skeleton

- **Scope:**
  - The repository, the package and the subpath export map.
  - The configuration loader, `RenderError` and `capabilities`.
  - The worker runner with its time and heap limits, and the stage registry.
  - `THIRD_PARTY_NOTICES.md` and the architecture docs skeleton.
  - The CI matrix: Bun tests on three systems, and the Node 22 smoke test on three systems.
  - The SVG comparison harness and the page checker.
- **Gate:** a stub backend renders through the worker. A source that loops rejects with `E_TIMEOUT` inside the limit plus one second. The loader rejects an unreadable configuration file with `E_CONFIG`. The page checker fails its deliberate-defect page. CI passes on all six jobs.
- **Release:** no npm publish. The first publish is I1.

### T1 to T5: trial builds

Each trial build is a short branch that answers one question with numbers. Its report gives the numbers, the commands and the platform. A trial that fails its question returns the plan to planning for that stage.

| Trial | Question | Exit numbers |
|---|---|---|
| T1 graph | Does `@viz-js/viz` render DOT under Bun and under Node 22, on three systems? | first-render time, warm-render time, package size, one SVG compared with the Graphviz CLI output of the same source |
| T2 mesh | Does `occt-import-js` read a STEP, an IGES and a BREP sample under Bun and Node 22? | load time of the WASM, read time of each sample, triangle count, peak heap |
| T3 tex | Can the TikZJax toolchain build a format with `tikz` and `circuitikz`, run it outside a browser, and give SVG with glyph paths? | format size compressed, first-render time, warm-render time of one `circuitikz` circuit, render time of one `pgfplots` plot with its bundle, SVG glyph check, the exact TeX engine of the toolchain, the licence of each toolchain part and of the font set |
| T5 tex build | Does the engine compiler build `tex.web` to WASM that passes the trip test? Can that build make the format and render one `circuitikz` circuit under Bun and Node 22, with each glyph as a `<path>`? | the trip test result (the differences from the reference logs), the size of the compiler in lines, the WASM size, the format build time, the format size compressed, the first-render and warm-render time of the circuit, the glyph check, the licence of each build input and of each bundle |
| T4 browser | Does the protocol client start the configured browser under Node 22 and Bun, render a PNG and a PDF, and block the network? | start time, PNG time, PDF time, the count of refused requests on the test page (expected 2) |

### I1: graph stage and the DOT backend

- **Scope:**
  - `./graph`, `./raster`.
  - `dot` to svg and png.
- **Gate:** the DOT corpus matches its expected SVG files. An `image` attribute gives a warning and no reference. `allowNetwork: none` holds.
- **Expected files:** `@viz-js/viz` at the pinned version makes the expected SVG files. The Graphviz CLI does not, because its layout differs (see `docs/analysis/t1-graph.md`).
- **Image check:** the backend removes each `image` attribute before the render. A render with a declared image size keeps the `href` as text, so a check of the warning alone is not sufficient. The gate also checks that the SVG holds no `href` to the image file.
- **Graph size:** each corpus graph renders well inside the default timeout on every system. A test with a large graph sets its own timeout. The API documents the graph size that the default timeout covers.
- **Release:** sciengjs 0.1.0.

### I2 (A): scieng-mcp on the engine, DOT first

- **Scope:**
  - The dependency on `@danielsimonjr/sciengjs`.
  - `render_dot` renders locally.
  - Quickchart.io leaves the adapter.
  - `bundle/assets/` and the asset lookup through `import.meta.url`.
  - The bundle comparison step in CI.
  - The `capabilities` tool.
- **Gate:**
  - The existing adapter tests pass.
  - The `/scieng-mcp:dot` command renders from the deployed plugin cache with the network off.
  - The bundle comparison passes.
- **Release:** scieng-mcp minor version; marketplace entry; deploy check.

### I3: Mermaid native layouts

- **Scope:**
  - The parsers of `classDiagram`, `stateDiagram-v2` and `sequenceDiagram`.
  - Class and state through DOT.
  - The sequence layout.
- **Gate:**
  - A test per grammar rule and per rejection.
  - The Mermaid corpus matches its expected SVG files.
  - A person approved each expected file once.
  - A mutation audit of each parser.
- **Release:** sciengjs 0.2.0.

### I4: browser stage, Mermaid fallback, HTML to PNG and PDF

- **Scope:**
  - `./browser`.
  - The pinned Mermaid build in the package.
  - `mermaid` (other types) to svg, png, pdf.
  - `html` to png and pdf.
  - `pdf` for every backend that has svg.
- **Gate:**
  - The T4 network test passes in CI on three systems.
  - On Linux, the renders pass in a network namespace with only loopback. A negative render without the forced flags fails to load an external image and an external script.
  - On each system, a sample of the browser process tree finds no socket to an address that is not loopback.
  - On each system, no browser process carries `--no-sandbox`.
  - A screenshot of 4000 by 3000 device pixels arrives whole under Bun and under Node 22.
  - A flowchart and a gantt chart render.
  - A missing browser path rejects with `E_STAGE_MISSING` and `capabilities` reports it.
  - A `render_html` page with each block type renders under the request block, and each block draws.
- **Release:** sciengjs 0.3.0.

### I5 (A): Mermaid and pages on the engine

- **Scope:**
  - `render_mermaid` renders locally.
  - Mermaid.ink leaves the adapter.
  - `render_html` writes `data-scieng-source` on each block.
  - The WaveDrom panel contrast.
  - The `render` tool.
- **Gate:**
  - Adapter tests.
  - `/scieng-mcp:mermaid` from the plugin cache with the network off.
  - A `render_html` page keeps every source in its attributes.
- **Release:** scieng-mcp minor version; deploy check.

### I6: math stage

- **Scope:**
  - `./math`.
  - `math` to svg, png, pdf.
  - `mhchem`.
- **Gate:**
  - The math corpus.
  - A `\ce{}` sample.
  - The output SVG has no font reference.
- **Release:** sciengjs 0.4.0. Then **A**: `render_latex` renders locally; latex.codecogs.com leaves the adapter.

### I7: plot

- **Scope:**
  - `./plot`.
  - The Plotly JSON subset reader.
  - The plotter (linear and log axes, the tick algorithm, subplots, shapes, legends, text marks).
  - The helpers `bode`, `step`, `impulse`, `nyquist`, `poleZero`, `rootLocus` with their key numbers.
  - `html` output with Plotly.
- **Gate:**
  - Every accepted key has a test, and a key outside the subset rejects with its path.
  - Each helper matches a second method on three reference transfer functions (for example the gain margin from the closed form at the phase crossover).
  - The corpus matches its expected SVG files.
  - A mutation audit of the tick algorithm and of each helper.
- **Release:** sciengjs 0.5.0. Then **A**: the `plot` block and the `/scieng-mcp:plot` command can write a static SVG.

### I8: HTML to Markdown

- **Scope:**
  - `./html`.
  - GitHub Flavored Markdown output.
  - The `data-scieng-source` round trip.
  - MathML annotation to TeX.
  - Inline SVG to assets.
  - `downloadImages`.
  - `browser: true`.
- **Gate:**
  - A corpus of HTML pages with expected Markdown.
  - Every page that `render_html` writes converts back to its exact sources.
  - A page with a script-built body converts only with `browser: true`.
- **Release:** sciengjs 0.6.0. Then **A**: the `html_to_markdown` tool and the `markdown` command.

### I9: mesh stage for STEP, IGES and BREP

- **Scope:**
  - `./mesh`.
  - The readers.
  - The glTF writer.
  - The Three.js viewer page with orbit, section planes and an exploded view.
  - Png through the browser stage.
- **Gate:**
  - The samples of T2 give a valid `glb` (checked by a second reader).
  - The viewer page passes the page checker.
  - The PNG is not empty.
  - Face colors carry into the materials. The reader returns them on `brep_faces[].color`, and the mesh color is null (see `docs/analysis/t2-mesh.md`).
  - A STEP part of 1.8 MB or more renders well inside the default timeout on every system. A test with a larger part sets its own timeout.
- **Release:** sciengjs 0.7.0. Then **A**: the `step` command.

### I10: CAD

- **Scope:**
  - The CSG document reader.
  - The TypeScript builder API.
  - The solid operations through `manifold-3d`.
  - `stl` output.
  - The node and facet limits.
- **Gate:**
  - A test per node type.
  - A document over the node limit rejects with `E_LIMIT`.
  - The builder and a hand-written document give the same mesh.
  - Volume checks against closed forms for primitives and one boolean.
- **Release:** sciengjs 0.8.0. Then **A**: the `cad` command.

### I11: SysML

- **Scope:**
  - `./sysml`.
  - The textual subset parser.
  - The block definition, internal block and requirements views.
- **Gate:**
  - A test per grammar rule and per rejection.
  - The corpus matches expected SVG files that a person approved.
  - A mutation audit of the parser.
- **Release:** sciengjs 0.9.0. Then **A**: the `sysml` command.

### I12: tex stage and TikZ

- **Scope:**
  - `./tex`.
  - The engine compiler and the change files from T5.
  - The format and the extra bundles from T5.
  - The bundle manager with pinned hashes.
  - Package detection.
  - The DVI to SVG converter.
  - The release assets of the bundles.
- **Gate:**
  - A hash mismatch deletes the file and rejects with `E_INTEGRITY`.
  - `\write18` and a file read outside the virtual tree fail.
  - A `circuitikz` circuit, a `tikz-cd` diagram and a `chemfig` molecule match their expected SVG files.
  - Each glyph of each expected SVG file is a `<path>`.
  - The trip test passes in CI on each WASM build.
  - A source that loads a package with the GPL as its only licence rejects with `E_UNSUPPORTED`. The message names the replacement.
  - The render times stay inside the T5 numbers plus a stated margin.
- **Release:** sciengjs 0.10.0. Then **A**: the `tikz` command; the `circuit` command gains a TikZ route.

### I13 (A): adapter completion

- **Scope:**
  - The skill and the commands name the local renderers only.
  - No remote service remains in the adapter.
  - The skill references describe the engine.
  - The plugin README.
- **Gate:**
  - A search of the adapter source and plugin for the three remote host names finds none.
  - Every tool call of every command completes from the plugin cache with the network off.
- **Release:** sciengjs 1.0.0 and scieng-mcp major version, when every increment gate holds.

## Parallel work

Increments with disjoint scope can run at the same time, each in its own worktree, with one writing agent per worktree. After I4: I6, I7 and I8 are independent. After I9: I10 and I11 are independent. T5 depends only on T3. I12 depends only on T5 and I0, and can start after T5. The lead runs the sweep after each agent, one agent at a time, because the baseline compares machine-wide state.

## Risks and the trial that measures each

| Risk | Measured by | Consequence of a failure |
|---|---|---|
| The TeX format with the full package set is too large or too slow in WASM | T3, T5 | Split the bundles further, or limit the package set. The plan changes at I12. |
| The AMS Type 1 fonts and Latin Modern do not cover a glyph that a bundle uses | T5 | add a font under the OFL or the GFL, or remove the package from its bundle |
| The engine compiler does not accept the Pascal of `tex.web`, or the build fails the trip test | T5 | Correct the compiler. I12 waits for a build that passes the trip test. |
| `occt-import-js` is too slow or too large under Node | T2 | limit the mesh stage to STEP, or change the reader |
| A large STEP part reads slowly: a 1.8 MB part takes about 1 s for each read, and parts over 1.8 MB are not measured | T2 | measure a larger part in I9, set the default timeout from that number, and document the part size that it covers |
| The browser client behaves differently per system | T4 and the I4 CI matrix | per-system fixes in the client, never a hard-coded path |
| A workhorse executor cannot meet a gate | the gate of each increment | promote the executor, recorded in the route table |
| Layout time grows fast with graph size: a 200-node graph takes 13 s to 42 s for each warm render | T1 | keep corpus graphs small, give large-graph tests their own timeout, and document the size that the default timeout covers |
