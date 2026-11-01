<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Complete File Inventory

This report lists each source file that the map census finds, with a disposition. The census reads the files that git tracks. Outside a git work tree, it walks the folder. The census skips tool state, dependency folders and build output (for example `.git/`, `node_modules/`, `dist/` and `target/`), and `obj/` and `bin/` for C#.

**Language**: typescript

**Total files**: 32

## Disposition counts

| Disposition | Count | Meaning |
| --- | --: | --- |
| `reachable` | 0 | A `src`-area file that an entry root reaches. |
| `build-entry` | 20 | A `src`-area file that is an entry root. |
| `test-only` | 0 | A `src`-area file that only a test reaches. |
| `orphan` | 0 | A `src`-area file that nothing reaches. Delete it, or wire it to a root. |
| `test` | 12 | A file in a `test/` or `tests/` folder, or a `*.test.ts` or `*.spec.ts` file. |
| `tool` | 0 | A file in a `tools/` or `scripts/` folder outside `src/`. |
| `config` | 0 | A `*.config.*` file of TypeScript or JavaScript. |
| `example` | 0 | A file in `examples/` or `docs/`. |
| `bench` | 0 | A file in `bench/` or `benchmarks/`, or a `*.bench.*` file. |
| **Total** | **32** | |

## Per-area counts

| Area | Files |
| --- | --: |
| `src` | 20 |
| `tests` | 12 |

## Per-package counts

| Package | Files |
| --- | --: |
| `(root)` | 12 |
| `@danielsimonjr/sciengjs` | 20 |

## All files

| File | Package | Area | Disposition | Lines |
| --- | --- | --- | --- | --: |
| `src/browser/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 2 |
| `src/config.ts` | @danielsimonjr/sciengjs | src | build-entry | 223 |
| `src/core.ts` | @danielsimonjr/sciengjs | src | build-entry | 103 |
| `src/errors.ts` | @danielsimonjr/sciengjs | src | build-entry | 37 |
| `src/graph/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 2 |
| `src/html/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 2 |
| `src/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 28 |
| `src/math/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 2 |
| `src/mermaid/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 2 |
| `src/mesh/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 2 |
| `src/pairs.ts` | @danielsimonjr/sciengjs | src | build-entry | 52 |
| `src/plot/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 2 |
| `src/raster/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 2 |
| `src/registry.ts` | @danielsimonjr/sciengjs | src | build-entry | 18 |
| `src/sysml/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 2 |
| `src/tex/index.ts` | @danielsimonjr/sciengjs | src | build-entry | 2 |
| `src/types.ts` | @danielsimonjr/sciengjs | src | build-entry | 69 |
| `src/worker/entry.ts` | @danielsimonjr/sciengjs | src | build-entry | 31 |
| `src/worker/protocol.ts` | @danielsimonjr/sciengjs | src | build-entry | 24 |
| `src/worker/run.ts` | @danielsimonjr/sciengjs | src | build-entry | 66 |
| `test/integration/page-checker.test.ts` | (root) | tests | test | 44 |
| `test/smoke/smoke.mjs` | (root) | tests | test | 56 |
| `test/support/bun-scan.ts` | (root) | tests | test | 62 |
| `test/support/page-checker.ts` | (root) | tests | test | 250 |
| `test/support/stubs/stub-dot.ts` | (root) | tests | test | 19 |
| `test/support/svg-compare.ts` | (root) | tests | test | 74 |
| `test/support/test-registry.ts` | (root) | tests | test | 26 |
| `test/unit/config.test.ts` | (root) | tests | test | 188 |
| `test/unit/errors.test.ts` | (root) | tests | test | 34 |
| `test/unit/no-bun-api.test.ts` | (root) | tests | test | 39 |
| `test/unit/render.test.ts` | (root) | tests | test | 150 |
| `test/unit/svg-compare.test.ts` | (root) | tests | test | 63 |

## Skipped links

Links (symbolic links and junctions) that the census did not follow. A link can point to another repository, so no file behind a link is in this inventory or in the graph.

_None._

## Warnings

_None._
