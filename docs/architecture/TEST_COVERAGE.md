<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Test Coverage Analysis

## Summary

| Metric | Count |
|--------|-------|
| Total Source Files | 40 |
| Total Test Files | 37 |
| Source Files with Tests | 22 |
| Source Files without Tests | 18 |
| Coverage (raw, direct-import) | **55.0%** |
---

## Source Files Without Test Coverage

The following 18 source files are not directly imported by any test file:

### graph/

- `src/graph/index.ts`

### root/

- `src/index.ts`
- `src/pairs.ts`

### mermaid/

- `src/mermaid/backend-png.ts`
- `src/mermaid/backend-svg.ts`
- `src/mermaid/index.ts`

### worker/

- `src/worker/entry.ts`

### t1-graph/

- `trials/t1-graph/compare-layout.mjs`
- `trials/t1-graph/make-sources.mjs`
- `trials/t1-graph/measure.mjs`

### t2-mesh/

- `trials/t2-mesh/measure.mjs`

### t3-tex/

- `trials/t3-tex/shim/index.cjs`

### t4-browser/

- `trials/t4-browser/assets/pinned.js`
- `trials/t4-browser/measure.mjs`

### t5-tex-build/

- `trials/t5-tex-build/runtime/dvi2svg.mjs`
- `trials/t5-tex-build/runtime/host.mjs`
- `trials/t5-tex-build/runtime/run.mjs`
- `trials/t5-tex-build/runtime/vfs.mjs`

---

## Source Files With Test Coverage

| Source File | Test Files |
|-------------|------------|
| `src/config.ts` | `config.test.ts` |
| `src/core.ts` | `graph-registry.test.ts`, `mermaid-registry.test.ts`, `render.test.ts` |
| `src/errors.ts` | `errors.test.ts`, `graph-dot.test.ts`, `graph-png.test.ts`, `mermaid-class.test.ts`, `mermaid-common.test.ts`, `render.test.ts`, `worker-run.test.ts` |
| `graph/backend-png.ts` | `graph-png.test.ts` |
| `graph/backend-svg.ts` | `graph-svg-backend.test.ts` |
| `graph/dot.ts` | `graph-corpus.test.ts`, `graph-dot.test.ts`, `graph-network.test.ts`, `graph-svg-backend.test.ts`, `mermaid-class.test.ts`, `mermaid-state.test.ts`, `raster-warnings.test.ts` |
| `graph/image.ts` | `graph-image.test.ts` |
| `mermaid/class.ts` | `mermaid-class.test.ts` |
| `mermaid/common.ts` | `mermaid-class.test.ts`, `mermaid-common.test.ts`, `mermaid-sequence.test.ts`, `mermaid-state.test.ts` |
| `mermaid/render.ts` | `mermaid-corpus.test.ts` |
| `mermaid/sequence-layout.ts` | `mermaid-sequence.test.ts` |
| `mermaid/sequence.ts` | `mermaid-sequence.test.ts` |
| `mermaid/state.ts` | `mermaid-state.test.ts` |
| `raster/index.ts` | `graph-network.test.ts`, `raster.test.ts` |
| `raster/warnings.ts` | `raster-warnings.test.ts` |
| `src/registry.ts` | `graph-registry.test.ts`, `mermaid-registry.test.ts` |
| `src/types.ts` | `render.test.ts` |
| `worker/protocol.ts` | `graph-png.test.ts`, `graph-svg-backend.test.ts` |
| `worker/run.ts` | `worker-run.test.ts` |
| `runtime/tfm.mjs` | `type1.test.mjs` |
| `runtime/type1.mjs` | `type1.test.mjs` |
| `runtime/dvisvgm-specials.mjs` | `dvisvgm-specials.test.mjs` |

---

## Test File Details

| Test File | Imports from Source |
|-----------|---------------------|
| `integration/page-checker.test.ts` | 0 files |
| `mutation/run-mutants.test.ts` | 0 files |
| `unit/config.test.ts` | 1 files |
| `unit/errors.test.ts` | 1 files |
| `unit/graph-corpus.test.ts` | 1 files |
| `unit/graph-dot.test.ts` | 2 files |
| `unit/graph-image.test.ts` | 1 files |
| `unit/graph-large.test.ts` | 0 files |
| `unit/graph-network.test.ts` | 2 files |
| `unit/graph-png.test.ts` | 3 files |
| `unit/graph-registry.test.ts` | 2 files |
| `unit/graph-svg-backend.test.ts` | 3 files |
| `unit/mermaid-class.test.ts` | 4 files |
| `unit/mermaid-common.test.ts` | 2 files |
| `unit/mermaid-corpus.test.ts` | 1 files |
| `unit/mermaid-network.test.ts` | 0 files |
| `unit/mermaid-registry.test.ts` | 2 files |
| `unit/mermaid-render.test.ts` | 0 files |
| `unit/mermaid-sequence.test.ts` | 3 files |
| `unit/mermaid-state.test.ts` | 3 files |
| `unit/no-bun-api.test.ts` | 0 files |
| `unit/page-checker-io.test.ts` | 0 files |
| `unit/process-list.test.ts` | 0 files |
| `unit/raster-init.test.ts` | 0 files |
| `unit/raster-warnings.test.ts` | 2 files |
| `unit/raster.test.ts` | 1 files |
| `unit/readme-mermaid.test.ts` | 0 files |
| `unit/render.test.ts` | 3 files |
| `unit/svg-compare.test.ts` | 0 files |
| `unit/teardown.test.ts` | 0 files |
| `unit/worker-run.test.ts` | 2 files |
| `test/tangle.test.mjs` | 0 files |
| `test/trip-gate.test.mjs` | 0 files |
| `test/type1.test.mjs` | 2 files |
| `test/dvisvgm-specials.test.mjs` | 1 files |
| `test/etrip-gate.test.mjs` | 0 files |
| `test/primitives.test.mjs` | 0 files |
