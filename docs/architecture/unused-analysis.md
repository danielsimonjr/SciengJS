<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Unused Files and Exports Analysis

## Summary

- **Files with no in-repo importer**: 7
- **Dormant files**: 14
  - **Orphaned (reachable from nothing)**: 11
  - **Test-only (only a test reaches them)**: 3
- **Potentially unused exports**: 37
  - **Unreferenced anywhere**: 5
  - **Referenced in their own module**: 32
  - **Not classified**: 0

## Caveats

- A literal relative `import(...)` is a graph edge. A runtime call is a namespace use (`*`), so the exports of that file count as used. A type-position `import(...).Name` counts only `Name`, and `typeof import(...)` counts none. A dynamic import built from a variable or a template, and other runtime loads (e.g. `new Worker(path)`), are still invisible -- a file or export reached ONLY through one of those is reported as no-importer/unreferenced even though it may be live.
- `noImporterFiles` is NOT a deletion-candidate list. A file with zero in-repo importers is expected, not suspicious, for: a standalone script invoked directly (e.g. a smoketest run via `node script.mjs`, never `import`ed by anything), or a build/lint config file loaded by its own tool rather than by source code (e.g. `eslint.config.mjs`, read by eslint itself). Cross-check against package.json scripts / tool configs before treating any entry here as dead.
- Only NAMED exports are analysed (`FileNode.exports` carries named exports only) -- `export default` usage is not checked here.
- The split of exports into `referencedInModule` and `unreferencedAnywhere` is a TEXT-LEVEL heuristic. The analysis counts whole-identifier occurrences in the source of the defining file, minus the declaration site itself. The count is not an AST reference count. The analysis can over-count a name that also appears in a string literal or comment. When the source text cannot be read (no `RepoGraph.root_path`, or the file is missing), the export lands in `unclassifiedExports`. The analysis does not guess a bucket for it.
- `unreferencedAnywhereNotes`'s dynamic-import check (`_dynamic_import_referrers`) only sees `import(...)` calls with a LITERAL string specifier. A dynamic import built from a variable or template literal (e.g. `import(`./cmds/${name}.js`)`, a command-dispatcher pattern) is invisible to it -- 'found none' in a note means no LITERAL match was found, NOT that nothing imports the file.

## Dormant files: orphaned

Source files that no root and no test reaches. Verify each one before you delete it.

- `trials/t1-graph/compare-layout.mjs`
- `trials/t1-graph/make-sources.mjs`
- `trials/t1-graph/measure.mjs`
- `trials/t2-mesh/measure.mjs`
- `trials/t3-tex/shim/index.cjs`
- `trials/t4-browser/assets/pinned.js`
- `trials/t4-browser/measure.mjs`
- `trials/t5-tex-build/runtime/dvi2svg.mjs`
- `trials/t5-tex-build/runtime/host.mjs`
- `trials/t5-tex-build/runtime/run.mjs`
- `trials/t5-tex-build/runtime/vfs.mjs`

## Dormant files: test-only

Source files that only a test reaches. They ship nothing, but a test uses them.

- `trials/t5-tex-build/runtime/tfm.mjs`
- `trials/t5-tex-build/runtime/type1.mjs`
- `trials/t6-etex-build/runtime/dvisvgm-specials.mjs`

## Files with no in-repo importer

No file of this repository imports these files. Do not use the list as a deletion list.

- `trials/t1-graph/compare-layout.mjs`
- `trials/t1-graph/make-sources.mjs`
- `trials/t1-graph/measure.mjs`
- `trials/t2-mesh/measure.mjs`
- `trials/t3-tex/shim/index.cjs`
- `trials/t4-browser/assets/pinned.js`
- `trials/t4-browser/measure.mjs`

## Exports unreferenced anywhere

No other file imports these names, and their own module does not use them.

- `src/graph/backend-pdf.ts`: `render`
- `src/plot/backend-html.ts`: `render`
- `src/plot/backend-png.ts`: `render`
- `src/plot/backend-svg.ts`: `render`
- `trials/t6-etex-build/runtime/dvisvgm-specials.mjs`: `unitPerPt`

### Notes

