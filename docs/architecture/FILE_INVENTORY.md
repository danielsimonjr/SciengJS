<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Complete File Inventory

This report lists each source file that the map census finds, with a disposition. The census reads the files that git tracks. Outside a git work tree, it walks the folder. The census skips tool state, dependency folders and build output (for example `.git/`, `node_modules/`, `dist/` and `target/`), and `obj/` and `bin/` for C#.

**Language**: typescript

**Total files**: 283

## Disposition counts

| Disposition | Count | Meaning |
| --- | --: | --- |
| `reachable` | 0 | A `src`-area file that an entry root reaches. |
| `build-entry` | 101 | A `src`-area file that is an entry root. |
| `test-only` | 0 | A `src`-area file that only a test reaches. |
| `orphan` | 8 | A `src`-area file that nothing reaches. Delete it, or wire it to a root. |
| `test` | 139 | A file in a `test/` or `tests/` folder, or a `*.test.ts` or `*.spec.ts` file. |
| `tool` | 35 | A file in a `tools/` or `scripts/` folder outside `src/`. |
| `config` | 0 | A `*.config.*` file of TypeScript or JavaScript. |
| `example` | 0 | A file in `examples/` or `docs/`. |
| `bench` | 0 | A file in `bench/` or `benchmarks/`, or a `*.bench.*` file. |
| **Total** | **283** | |

## Per-area counts

| Area | Files |
| --- | --: |
| `src` | 109 |
| `tests` | 139 |
| `tools` | 35 |

## Per-package counts

| Package | Files |
| --- | --: |
| `(root)` | 181 |
| `@danielsimonjr/sciengjs` | 102 |

## All files

