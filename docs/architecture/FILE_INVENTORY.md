<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Complete File Inventory

This report lists each source file that the map census finds, with a disposition. The census reads the files that git tracks. Outside a git work tree, it walks the folder. The census skips tool state, dependency folders and build output (for example `.git/`, `node_modules/`, `dist/` and `target/`), and `obj/` and `bin/` for C#.

**Language**: typescript

**Total files**: 161

## Disposition counts

| Disposition | Count | Meaning |
| --- | --: | --- |
| `reachable` | 0 | A `src`-area file that an entry root reaches. |
| `build-entry` | 42 | A `src`-area file that is an entry root. |
| `test-only` | 3 | A `src`-area file that only a test reaches. |
| `orphan` | 11 | A `src`-area file that nothing reaches. Delete it, or wire it to a root. |
| `test` | 77 | A file in a `test/` or `tests/` folder, or a `*.test.ts` or `*.spec.ts` file. |
| `tool` | 28 | A file in a `tools/` or `scripts/` folder outside `src/`. |
| `config` | 0 | A `*.config.*` file of TypeScript or JavaScript. |
| `example` | 0 | A file in `examples/` or `docs/`. |
| `bench` | 0 | A file in `bench/` or `benchmarks/`, or a `*.bench.*` file. |
| **Total** | **161** | |

## Per-area counts

| Area | Files |
| --- | --: |
| `src` | 56 |
| `tests` | 77 |
| `tools` | 28 |

## Per-package counts

| Package | Files |
| --- | --: |
| `(root)` | 119 |
| `@danielsimonjr/sciengjs` | 42 |

## All files