- `src/graph/backend-pdf.ts` `render`: Checked for a dynamic import() call with a LITERAL string specifier resolving to 'src/graph/backend-pdf.ts' across the whole repo and found none. This scan can only see import() calls with a literal string specifier -- a dynamic import built from a variable or template literal (e.g. import(`./cmds/${name}.js`)) is invisible to it, so 'found none' means no LITERAL match was found, NOT that nothing imports this. 'render' may still be consumed via such a call. Also verify against consumption this scan cannot see at all (docs examples, published API surface, a runtime-built path/`new Worker(...)`) before deleting.
- `src/plot/backend-html.ts` `render`: Checked for a dynamic import() call with a LITERAL string specifier resolving to 'src/plot/backend-html.ts' across the whole repo and found none. This scan can only see import() calls with a literal string specifier -- a dynamic import built from a variable or template literal (e.g. import(`./cmds/${name}.js`)) is invisible to it, so 'found none' means no LITERAL match was found, NOT that nothing imports this. 'render' may still be consumed via such a call. Also verify against consumption this scan cannot see at all (docs examples, published API surface, a runtime-built path/`new Worker(...)`) before deleting.
- `src/plot/backend-png.ts` `render`: Checked for a dynamic import() call with a LITERAL string specifier resolving to 'src/plot/backend-png.ts' across the whole repo and found none. This scan can only see import() calls with a literal string specifier -- a dynamic import built from a variable or template literal (e.g. import(`./cmds/${name}.js`)) is invisible to it, so 'found none' means no LITERAL match was found, NOT that nothing imports this. 'render' may still be consumed via such a call. Also verify against consumption this scan cannot see at all (docs examples, published API surface, a runtime-built path/`new Worker(...)`) before deleting.
- `src/plot/backend-svg.ts` `render`: Checked for a dynamic import() call with a LITERAL string specifier resolving to 'src/plot/backend-svg.ts' across the whole repo and found none. This scan can only see import() calls with a literal string specifier -- a dynamic import built from a variable or template literal (e.g. import(`./cmds/${name}.js`)) is invisible to it, so 'found none' means no LITERAL match was found, NOT that nothing imports this. 'render' may still be consumed via such a call. Also verify against consumption this scan cannot see at all (docs examples, published API surface, a runtime-built path/`new Worker(...)`) before deleting.
- `trials/t6-etex-build/runtime/dvisvgm-specials.mjs` `unitPerPt`: Checked for a dynamic import() call with a LITERAL string specifier resolving to 'trials/t6-etex-build/runtime/dvisvgm-specials.mjs' across the whole repo and found none. This scan can only see import() calls with a literal string specifier -- a dynamic import built from a variable or template literal (e.g. import(`./cmds/${name}.js`)) is invisible to it, so 'found none' means no LITERAL match was found, NOT that nothing imports this. 'unitPerPt' may still be consumed via such a call. Also verify against consumption this scan cannot see at all (docs examples, published API surface, a runtime-built path/`new Worker(...)`) before deleting.

## Exports referenced in their own module

No other file imports these names, but their own module uses them.

- `src/browser/input.ts`: `PngOptions`
- `src/browser/page.ts`: `scriptData`
- `src/browser/render.ts`: `PAGE_URL`, `capturePage`
- `src/errors.ts`: `RenderErrorPosition`
- `src/graph/image.ts`: `ImageRemoval`, `StripResult`
- `src/html/convert.ts`: `Asset`, `ConvertOptions`, `ConvertResult`
- `src/math/font-ranges.ts`: `MHCHEM_ALIASES`
- `src/math/tex.ts`: `MATH_PACKAGES`, `exToPx`, `rejectFontFallback`, `standaloneSvg`, `stripRequires`
- `src/mermaid/backend-pdf.ts`: `render`
- `src/mermaid/backend-png.ts`: `render`
- `src/mermaid/backend-svg.ts`: `render`
- `src/mermaid/common.ts`: `Context`, `DiagramKind`
- `src/pairs.ts`: `PairSpec`
- `src/plot/control.ts`: `FrequencyOptions`, `RootLocusOptions`, `TimeOptions`
- `src/plot/ticks.ts`: `LogTick`
- `src/raster/index.ts`: `SvgToPngOptions`
- `src/raster/warnings.ts`: `CoverageTest`
- `src/registry.ts`: `BackendEntry`
- `src/worker/protocol.ts`: `BackendSettings`
- `src/worker/run.ts`: `WorkerExit`, `WorkerLimits`

## Exports not classified

The analysis could not read the source of these names.

_None._
