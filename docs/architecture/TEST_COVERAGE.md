<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Test Coverage Analysis

## Summary

| Metric | Count |
|--------|-------|
| Total Source Files | 34 |
| Total Test Files | 17 |
| Source Files with Tests | 8 |
| Source Files without Tests | 26 |
| Coverage (raw, direct-import) | **23.5%** |
---

## Source Files Without Test Coverage

The following 26 source files are not directly imported by any test file:

### browser/

- `src/browser/index.ts`

### graph/

- `src/graph/index.ts`

### html/

- `src/html/index.ts`

### root/

- `src/index.ts`
- `src/pairs.ts`
- `src/registry.ts`

### math/

- `src/math/index.ts`

### mermaid/

- `src/mermaid/index.ts`

### mesh/

- `src/mesh/index.ts`

### plot/

- `src/plot/index.ts`

### raster/

- `src/raster/index.ts`

### sysml/

- `src/sysml/index.ts`

### tex/

- `src/tex/index.ts`

### worker/

- `src/worker/entry.ts`
- `src/worker/protocol.ts`

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
| `src/core.ts` | `render.test.ts` |
| `src/errors.ts` | `config.test.ts`, `errors.test.ts`, `render.test.ts`, `worker-run.test.ts` |
| `src/types.ts` | `render.test.ts` |
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
| `unit/no-bun-api.test.ts` | 0 files |
| `unit/page-checker-io.test.ts` | 0 files |
| `unit/process-list.test.ts` | 0 files |
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