| File | Package | Area | Disposition | Lines |
| --- | --- | --- | --- | --: |
| `scripts/mermaid-licenses.mjs` | (root) | tools | tool | 41 |
| `scripts/prepare-build.mjs` | (root) | tools | tool | 91 |
| `src/assets.ts` | @danielsimonjr/sciengjs | src | build-entry | 88 |
| `src/browser/backend-pdf.ts` | @danielsimonjr/sciengjs | src | build-entry | 16 |
| `src/browser/backend-png.ts` | @danielsimonjr/sciengjs | src | build-entry | 19 |
| `src/browser/cdp.ts` | @danielsimonjr/sciengjs | src | build-entry | 215 |
| `src/browser/flags.ts` | @danielsimonjr/sciengjs | src | build-entry | 38 |
| `src/browser/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 5 |
| `src/browser/input.ts` | @danielsimonjr/sciengjs | src | build-entry | 109 |
| `src/browser/page.ts` | @danielsimonjr/sciengjs | src | build-entry | 41 |
| `src/browser/pinned.ts` | @danielsimonjr/sciengjs | src | build-entry | 20 |
| `src/browser/profile.ts` | @danielsimonjr/sciengjs | src | build-entry | 35 |
| `src/browser/proxy.ts` | @danielsimonjr/sciengjs | src | build-entry | 74 |
| `src/browser/render.ts` | @danielsimonjr/sciengjs | src | build-entry | 509 |
| `src/config.ts` | @danielsimonjr/sciengjs | src | build-entry | 225 |
| `src/core.ts` | @danielsimonjr/sciengjs | src | build-entry | 111 |
| `src/errors.ts` | @danielsimonjr/sciengjs | src | build-entry | 53 |
| `src/graph/backend-pdf.ts` | @danielsimonjr/sciengjs | src | build-entry | 15 |
| `src/graph/backend-png.ts` | @danielsimonjr/sciengjs | src | build-entry | 80 |
| `src/graph/backend-svg.ts` | @danielsimonjr/sciengjs | src | build-entry | 13 |
| `src/graph/dot.ts` | @danielsimonjr/sciengjs | src | build-entry | 71 |
| `src/graph/image.ts` | @danielsimonjr/sciengjs | src | build-entry | 330 |
| `src/graph/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 3 |
| `src/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 28 |
| `src/mermaid/backend-pdf.ts` | @danielsimonjr/sciengjs | src | build-entry | 20 |
| `src/mermaid/backend-png.ts` | @danielsimonjr/sciengjs | src | build-entry | 27 |
| `src/mermaid/backend-svg.ts` | @danielsimonjr/sciengjs | src | build-entry | 19 |
| `src/mermaid/browser.ts` | @danielsimonjr/sciengjs | src | build-entry | 75 |
| `src/mermaid/class.ts` | @danielsimonjr/sciengjs | src | build-entry | 253 |
| `src/mermaid/common.ts` | @danielsimonjr/sciengjs | src | build-entry | 178 |
| `src/mermaid/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 29 |
| `src/mermaid/render.ts` | @danielsimonjr/sciengjs | src | build-entry | 30 |
| `src/mermaid/sequence-layout.ts` | @danielsimonjr/sciengjs | src | build-entry | 324 |
| `src/mermaid/sequence.ts` | @danielsimonjr/sciengjs | src | build-entry | 275 |
| `src/mermaid/state.ts` | @danielsimonjr/sciengjs | src | build-entry | 176 |
| `src/pairs.ts` | @danielsimonjr/sciengjs | src | build-entry | 57 |
| `src/raster/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 102 |
| `src/raster/warnings.ts` | @danielsimonjr/sciengjs | src | build-entry | 181 |
| `src/registry.ts` | @danielsimonjr/sciengjs | src | build-entry | 36 |
| `src/types.ts` | @danielsimonjr/sciengjs | src | build-entry | 71 |
| `src/version.ts` | @danielsimonjr/sciengjs | src | build-entry | 2 |
| `src/worker/entry.ts` | @danielsimonjr/sciengjs | src | build-entry | 31 |
| `src/worker/protocol.ts` | @danielsimonjr/sciengjs | src | build-entry | 41 |
| `src/worker/run.ts` | @danielsimonjr/sciengjs | src | build-entry | 117 |
| `test/corpus/regenerate-dot.ts` | (root) | tests | test | 24 |
| `test/corpus/regenerate-mermaid.ts` | (root) | tests | test | 63 |
| `test/integration/browser-render.test.ts` | (root) | tests | test | 170 |
| `test/integration/mermaid-browser-capture.test.ts` | (root) | tests | test | 111 |
| `test/integration/mermaid-browser.test.ts` | (root) | tests | test | 85 |
| `test/integration/page-checker.test.ts` | (root) | tests | test | 124 |
| `test/mutation/run-mutants.mjs` | (root) | tests | test | 250 |
| `test/mutation/run-mutants.test.ts` | (root) | tests | test | 292 |
| `test/node/backends/heap.mjs` | (root) | tests | test | 5 |
| `test/node/backends/loop.mjs` | (root) | tests | test | 6 |
| `test/node/backends/ok.mjs` | (root) | tests | test | 4 |
| `test/node/worker.node.mjs` | (root) | tests | test | 45 |
| `test/smoke/smoke.mjs` | (root) | tests | test | 153 |
| `test/support/assets-fixture.ts` | (root) | tests | test | 87 |
| `test/support/bun-scan.ts` | (root) | tests | test | 62 |
| `test/support/network-guard.ts` | (root) | tests | test | 44 |
| `test/support/page-checker.ts` | (root) | tests | test | 386 |
| `test/support/png-decode.ts` | (root) | tests | test | 105 |
| `test/support/process-list.ts` | (root) | tests | test | 34 |
| `test/support/rejections.ts` | (root) | tests | test | 51 |
| `test/support/stubs/stub-dot.ts` | (root) | tests | test | 22 |
| `test/support/stubs/stub-foreign-error.ts` | (root) | tests | test | 14 |
| `test/support/svg-compare.ts` | (root) | tests | test | 74 |
| `test/support/test-registry.ts` | (root) | tests | test | 33 |
| `test/unit/assets.test.ts` | (root) | tests | test | 131 |
| `test/unit/browser-cdp.test.ts` | (root) | tests | test | 147 |
| `test/unit/browser-flags.test.ts` | (root) | tests | test | 32 |
| `test/unit/browser-input.test.ts` | (root) | tests | test | 109 |
| `test/unit/browser-page.test.ts` | (root) | tests | test | 46 |
| `test/unit/browser-pdf-pairs.test.ts` | (root) | tests | test | 33 |
| `test/unit/browser-pinned.test.ts` | (root) | tests | test | 66 |
| `test/unit/browser-proxy.test.ts` | (root) | tests | test | 51 |
| `test/unit/browser-stage.test.ts` | (root) | tests | test | 63 |
| `test/unit/config-assets.test.ts` | (root) | tests | test | 111 |
| `test/unit/config.test.ts` | (root) | tests | test | 253 |
| `test/unit/errors.test.ts` | (root) | tests | test | 69 |
| `test/unit/graph-corpus.test.ts` | (root) | tests | test | 47 |
| `test/unit/graph-dot.test.ts` | (root) | tests | test | 79 |
| `test/unit/graph-image.test.ts` | (root) | tests | test | 203 |
| `test/unit/graph-large.test.ts` | (root) | tests | test | 27 |
| `test/unit/graph-network.test.ts` | (root) | tests | test | 100 |
| `test/unit/graph-png.test.ts` | (root) | tests | test | 223 |
| `test/unit/graph-registry.test.ts` | (root) | tests | test | 34 |
| `test/unit/graph-svg-backend.test.ts` | (root) | tests | test | 54 |
| `test/unit/mermaid-browser-route.test.ts` | (root) | tests | test | 22 |
| `test/unit/mermaid-class.test.ts` | (root) | tests | test | 279 |
| `test/unit/mermaid-common.test.ts` | (root) | tests | test | 131 |
| `test/unit/mermaid-corpus.test.ts` | (root) | tests | test | 48 |
| `test/unit/mermaid-network.test.ts` | (root) | tests | test | 33 |
| `test/unit/mermaid-registry.test.ts` | (root) | tests | test | 34 |
| `test/unit/mermaid-render.test.ts` | (root) | tests | test | 134 |
| `test/unit/mermaid-route-lenient.test.ts` | (root) | tests | test | 56 |
| `test/unit/mermaid-routing-scan.test.ts` | (root) | tests | test | 49 |
| `test/unit/mermaid-routing.test.ts` | (root) | tests | test | 44 |
| `test/unit/mermaid-sequence.test.ts` | (root) | tests | test | 467 |
| `test/unit/mermaid-state.test.ts` | (root) | tests | test | 220 |
| `test/unit/mermaid-xml.test.ts` | (root) | tests | test | 190 |
| `test/unit/no-bun-api.test.ts` | (root) | tests | test | 39 |
| `test/unit/no-sandbox-flag.test.ts` | (root) | tests | test | 35 |
| `test/unit/page-checker-io.test.ts` | (root) | tests | test | 148 |
| `test/unit/process-list.test.ts` | (root) | tests | test | 51 |
| `test/unit/raster-init.test.ts` | (root) | tests | test | 41 |
| `test/unit/raster-warnings.test.ts` | (root) | tests | test | 153 |
| `test/unit/raster.test.ts` | (root) | tests | test | 118 |
| `test/unit/readme-mermaid.test.ts` | (root) | tests | test | 21 |
| `test/unit/render.test.ts` | (root) | tests | test | 174 |
| `test/unit/svg-compare.test.ts` | (root) | tests | test | 74 |
| `test/unit/teardown.test.ts` | (root) | tests | test | 33 |
| `test/unit/third-party-notices.test.ts` | (root) | tests | test | 21 |
| `test/unit/version.test.ts` | (root) | tests | test | 23 |
| `test/unit/worker-run.test.ts` | (root) | tests | test | 97 |
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
| `trials/t5-tex-build/runtime/dvi2svg.mjs` | (root) | src | orphan | 133 |
| `trials/t5-tex-build/runtime/host.mjs` | (root) | src | orphan | 212 |
| `trials/t5-tex-build/runtime/run.mjs` | (root) | src | orphan | 41 |
| `trials/t5-tex-build/runtime/tfm.mjs` | (root) | src | test-only | 23 |
| `trials/t5-tex-build/runtime/type1.mjs` | (root) | src | test-only | 236 |
| `trials/t5-tex-build/runtime/vfs.mjs` | (root) | src | orphan | 46 |
| `trials/t5-tex-build/test/tangle.test.mjs` | (root) | tests | test | 21 |
| `trials/t5-tex-build/test/trip-gate.test.mjs` | (root) | tests | test | 80 |
| `trials/t5-tex-build/test/type1.test.mjs` | (root) | tests | test | 43 |
| `trials/t5-tex-build/tools/build-lib.mjs` | (root) | tools | tool | 71 |
| `trials/t5-tex-build/tools/build.mjs` | (root) | tools | tool | 37 |
| `trials/t5-tex-build/tools/compare-builds.mjs` | (root) | tools | tool | 13 |
| `trials/t5-tex-build/tools/compile-cli.mjs` | (root) | tools | tool | 18 |
| `trials/t5-tex-build/tools/linediff.mjs` | (root) | tools | tool | 53 |
| `trials/t5-tex-build/tools/pascal.mjs` | (root) | tools | tool | 1402 |
| `trials/t5-tex-build/tools/render.mjs` | (root) | tools | tool | 88 |
| `trials/t5-tex-build/tools/run-texware.mjs` | (root) | tools | tool | 32 |
| `trials/t5-tex-build/tools/sizes.mjs` | (root) | tools | tool | 12 |
| `trials/t5-tex-build/tools/tangle-cli.mjs` | (root) | tools | tool | 18 |
| `trials/t5-tex-build/tools/tangle.mjs` | (root) | tools | tool | 531 |
| `trials/t5-tex-build/tools/tex-run.mjs` | (root) | tools | tool | 38 |
| `trials/t5-tex-build/tools/trip-gate.mjs` | (root) | tools | tool | 65 |
| `trials/t5-tex-build/tools/trip-steps.mjs` | (root) | tools | tool | 55 |
| `trials/t5-tex-build/tools/trip.mjs` | (root) | tools | tool | 90 |
| `trials/t5-tex-build/tools/wasm.mjs` | (root) | tools | tool | 177 |
| `trials/t6-etex-build/runtime/dvisvgm-specials.mjs` | (root) | src | test-only | 160 |
| `trials/t6-etex-build/test/dvisvgm-specials.test.mjs` | (root) | tests | test | 52 |
| `trials/t6-etex-build/test/etrip-gate.test.mjs` | (root) | tests | test | 149 |
| `trials/t6-etex-build/test/primitives.test.mjs` | (root) | tests | test | 22 |
| `trials/t6-etex-build/tools/build.mjs` | (root) | tools | tool | 76 |
| `trials/t6-etex-build/tools/etrip-gate.mjs` | (root) | tools | tool | 409 |
| `trials/t6-etex-build/tools/etrip.mjs` | (root) | tools | tool | 85 |
| `trials/t6-etex-build/tools/primitives.mjs` | (root) | tools | tool | 33 |

## Skipped links

Links (symbolic links and junctions) that the census did not follow. A link can point to another repository, so no file behind a link is in this inventory or in the graph.

_None._

## Warnings

_None._