| File | Package | Area | Disposition | Lines |
| --- | --- | --- | --- | --: |
| `scripts/mermaid-licenses.mjs` | (root) | tools | tool | 41 |
| `scripts/prepare-build.mjs` | (root) | tools | tool | 107 |
| `src/assets.ts` | @danielsimonjr/sciengjs | src | build-entry | 88 |
| `src/browser/backend-pdf.ts` | @danielsimonjr/sciengjs | src | build-entry | 16 |
| `src/browser/backend-png.ts` | @danielsimonjr/sciengjs | src | build-entry | 19 |
| `src/browser/cdp.ts` | @danielsimonjr/sciengjs | src | build-entry | 215 |
| `src/browser/flags.ts` | @danielsimonjr/sciengjs | src | build-entry | 38 |
| `src/browser/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 5 |
| `src/browser/input.ts` | @danielsimonjr/sciengjs | src | build-entry | 109 |
| `src/browser/page.ts` | @danielsimonjr/sciengjs | src | build-entry | 70 |
| `src/browser/pinned.ts` | @danielsimonjr/sciengjs | src | build-entry | 63 |
| `src/browser/profile.ts` | @danielsimonjr/sciengjs | src | build-entry | 35 |
| `src/browser/proxy.ts` | @danielsimonjr/sciengjs | src | build-entry | 77 |
| `src/browser/render.ts` | @danielsimonjr/sciengjs | src | build-entry | 537 |
| `src/config.ts` | @danielsimonjr/sciengjs | src | build-entry | 251 |
| `src/core.ts` | @danielsimonjr/sciengjs | src | build-entry | 126 |
| `src/errors.ts` | @danielsimonjr/sciengjs | src | build-entry | 58 |
| `src/graph/backend-pdf.ts` | @danielsimonjr/sciengjs | src | build-entry | 16 |
| `src/graph/backend-png.ts` | @danielsimonjr/sciengjs | src | build-entry | 81 |
| `src/graph/backend-svg.ts` | @danielsimonjr/sciengjs | src | build-entry | 14 |
| `src/graph/dot.ts` | @danielsimonjr/sciengjs | src | build-entry | 66 |
| `src/graph/image.ts` | @danielsimonjr/sciengjs | src | build-entry | 330 |
| `src/graph/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 3 |
| `src/graph/text.ts` | @danielsimonjr/sciengjs | src | build-entry | 27 |
| `src/html/backend-md.ts` | @danielsimonjr/sciengjs | src | build-entry | 55 |
| `src/html/convert.ts` | @danielsimonjr/sciengjs | src | build-entry | 513 |
| `src/html/fetch-image.ts` | @danielsimonjr/sciengjs | src | build-entry | 189 |
| `src/html/images.ts` | @danielsimonjr/sciengjs | src | build-entry | 62 |
| `src/html/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 2 |
| `src/html/md.ts` | @danielsimonjr/sciengjs | src | build-entry | 89 |
| `src/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 29 |
| `src/math/backend-pdf.ts` | @danielsimonjr/sciengjs | src | build-entry | 15 |
| `src/math/backend-png.ts` | @danielsimonjr/sciengjs | src | build-entry | 16 |
| `src/math/backend-svg.ts` | @danielsimonjr/sciengjs | src | build-entry | 13 |
| `src/math/font-ranges.ts` | @danielsimonjr/sciengjs | src | build-entry | 108 |
| `src/math/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 3 |
| `src/math/tex.ts` | @danielsimonjr/sciengjs | src | build-entry | 144 |
| `src/mermaid/backend-pdf.ts` | @danielsimonjr/sciengjs | src | build-entry | 21 |
| `src/mermaid/backend-png.ts` | @danielsimonjr/sciengjs | src | build-entry | 28 |
| `src/mermaid/backend-svg.ts` | @danielsimonjr/sciengjs | src | build-entry | 20 |
| `src/mermaid/browser.ts` | @danielsimonjr/sciengjs | src | build-entry | 75 |
| `src/mermaid/class.ts` | @danielsimonjr/sciengjs | src | build-entry | 247 |
| `src/mermaid/common.ts` | @danielsimonjr/sciengjs | src | build-entry | 158 |
| `src/mermaid/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 29 |
| `src/mermaid/render.ts` | @danielsimonjr/sciengjs | src | build-entry | 30 |
| `src/mermaid/sequence-layout.ts` | @danielsimonjr/sciengjs | src | build-entry | 324 |
| `src/mermaid/sequence.ts` | @danielsimonjr/sciengjs | src | build-entry | 276 |
| `src/mermaid/state.ts` | @danielsimonjr/sciengjs | src | build-entry | 178 |
| `src/mesh/backend-glb.ts` | @danielsimonjr/sciengjs | src | build-entry | 114 |
| `src/mesh/backend-html.ts` | @danielsimonjr/sciengjs | src | build-entry | 13 |
| `src/mesh/backend-png.ts` | @danielsimonjr/sciengjs | src | build-entry | 37 |
| `src/mesh/backend-stl.ts` | @danielsimonjr/sciengjs | src | build-entry | 20 |
| `src/mesh/cad-build.ts` | @danielsimonjr/sciengjs | src | build-entry | 262 |
| `src/mesh/cad-builder.ts` | @danielsimonjr/sciengjs | src | build-entry | 126 |
| `src/mesh/cad-document.ts` | @danielsimonjr/sciengjs | src | build-entry | 462 |
| `src/mesh/glb.ts` | @danielsimonjr/sciengjs | src | build-entry | 185 |
| `src/mesh/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 11 |
| `src/mesh/occt-import-js.d.ts` | @danielsimonjr/sciengjs | src | orphan | 9 |
| `src/mesh/pinned-three.ts` | @danielsimonjr/sciengjs | src | build-entry | 22 |
| `src/mesh/read.ts` | @danielsimonjr/sciengjs | src | build-entry | 107 |
| `src/mesh/stl.ts` | @danielsimonjr/sciengjs | src | build-entry | 54 |
| `src/mesh/viewer-script.ts` | @danielsimonjr/sciengjs | src | build-entry | 206 |
| `src/mesh/viewer.ts` | @danielsimonjr/sciengjs | src | build-entry | 52 |
| `src/pairs.ts` | @danielsimonjr/sciengjs | src | build-entry | 57 |
| `src/plot/backend-html.ts` | @danielsimonjr/sciengjs | src | build-entry | 14 |
| `src/plot/backend-png.ts` | @danielsimonjr/sciengjs | src | build-entry | 13 |
| `src/plot/backend-svg.ts` | @danielsimonjr/sciengjs | src | build-entry | 22 |
| `src/plot/control.ts` | @danielsimonjr/sciengjs | src | build-entry | 938 |
| `src/plot/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 6 |
| `src/plot/plotter.ts` | @danielsimonjr/sciengjs | src | build-entry | 563 |
| `src/plot/reader.ts` | @danielsimonjr/sciengjs | src | build-entry | 282 |
| `src/plot/ticks.ts` | @danielsimonjr/sciengjs | src | build-entry | 76 |
| `src/raster/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 102 |
| `src/raster/warnings.ts` | @danielsimonjr/sciengjs | src | build-entry | 181 |
| `src/registry.ts` | @danielsimonjr/sciengjs | src | build-entry | 83 |
| `src/sysml/backend-pdf.ts` | @danielsimonjr/sciengjs | src | build-entry | 12 |
| `src/sysml/backend-png.ts` | @danielsimonjr/sciengjs | src | build-entry | 19 |
| `src/sysml/backend-svg.ts` | @danielsimonjr/sciengjs | src | build-entry | 9 |
| `src/sysml/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 22 |
| `src/sysml/parse.ts` | @danielsimonjr/sciengjs | src | build-entry | 599 |
| `src/sysml/render.ts` | @danielsimonjr/sciengjs | src | build-entry | 17 |
| `src/sysml/tokens.ts` | @danielsimonjr/sciengjs | src | build-entry | 105 |
| `src/sysml/views.ts` | @danielsimonjr/sciengjs | src | build-entry | 155 |
| `src/tex/backend-pdf.ts` | @danielsimonjr/sciengjs | src | build-entry | 11 |
| `src/tex/backend-png.ts` | @danielsimonjr/sciengjs | src | build-entry | 19 |
| `src/tex/backend-svg.ts` | @danielsimonjr/sciengjs | src | build-entry | 9 |
| `src/tex/bundles.ts` | @danielsimonjr/sciengjs | src | build-entry | 204 |
| `src/tex/detect.ts` | @danielsimonjr/sciengjs | src | build-entry | 263 |
| `src/tex/dvi.ts` | @danielsimonjr/sciengjs | src | build-entry | 319 |
| `src/tex/host.ts` | @danielsimonjr/sciengjs | src | build-entry | 338 |
| `src/tex/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 16 |
| `src/tex/render.ts` | @danielsimonjr/sciengjs | src | build-entry | 132 |
| `src/tex/run.ts` | @danielsimonjr/sciengjs | src | build-entry | 93 |
| `src/tex/specials.ts` | @danielsimonjr/sciengjs | src | build-entry | 166 |
| `src/tex/stage.ts` | @danielsimonjr/sciengjs | src | build-entry | 120 |
| `src/tex/tfm.ts` | @danielsimonjr/sciengjs | src | build-entry | 38 |
| `src/tex/type1.ts` | @danielsimonjr/sciengjs | src | build-entry | 401 |
| `src/tex/vfs.ts` | @danielsimonjr/sciengjs | src | build-entry | 88 |
| `src/tex/wasm.ts` | @danielsimonjr/sciengjs | src | build-entry | 26 |
| `src/types.ts` | @danielsimonjr/sciengjs | src | build-entry | 71 |
| `src/version.ts` | @danielsimonjr/sciengjs | src | build-entry | 2 |
| `src/worker/entry.ts` | @danielsimonjr/sciengjs | src | build-entry | 31 |
| `src/worker/protocol.ts` | @danielsimonjr/sciengjs | src | build-entry | 60 |
| `src/worker/run.ts` | @danielsimonjr/sciengjs | src | build-entry | 183 |
| `test/corpus/regenerate-dot.ts` | (root) | tests | test | 24 |
| `test/corpus/regenerate-mermaid.ts` | (root) | tests | test | 63 |
| `test/corpus/regenerate-sysml.ts` | (root) | tests | test | 64 |
| `test/corpus/regenerate-tikz.ts` | (root) | tests | test | 67 |
| `test/integration/browser-render.test.ts` | (root) | tests | test | 170 |
| `test/integration/mermaid-browser-capture.test.ts` | (root) | tests | test | 111 |
| `test/integration/mermaid-browser.test.ts` | (root) | tests | test | 85 |
| `test/integration/mesh-viewer.test.ts` | (root) | tests | test | 162 |
| `test/integration/page-checker.test.ts` | (root) | tests | test | 124 |
| `test/integration/tex-render.test.ts` | (root) | tests | test | 61 |
| `test/integration/tikz-corpus.test.ts` | (root) | tests | test | 65 |
| `test/integration/tikz-render.test.ts` | (root) | tests | test | 35 |
| `test/mutation/run-mutants.mjs` | (root) | tests | test | 254 |
| `test/mutation/run-mutants.test.ts` | (root) | tests | test | 309 |
| `test/node/backends/heap.mjs` | (root) | tests | test | 5 |
| `test/node/backends/loop.mjs` | (root) | tests | test | 6 |
| `test/node/backends/ok.mjs` | (root) | tests | test | 4 |
| `test/node/backends/tex-source.mjs` | (root) | tests | test | 35 |
| `test/node/browser-gates.mjs` | (root) | tests | test | 153 |
| `test/node/browser-probe.mjs` | (root) | tests | test | 204 |
| `test/node/browser-probe.node.mjs` | (root) | tests | test | 73 |
| `test/node/eval-render.node.mjs` | (root) | tests | test | 17 |
| `test/node/fixtures/render-under-node-test.fixture.mjs` | (root) | tests | test | 10 |
| `test/node/math.node.mjs` | (root) | tests | test | 32 |
| `test/node/mesh.node.mjs` | (root) | tests | test | 36 |
| `test/node/tex-render-time.mjs` | (root) | tests | test | 86 |
| `test/node/tex-timeout.node.mjs` | (root) | tests | test | 48 |
| `test/node/worker-execargv.node.mjs` | (root) | tests | test | 33 |
| `test/node/worker.node.mjs` | (root) | tests | test | 45 |
| `test/smoke/smoke.mjs` | (root) | tests | test | 204 |
| `test/support/assets-fixture.ts` | (root) | tests | test | 100 |
| `test/support/bun-scan.ts` | (root) | tests | test | 62 |
| `test/support/glb-reader.ts` | (root) | tests | test | 171 |
| `test/support/network-guard.ts` | (root) | tests | test | 44 |
| `test/support/page-checker.ts` | (root) | tests | test | 414 |
| `test/support/png-decode.ts` | (root) | tests | test | 114 |
| `test/support/process-list.ts` | (root) | tests | test | 34 |
| `test/support/rejections.ts` | (root) | tests | test | 51 |
| `test/support/settings.ts` | (root) | tests | test | 24 |
| `test/support/stubs/stub-dot.ts` | (root) | tests | test | 26 |
| `test/support/stubs/stub-foreign-error.ts` | (root) | tests | test | 14 |
| `test/support/svg-compare.ts` | (root) | tests | test | 74 |
| `test/support/sysml-corpus.ts` | (root) | tests | test | 11 |
| `test/support/test-registry.ts` | (root) | tests | test | 33 |
| `test/support/tex-engine.ts` | (root) | tests | test | 56 |
| `test/support/tex-fixtures.ts` | (root) | tests | test | 216 |
| `test/support/tikz-corpus.ts` | (root) | tests | test | 39 |
| `test/support/xml-wellformed.ts` | (root) | tests | test | 45 |
| `test/tex-tools/etrip-gate.test.mjs` | (root) | tests | test | 149 |
| `test/tex-tools/primitives.test.mjs` | (root) | tests | test | 22 |
| `test/tex-tools/tangle.test.mjs` | (root) | tests | test | 21 |
| `test/tex-tools/trip-gate.test.mjs` | (root) | tests | test | 80 |
| `test/unit/assets.test.ts` | (root) | tests | test | 131 |
| `test/unit/browser-cdp.test.ts` | (root) | tests | test | 147 |
| `test/unit/browser-flags.test.ts` | (root) | tests | test | 32 |
| `test/unit/browser-input.test.ts` | (root) | tests | test | 109 |
| `test/unit/browser-kill-tree.test.ts` | (root) | tests | test | 28 |
| `test/unit/browser-page.test.ts` | (root) | tests | test | 46 |
| `test/unit/browser-pdf-pairs.test.ts` | (root) | tests | test | 33 |
| `test/unit/browser-pinned.test.ts` | (root) | tests | test | 66 |
| `test/unit/browser-proxy.test.ts` | (root) | tests | test | 51 |
| `test/unit/browser-stage.test.ts` | (root) | tests | test | 64 |
| `test/unit/cad-build.test.ts` | (root) | tests | test | 252 |
| `test/unit/cad-document.test.ts` | (root) | tests | test | 163 |
| `test/unit/config-assets.test.ts` | (root) | tests | test | 111 |
| `test/unit/config.test.ts` | (root) | tests | test | 273 |
| `test/unit/errors.test.ts` | (root) | tests | test | 69 |
| `test/unit/glb-writer.test.ts` | (root) | tests | test | 246 |
| `test/unit/graph-corpus.test.ts` | (root) | tests | test | 47 |
| `test/unit/graph-dot.test.ts` | (root) | tests | test | 79 |
| `test/unit/graph-image.test.ts` | (root) | tests | test | 203 |
| `test/unit/graph-large.test.ts` | (root) | tests | test | 27 |
| `test/unit/graph-network.test.ts` | (root) | tests | test | 100 |
| `test/unit/graph-png.test.ts` | (root) | tests | test | 224 |
| `test/unit/graph-registry.test.ts` | (root) | tests | test | 34 |
| `test/unit/graph-svg-backend.test.ts` | (root) | tests | test | 55 |
| `test/unit/html-convert-escape.test.ts` | (root) | tests | test | 189 |
| `test/unit/html-convert.test.ts` | (root) | tests | test | 153 |
| `test/unit/html-fetch-image.test.ts` | (root) | tests | test | 153 |
| `test/unit/html-md-render.test.ts` | (root) | tests | test | 124 |
| `test/unit/index-exports.test.ts` | (root) | tests | test | 9 |
| `test/unit/math-backends.test.ts` | (root) | tests | test | 131 |
| `test/unit/math-registry.test.ts` | (root) | tests | test | 34 |
| `test/unit/math-svg.test.ts` | (root) | tests | test | 134 |
| `test/unit/mermaid-browser-route.test.ts` | (root) | tests | test | 22 |
| `test/unit/mermaid-class.test.ts` | (root) | tests | test | 268 |
| `test/unit/mermaid-common.test.ts` | (root) | tests | test | 120 |
| `test/unit/mermaid-corpus.test.ts` | (root) | tests | test | 48 |
| `test/unit/mermaid-network.test.ts` | (root) | tests | test | 33 |
| `test/unit/mermaid-registry.test.ts` | (root) | tests | test | 34 |
| `test/unit/mermaid-render.test.ts` | (root) | tests | test | 134 |
| `test/unit/mermaid-route-lenient.test.ts` | (root) | tests | test | 56 |
| `test/unit/mermaid-routing-scan.test.ts` | (root) | tests | test | 49 |
| `test/unit/mermaid-routing.test.ts` | (root) | tests | test | 44 |
| `test/unit/mermaid-sequence.test.ts` | (root) | tests | test | 467 |
| `test/unit/mermaid-state.test.ts` | (root) | tests | test | 220 |
| `test/unit/mermaid-xml.test.ts` | (root) | tests | test | 191 |
| `test/unit/mesh-glb.test.ts` | (root) | tests | test | 111 |
| `test/unit/mesh-large.test.ts` | (root) | tests | test | 53 |
| `test/unit/mesh-limit.test.ts` | (root) | tests | test | 50 |
| `test/unit/mesh-viewer.test.ts` | (root) | tests | test | 131 |
| `test/unit/no-bun-api.test.ts` | (root) | tests | test | 39 |
| `test/unit/no-sandbox-flag.test.ts` | (root) | tests | test | 35 |
| `test/unit/page-checker-io.test.ts` | (root) | tests | test | 148 |
| `test/unit/plot-control.test.ts` | (root) | tests | test | 361 |
| `test/unit/plot-corpus.test.ts` | (root) | tests | test | 32 |
| `test/unit/plot-html.test.ts` | (root) | tests | test | 87 |
| `test/unit/plot-reader.test.ts` | (root) | tests | test | 208 |
| `test/unit/plot-registry.test.ts` | (root) | tests | test | 63 |
| `test/unit/plot-svg.test.ts` | (root) | tests | test | 553 |
| `test/unit/plot-ticks.test.ts` | (root) | tests | test | 93 |
| `test/unit/process-list.test.ts` | (root) | tests | test | 51 |
| `test/unit/raster-init.test.ts` | (root) | tests | test | 41 |
| `test/unit/raster-warnings.test.ts` | (root) | tests | test | 153 |
| `test/unit/raster.test.ts` | (root) | tests | test | 118 |
| `test/unit/readme-mermaid.test.ts` | (root) | tests | test | 21 |
| `test/unit/render.test.ts` | (root) | tests | test | 174 |
| `test/unit/svg-compare.test.ts` | (root) | tests | test | 74 |
| `test/unit/sysml-backends.test.ts` | (root) | tests | test | 51 |
| `test/unit/sysml-corpus.test.ts` | (root) | tests | test | 69 |
| `test/unit/sysml-parse.test.ts` | (root) | tests | test | 288 |
| `test/unit/sysml-views.test.ts` | (root) | tests | test | 169 |
| `test/unit/teardown.test.ts` | (root) | tests | test | 33 |
| `test/unit/tex-bundles.test.ts` | (root) | tests | test | 177 |
| `test/unit/tex-core-preload.test.ts` | (root) | tests | test | 76 |
| `test/unit/tex-detect.test.ts` | (root) | tests | test | 309 |
| `test/unit/tex-dvi.test.ts` | (root) | tests | test | 229 |
| `test/unit/tex-host-names.test.ts` | (root) | tests | test | 28 |
| `test/unit/tex-limits.test.ts` | (root) | tests | test | 100 |
| `test/unit/tex-specials.test.ts` | (root) | tests | test | 128 |
| `test/unit/tex-tfm.test.ts` | (root) | tests | test | 55 |
| `test/unit/tex-type1.test.ts` | (root) | tests | test | 273 |
| `test/unit/tex-vfs.test.ts` | (root) | tests | test | 127 |
| `test/unit/tex-wiring.test.ts` | (root) | tests | test | 62 |
| `test/unit/third-party-notices.test.ts` | (root) | tests | test | 21 |
| `test/unit/three-pinned.test.ts` | (root) | tests | test | 60 |
| `test/unit/version.test.ts` | (root) | tests | test | 23 |
| `test/unit/worker-exec-argv.test.ts` | (root) | tests | test | 115 |
| `test/unit/worker-run.test.ts` | (root) | tests | test | 97 |
| `tools/tex/add-bundle-package.mjs` | (root) | tools | tool | 39 |
| `tools/tex/build-lib.mjs` | (root) | tools | tool | 71 |
| `tools/tex/build.mjs` | (root) | tools | tool | 88 |
| `tools/tex/bundle-tree.mjs` | (root) | tools | tool | 27 |
| `tools/tex/bundles.mjs` | (root) | tools | tool | 121 |
| `tools/tex/check-bundles.mjs` | (root) | tools | tool | 24 |
| `tools/tex/check-format.mjs` | (root) | tools | tool | 19 |
| `tools/tex/compare-builds.mjs` | (root) | tools | tool | 13 |
| `tools/tex/compile-cli.mjs` | (root) | tools | tool | 18 |
| `tools/tex/etrip-gate.mjs` | (root) | tools | tool | 409 |
| `tools/tex/etrip.mjs` | (root) | tools | tool | 86 |
| `tools/tex/linediff.mjs` | (root) | tools | tool | 53 |
| `tools/tex/pascal.mjs` | (root) | tools | tool | 1402 |
| `tools/tex/primitives.mjs` | (root) | tools | tool | 33 |
| `tools/tex/record-bundle-files.ts` | (root) | tools | tool | 41 |
| `tools/tex/render.mjs` | (root) | tools | tool | 84 |
| `tools/tex/run-texware.mjs` | (root) | tools | tool | 29 |
| `tools/tex/set-bundle-includes.mjs` | (root) | tools | tool | 47 |
| `tools/tex/sizes.mjs` | (root) | tools | tool | 12 |
| `tools/tex/tangle-cli.mjs` | (root) | tools | tool | 18 |
| `tools/tex/tangle.mjs` | (root) | tools | tool | 531 |
| `tools/tex/tex-run.mjs` | (root) | tools | tool | 36 |
| `tools/tex/tree.mjs` | (root) | tools | tool | 46 |
| `tools/tex/trip-gate.mjs` | (root) | tools | tool | 65 |
| `tools/tex/trip-steps.mjs` | (root) | tools | tool | 49 |
| `tools/tex/trip.mjs` | (root) | tools | tool | 93 |
| `tools/tex/wasm.mjs` | (root) | tools | tool | 177 |
| `trials/t1-graph/compare-layout.mjs` | (root) | src | orphan | 74 |
| `trials/t1-graph/make-sources.mjs` | (root) | src | orphan | 19 |
| `trials/t1-graph/measure.mjs` | (root) | src | orphan | 129 |
| `trials/t2-mesh/measure.mjs` | (root) | src | orphan | 178 |
| `trials/t3-tex/shim/index.cjs` | (root) | src | orphan | 87 |
| `trials/t3-tex/tools/build-format.cjs` | (root) | tools | tool | 53 |
| `trials/t3-tex/tools/collect.mjs` | (root) | tools | tool | 22 |
| `trials/t3-tex/tools/make-bundle.mjs` | (root) | tools | tool | 31 |
| `trials/t3-tex/tools/measure.mjs` | (root) | tools | tool | 154 |
| `trials/t3-tex/tools/sizes.mjs` | (root) | tools | tool | 17 |
| `trials/t3-tex/tools/tex-engine.mjs` | (root) | tools | tool | 62 |
| `trials/t4-browser/assets/pinned.js` | (root) | src | orphan | 8 |
| `trials/t4-browser/measure.mjs` | (root) | src | orphan | 912 |

## Skipped links

Links (symbolic links and junctions) that the census did not follow. A link can point to another repository, so no file behind a link is in this inventory or in the graph.

_None._

## Warnings

_None._
