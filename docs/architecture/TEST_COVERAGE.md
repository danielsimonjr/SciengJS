<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Test Coverage Analysis

## Summary

| Metric | Count |
|--------|-------|
| Total Source Files | 108 |
| Total Test Files | 97 |
| Source Files with Tests | 75 |
| Source Files without Tests | 33 |
| Coverage (raw, direct-import) | **69.4%** |
---

## Source Files Not Imported By A Test

The following 33 source files are not directly imported by any test file:

### browser/

- `src/browser/index.ts`

### graph/

- `src/graph/backend-pdf.ts`
- `src/graph/index.ts`

### html/

- `src/html/backend-md.ts`
- `src/html/index.ts`

### math/

- `src/math/font-ranges.ts`

### mermaid/

- `src/mermaid/backend-pdf.ts`
- `src/mermaid/backend-png.ts`
- `src/mermaid/backend-svg.ts`
- `src/mermaid/index.ts`

### mesh/

- `src/mesh/backend-png.ts`
- `src/mesh/viewer-script.ts`

### plot/

- `src/plot/backend-html.ts`
- `src/plot/backend-png.ts`
- `src/plot/backend-svg.ts`
- `src/plot/index.ts`

### sysml/

- `src/sysml/backend-pdf.ts`
- `src/sysml/backend-png.ts`
- `src/sysml/backend-svg.ts`
- `src/sysml/index.ts`

### tex/

- `src/tex/backend-pdf.ts`
- `src/tex/backend-png.ts`
- `src/tex/index.ts`
- `src/tex/run.ts`
- `src/tex/wasm.ts`

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

---

## Source Files Imported By A Test

