<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Test Coverage Analysis

## Summary

| Metric | Count |
|--------|-------|
| Total Source Files | 39 |
| Total Test Files | 28 |
| Source Files with Tests | 17 |
| Source Files without Tests | 22 |
| Coverage (raw, direct-import) | **43.6%** |
---

## Source Files Without Test Coverage

The following 22 source files are not directly imported by any test file:

### browser/

- `src/browser/index.ts`

### graph/

- `src/graph/index.ts`

### html/

- `src/html/index.ts`

### math/

- `src/math/index.ts`

### mermaid/

- `src/mermaid/index.ts`

### mesh/

- `src/mesh/index.ts`

### root/

- `src/pairs.ts`

### plot/

- `src/plot/index.ts`

### sysml/

- `src/sysml/index.ts`

### tex/

- `src/tex/index.ts`

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
| `src/config.ts` | `config.test.ts`, `graph-large.test.ts`, `graph-network.test.ts` |
| `src/core.ts` | `graph-registry.test.ts`, `render.test.ts` |
| `src/errors.ts` | `config.test.ts`, `errors.test.ts`, `graph-dot.test.ts`, `graph-large.test.ts`, `graph-network.test.ts`, `graph-png.test.ts`, `graph-svg-backend.test.ts`, `raster.test.ts`, `render.test.ts`, `worker-run.test.ts` |
| `graph/backend-png.ts` | `graph-png.test.ts` |
| `graph/backend-svg.ts` | `graph-svg-backend.test.ts` |
| `graph/dot.ts` | `graph-corpus.test.ts`, `graph-dot.test.ts`, `graph-network.test.ts`, `graph-svg-backend.test.ts`, `raster-warnings.test.ts` |
| `graph/image.ts` | `graph-image.test.ts` |
| `src/index.ts` | `graph-large.test.ts`, `graph-network.test.ts` |
| `raster/index.ts` | `graph-network.test.ts`, `raster.test.ts` |
| `raster/warnings.ts` | `raster-warnings.test.ts` |
| `src/registry.ts` | `graph-registry.test.ts` |
| `src/types.ts` | `graph-large.test.ts`, `graph-network.test.ts`, `render.test.ts` |
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
| `unit/config.test.ts` | 2 files |
| `unit/errors.test.ts` | 1 files |
| `unit/graph-corpus.test.ts` | 1 files |
| `unit/graph-dot.test.ts` | 2 files |
| `unit/graph-image.test.ts` | 1 files |
| `unit/graph-large.test.ts` | 4 files |
| `unit/graph-network.test.ts` | 6 files |
| `unit/graph-png.test.ts` | 3 files |
| `unit/graph-registry.test.ts` | 2 files |
| `unit/graph-svg-backend.test.ts` | 4 files |
| `unit/no-bun-api.test.ts` | 0 files |
| `unit/page-checker-io.test.ts` | 0 files |
| `unit/process-list.test.ts` | 0 files |
| `unit/raster-init.test.ts` | 0 files |
| `unit/raster-warnings.test.ts` | 2 files |
| `unit/raster.test.ts` | 2 files |
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
