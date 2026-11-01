<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Test Coverage Analysis

## Summary

| Metric | Count |
|--------|-------|
| Total Source Files | 20 |
| Total Test Files | 6 |
| Source Files with Tests | 4 |
| Source Files without Tests | 16 |
| Coverage (raw, direct-import) | **20.0%** |
---

## Source Files Without Test Coverage

The following 16 source files are not directly imported by any test file:

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
- `src/worker/run.ts`

---

## Source Files With Test Coverage

| Source File | Test Files |
|-------------|------------|
| `src/config.ts` | `config.test.ts` |
| `src/core.ts` | `render.test.ts` |
| `src/errors.ts` | `config.test.ts`, `errors.test.ts`, `render.test.ts` |
| `src/types.ts` | `render.test.ts` |

---

## Test File Details

| Test File | Imports from Source |
|-----------|---------------------|
| `integration/page-checker.test.ts` | 0 files |
| `unit/config.test.ts` | 2 files |
| `unit/errors.test.ts` | 1 files |
| `unit/no-bun-api.test.ts` | 0 files |
| `unit/render.test.ts` | 3 files |
| `unit/svg-compare.test.ts` | 0 files |