| Source File | Test Files |
|-------------|------------|
| `src/assets.ts` | `assets.test.ts` |
| `browser/backend-pdf.ts` | `browser-stage.test.ts` |
| `browser/backend-png.ts` | `browser-stage.test.ts` |
| `browser/cdp.ts` | `browser-cdp.test.ts` |
| `browser/flags.ts` | `browser-flags.test.ts` |
| `browser/input.ts` | `browser-input.test.ts` |
| `browser/page.ts` | `mermaid-browser-capture.test.ts`, `browser-page.test.ts` |
| `browser/pinned.ts` | `mermaid-browser-capture.test.ts`, `mesh-viewer.test.ts`, `browser-pinned.test.ts`, `mesh-viewer.test.ts`, `plot-html.test.ts`, `three-pinned.test.ts` |
| `browser/profile.ts` | `browser-render.test.ts` |
| `browser/proxy.ts` | `browser-proxy.test.ts` |
| `browser/render.ts` | `browser-render.test.ts`, `mermaid-browser-capture.test.ts`, `mesh-viewer.test.ts` |
| `src/config.ts` | `browser-render.test.ts`, `mermaid-browser-capture.test.ts`, `mermaid-browser.test.ts`, `mesh-viewer.test.ts`, `tikz-render.test.ts`, `assets.test.ts`, `config-assets.test.ts`, `config.test.ts`, `html-md-render.test.ts`, `index-exports.test.ts`, `mermaid-route-lenient.test.ts`, `mesh-large.test.ts`, `render.test.ts` |
| `src/core.ts` | `browser-pdf-pairs.test.ts`, `browser-stage.test.ts`, `graph-png.test.ts`, `graph-registry.test.ts`, `math-registry.test.ts`, `mermaid-registry.test.ts`, `mesh-glb.test.ts`, `mesh-large.test.ts`, `mesh-viewer.test.ts`, `plot-html.test.ts`, `plot-registry.test.ts`, `render.test.ts` |
| `src/errors.ts` | `browser-render.test.ts`, `mermaid-browser-capture.test.ts`, `mermaid-browser.test.ts`, `mesh-viewer.test.ts`, `tikz-render.test.ts`, `cad-document.test.ts`, `config-assets.test.ts`, `errors.test.ts`, `graph-dot.test.ts`, `graph-png.test.ts`, `html-md-render.test.ts`, `index-exports.test.ts`, `mermaid-route-lenient.test.ts`, `plot-control.test.ts`, `plot-reader.test.ts`, `plot-svg.test.ts`, `plot-ticks.test.ts`, `render.test.ts`, `worker-run.test.ts` |
| `graph/backend-png.ts` | `graph-png.test.ts` |
| `graph/backend-svg.ts` | `graph-svg-backend.test.ts` |
| `graph/dot.ts` | `graph-corpus.test.ts`, `graph-dot.test.ts`, `graph-network.test.ts`, `graph-svg-backend.test.ts`, `mermaid-class.test.ts`, `mermaid-state.test.ts`, `mermaid-xml.test.ts`, `raster-warnings.test.ts` |
| `graph/image.ts` | `graph-image.test.ts` |
| `graph/text.ts` | `graph-svg-backend.test.ts`, `mermaid-xml.test.ts` |
| `html/convert.ts` | `html-convert-escape.test.ts`, `html-convert.test.ts` |
| `html/fetch-image.ts` | `html-fetch-image.test.ts` |
| `html/images.ts` | `html-convert-escape.test.ts`, `html-md-render.test.ts` |
| `html/md.ts` | `html-convert-escape.test.ts`, `html-md-render.test.ts` |
| `src/index.ts` | `browser-render.test.ts`, `mermaid-browser-capture.test.ts`, `mermaid-browser.test.ts`, `mesh-viewer.test.ts`, `tikz-render.test.ts`, `html-md-render.test.ts`, `index-exports.test.ts`, `mermaid-route-lenient.test.ts` |
| `math/backend-pdf.ts` | `math-backends.test.ts` |
| `math/backend-png.ts` | `math-backends.test.ts` |
| `math/backend-svg.ts` | `math-backends.test.ts` |
| `math/index.ts` | `math-backends.test.ts` |
| `math/tex.ts` | `math-backends.test.ts`, `math-svg.test.ts` |
| `mermaid/browser.ts` | `mermaid-browser-capture.test.ts`, `browser-pinned.test.ts` |
| `mermaid/class.ts` | `mermaid-class.test.ts`, `mermaid-xml.test.ts` |
| `mermaid/common.ts` | `mermaid-class.test.ts`, `mermaid-common.test.ts`, `mermaid-routing-scan.test.ts`, `mermaid-routing.test.ts`, `mermaid-sequence.test.ts`, `mermaid-state.test.ts`, `mermaid-xml.test.ts` |
| `mermaid/render.ts` | `mermaid-corpus.test.ts`, `mermaid-xml.test.ts` |
| `mermaid/sequence-layout.ts` | `mermaid-sequence.test.ts`, `mermaid-xml.test.ts` |
| `mermaid/sequence.ts` | `mermaid-sequence.test.ts`, `mermaid-xml.test.ts` |
| `mermaid/state.ts` | `mermaid-state.test.ts`, `mermaid-xml.test.ts` |
| `mesh/backend-glb.ts` | `mesh-viewer.test.ts`, `cad-build.test.ts`, `mesh-limit.test.ts` |
| `mesh/backend-html.ts` | `cad-build.test.ts` |
| `mesh/backend-stl.ts` | `cad-build.test.ts` |
| `mesh/cad-build.ts` | `mesh-viewer.test.ts`, `cad-build.test.ts` |
| `mesh/cad-builder.ts` | `mesh-viewer.test.ts`, `cad-build.test.ts` |
| `mesh/cad-document.ts` | `mesh-viewer.test.ts`, `cad-build.test.ts`, `cad-document.test.ts` |
| `mesh/glb.ts` | `mesh-viewer.test.ts`, `glb-writer.test.ts` |
| `mesh/index.ts` | `mesh-viewer.test.ts` |
| `mesh/pinned-three.ts` | `mesh-viewer.test.ts`, `mesh-viewer.test.ts` |
| `mesh/read.ts` | `mesh-viewer.test.ts`, `glb-writer.test.ts`, `mesh-glb.test.ts`, `mesh-limit.test.ts` |
| `mesh/stl.ts` | `mesh-viewer.test.ts` |
| `mesh/viewer.ts` | `mesh-viewer.test.ts`, `mesh-viewer.test.ts` |
| `src/pairs.ts` | `browser-pdf-pairs.test.ts`, `tex-wiring.test.ts` |
| `plot/control.ts` | `plot-control.test.ts` |
| `plot/plotter.ts` | `plot-control.test.ts`, `plot-corpus.test.ts`, `plot-svg.test.ts` |
| `plot/reader.ts` | `plot-reader.test.ts` |
| `plot/ticks.ts` | `plot-ticks.test.ts` |
| `raster/index.ts` | `graph-network.test.ts`, `mermaid-xml.test.ts`, `raster.test.ts` |
| `raster/warnings.ts` | `raster-warnings.test.ts` |
| `src/registry.ts` | `browser-pdf-pairs.test.ts`, `browser-stage.test.ts`, `graph-png.test.ts`, `graph-registry.test.ts`, `math-registry.test.ts`, `mermaid-registry.test.ts`, `mesh-glb.test.ts`, `mesh-large.test.ts`, `mesh-viewer.test.ts`, `plot-html.test.ts`, `plot-registry.test.ts`, `tex-wiring.test.ts` |
| `sysml/parse.ts` | `sysml-parse.test.ts`, `sysml-views.test.ts` |
| `sysml/render.ts` | `sysml-corpus.test.ts`, `sysml-views.test.ts` |
| `sysml/tokens.ts` | `sysml-parse.test.ts` |
| `sysml/views.ts` | `sysml-views.test.ts` |
| `tex/backend-svg.ts` | `tex-wiring.test.ts` |
| `tex/bundles.ts` | `tex-bundles.test.ts` |
| `tex/detect.ts` | `tex-detect.test.ts` |
| `tex/dvi.ts` | `tex-dvi.test.ts` |
| `tex/host.ts` | `tex-host-names.test.ts`, `tex-limits.test.ts` |
| `tex/render.ts` | `tex-render.test.ts`, `tex-limits.test.ts` |
| `tex/specials.ts` | `tex-specials.test.ts` |
| `tex/stage.ts` | `tex-wiring.test.ts` |
| `tex/tfm.ts` | `tex-tfm.test.ts` |
| `tex/type1.ts` | `tex-type1.test.ts` |
| `tex/vfs.ts` | `tex-host-names.test.ts`, `tex-vfs.test.ts` |
| `src/types.ts` | `browser-render.test.ts`, `mermaid-browser-capture.test.ts`, `mermaid-browser.test.ts`, `mesh-viewer.test.ts`, `tikz-render.test.ts`, `html-md-render.test.ts`, `index-exports.test.ts`, `mermaid-route-lenient.test.ts`, `render.test.ts` |
| `src/version.ts` | `config-assets.test.ts`, `version.test.ts` |
| `worker/protocol.ts` | `browser-stage.test.ts`, `cad-build.test.ts`, `graph-png.test.ts`, `graph-svg-backend.test.ts`, `math-backends.test.ts`, `mesh-limit.test.ts` |
| `worker/run.ts` | `worker-exec-argv.test.ts`, `worker-run.test.ts` |

---

## Test File Details

| Test File | Imports from Source |
|-----------|---------------------|
| `integration/browser-render.test.ts` | 6 files |
| `integration/mermaid-browser-capture.test.ts` | 8 files |
| `integration/mermaid-browser.test.ts` | 4 files |
| `integration/mesh-viewer.test.ts` | 16 files |
| `integration/page-checker.test.ts` | 0 files |
| `integration/tex-render.test.ts` | 1 files |
| `integration/tikz-render.test.ts` | 4 files |
| `mutation/run-mutants.test.ts` | 0 files |
| `tex-tools/etrip-gate.test.mjs` | 0 files |
| `tex-tools/primitives.test.mjs` | 0 files |
| `tex-tools/tangle.test.mjs` | 0 files |
| `tex-tools/trip-gate.test.mjs` | 0 files |
| `unit/assets.test.ts` | 2 files |
| `unit/browser-cdp.test.ts` | 1 files |
| `unit/browser-flags.test.ts` | 1 files |
| `unit/browser-input.test.ts` | 1 files |
| `unit/browser-page.test.ts` | 1 files |
| `unit/browser-pdf-pairs.test.ts` | 3 files |
| `unit/browser-pinned.test.ts` | 2 files |
| `unit/browser-proxy.test.ts` | 1 files |
| `unit/browser-stage.test.ts` | 5 files |
| `unit/cad-build.test.ts` | 7 files |
| `unit/cad-document.test.ts` | 2 files |
| `unit/config-assets.test.ts` | 3 files |
| `unit/config.test.ts` | 1 files |
| `unit/errors.test.ts` | 1 files |
| `unit/glb-writer.test.ts` | 2 files |
| `unit/graph-corpus.test.ts` | 1 files |
| `unit/graph-dot.test.ts` | 2 files |
| `unit/graph-image.test.ts` | 1 files |
| `unit/graph-large.test.ts` | 0 files |
| `unit/graph-network.test.ts` | 2 files |
| `unit/graph-png.test.ts` | 5 files |
| `unit/graph-registry.test.ts` | 2 files |
| `unit/graph-svg-backend.test.ts` | 4 files |
| `unit/html-convert-escape.test.ts` | 3 files |
| `unit/html-convert.test.ts` | 1 files |
| `unit/html-fetch-image.test.ts` | 1 files |
| `unit/html-md-render.test.ts` | 6 files |
| `unit/index-exports.test.ts` | 4 files |
| `unit/math-backends.test.ts` | 6 files |
| `unit/math-registry.test.ts` | 2 files |
| `unit/math-svg.test.ts` | 1 files |
| `unit/mermaid-browser-route.test.ts` | 0 files |
| `unit/mermaid-class.test.ts` | 3 files |
| `unit/mermaid-common.test.ts` | 1 files |
| `unit/mermaid-corpus.test.ts` | 1 files |
| `unit/mermaid-network.test.ts` | 0 files |
| `unit/mermaid-registry.test.ts` | 2 files |
| `unit/mermaid-render.test.ts` | 0 files |
| `unit/mermaid-route-lenient.test.ts` | 4 files |
| `unit/mermaid-routing-scan.test.ts` | 1 files |
| `unit/mermaid-routing.test.ts` | 1 files |
| `unit/mermaid-sequence.test.ts` | 3 files |
| `unit/mermaid-state.test.ts` | 3 files |
| `unit/mermaid-xml.test.ts` | 9 files |
| `unit/mesh-glb.test.ts` | 3 files |
| `unit/mesh-large.test.ts` | 3 files |
| `unit/mesh-limit.test.ts` | 3 files |
| `unit/mesh-viewer.test.ts` | 5 files |
| `unit/no-bun-api.test.ts` | 0 files |
| `unit/no-sandbox-flag.test.ts` | 0 files |
| `unit/page-checker-io.test.ts` | 0 files |
| `unit/plot-control.test.ts` | 3 files |
| `unit/plot-corpus.test.ts` | 1 files |
| `unit/plot-html.test.ts` | 3 files |
| `unit/plot-reader.test.ts` | 2 files |
| `unit/plot-registry.test.ts` | 2 files |
| `unit/plot-svg.test.ts` | 2 files |
| `unit/plot-ticks.test.ts` | 2 files |
| `unit/process-list.test.ts` | 0 files |
| `unit/raster-init.test.ts` | 0 files |
| `unit/raster-warnings.test.ts` | 2 files |
| `unit/raster.test.ts` | 1 files |
| `unit/readme-mermaid.test.ts` | 0 files |
| `unit/render.test.ts` | 4 files |
| `unit/svg-compare.test.ts` | 0 files |
| `unit/sysml-backends.test.ts` | 0 files |
| `unit/sysml-corpus.test.ts` | 1 files |
| `unit/sysml-parse.test.ts` | 2 files |
| `unit/sysml-views.test.ts` | 3 files |
| `unit/teardown.test.ts` | 0 files |
| `unit/tex-bundles.test.ts` | 1 files |
| `unit/tex-detect.test.ts` | 1 files |
| `unit/tex-dvi.test.ts` | 1 files |
| `unit/tex-host-names.test.ts` | 2 files |
| `unit/tex-limits.test.ts` | 2 files |
| `unit/tex-specials.test.ts` | 1 files |
| `unit/tex-tfm.test.ts` | 1 files |
| `unit/tex-type1.test.ts` | 1 files |
| `unit/tex-vfs.test.ts` | 1 files |
| `unit/tex-wiring.test.ts` | 4 files |
| `unit/third-party-notices.test.ts` | 0 files |
| `unit/three-pinned.test.ts` | 1 files |
| `unit/version.test.ts` | 1 files |
| `unit/worker-exec-argv.test.ts` | 1 files |
| `unit/worker-run.test.ts` | 2 files |
