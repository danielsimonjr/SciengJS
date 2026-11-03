<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# @danielsimonjr/sciengjs - Dependency Graph

**Version**: 0.2.0

This document provides a comprehensive dependency graph of all files, components, imports, functions, and variables in the codebase.

---

## Table of Contents

1. [Overview](#overview)
2. [Package Dependencies](#package-dependencies)
3. [Root Dependencies](#root-dependencies)
4. [Graph Dependencies](#graph-dependencies)
5. [Entry Dependencies](#entry-dependencies)
6. [Mermaid Dependencies](#mermaid-dependencies)
7. [Raster Dependencies](#raster-dependencies)
8. [Worker Dependencies](#worker-dependencies)
9. [Trials/t1 graph Dependencies](#trials-t1-graph-dependencies)
10. [Trials/t2 mesh Dependencies](#trials-t2-mesh-dependencies)
11. [Trials/t3 tex Dependencies](#trials-t3-tex-dependencies)
12. [Trials/t4 browser Dependencies](#trials-t4-browser-dependencies)
13. [Trials/t5 tex build Dependencies](#trials-t5-tex-build-dependencies)
14. [Trials/t6 etex build Dependencies](#trials-t6-etex-build-dependencies)
15. [Dependency Matrix](#dependency-matrix)
16. [Circular Dependency Analysis](#circular-dependency-analysis)
17. [Visual Dependency Graph](#visual-dependency-graph)
18. [Summary Statistics](#summary-statistics)

---

<a id="overview"></a>
## Overview

The codebase is organized into the following modules:

- **root**: 6 files
- **graph**: 5 files
- **entry**: 1 file
- **mermaid**: 9 files
- **raster**: 2 files
- **worker**: 3 files
- **trials/t1-graph**: 3 files
- **trials/t2-mesh**: 1 file
- **trials/t3-tex**: 1 file
- **trials/t4-browser**: 2 files
- **trials/t5-tex-build**: 6 files
- **trials/t6-etex-build**: 1 file

---

<a id="root-dependencies"></a>

## Root Dependencies

### `src/config.ts` - Resolves the configuration. Precedence: call option, then environment, then file, then default.

**Node.js Built-in Dependencies:**
| Module | Import |
|--------|--------|
| `os` | `homedir` |
| `fs/promises` | `readFile` |
| `path` | `default` |

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `./errors.ts` | `RenderError` | Import |

**Exports:**
- Interfaces: `SciengConfig`, `ConfigDeps`
- Types: `NetworkPolicy`
- Functions: `loadConfig`

---

### `src/core.ts` - Renders one request. The registry and the config dependencies are parameters so that tests

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `./config.ts` | `loadConfig, ConfigDeps, SciengConfig` | Import |
| `./errors.ts` | `RenderError` | Import |
| `./pairs.ts` | `PAIRS, findPair` | Import |
| `./registry.ts` | `registryKey, Registry` | Import |
| `./worker/run.ts` | `runInWorker` | Import |
| `./types.ts` | `BINARY_INPUT_TYPES, INPUT_TYPES, OUTPUT_FORMATS, Capability, OutputFormat, RenderOptions, RenderRequest, RenderResult` | Import |

**Exports:**
- Functions: `renderWithRegistry`, `capabilitiesWithRegistry`

---

### `src/errors.ts` - errors module

**Exports:**
- Classes: `RenderError`
- Interfaces: `RenderErrorPosition`
- Types: `RenderErrorCode`
- Constants: `RENDER_ERROR_CODES`

---

### `src/pairs.ts` - pairs module

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `./types.ts` | `InputType, OutputFormat` | Import (type-only) |

**Exports:**
- Interfaces: `PairSpec`
- Functions: `findPair`
- Constants: `PAIRS`

---

### `src/registry.ts` - registry module

**Node.js Built-in Dependencies:**
| Module | Import |
|--------|--------|
| `path` | `extname` |
| `url` | `fileURLToPath` |

**Exports:**
- Interfaces: `BackendEntry`
- Types: `Registry`
- Functions: `registryKey`
- Constants: `DEFAULT_REGISTRY`

---

### `src/types.ts` - types module

**Exports:**
- Interfaces: `RenderRequest`, `RenderAsset`, `RenderResult`, `Capability`
- Types: `InputType`, `OutputFormat`, `RenderOptions`
- Constants: `INPUT_TYPES`, `OUTPUT_FORMATS`, `BINARY_INPUT_TYPES`

---

<a id="graph-dependencies"></a>

## Graph Dependencies

### `src/graph/backend-png.ts` - Rasterizes one SVG document to PNG at scale 1. The font follows render: the rasterFont setting when set,

**Node.js Built-in Dependencies:**
| Module | Import |
|--------|--------|
| `fs` | `readFileSync` |
| `url` | `fileURLToPath` |

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `../errors.ts` | `RenderError` | Import |
| `../worker/protocol.ts` | `BackendOutput, WorkerJob` | Import (type-only) |
| `./dot.ts` | `dotSourceText, dotToSvg` | Import |
| `../raster/index.ts` | `isFontFile, svgToPng` | Import |
| `../raster/warnings.ts` | `rasterWarnings` | Import |

**Exports:**
- Functions: `render`, `renderPng`, `svgDocumentToPng`

---

### `src/graph/backend-svg.ts` - backend-svg module

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `../errors.ts` | `RenderError` | Import |
| `../worker/protocol.ts` | `BackendOutput, WorkerJob` | Import (type-only) |
| `./dot.ts` | `dotSourceText, dotToSvg` | Import |

**Exports:**
- Functions: `render`

---

### `src/graph/dot.ts` - dot module

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `../errors.ts` | `RenderError` | Import |
| `./image.ts` | `stripImageAttributes, dropImageElements, dropStylesheetInstructions` | Import |

**Exports:**
- Interfaces: `DotSvgResult`
- Functions: `dotToSvg`, `dotSourceText`

---

### `src/graph/image.ts` - DOT identifiers take every byte from 0x80 upward, so every non-ASCII character counts as a letter.

**Exports:**
- Interfaces: `ImageRemoval`, `StripResult`
- Functions: `stripImageAttributes`, `dropImageElements`, `dropStylesheetInstructions`

---

### `src/graph/index.ts` - Package entry point for graph (re-exports 2 symbols)

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `./dot.ts` | `dotToSvg` | Re-export |
| `./dot.ts` | `DotSvgResult` | Re-export (type-only) |

**Exports:**
- Re-exports: `dotToSvg`, `DotSvgResult`

---

<a id="entry-dependencies"></a>

## Entry Dependencies

### `src/index.ts` - Package entry point for src (re-exports 15 symbols)

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `./core.ts` | `capabilitiesWithRegistry, renderWithRegistry` | Import |
| `./registry.ts` | `DEFAULT_REGISTRY` | Import |
| `./config.ts` | `SciengConfig` | Import (type-only) |
| `./types.ts` | `Capability, RenderRequest, RenderResult` | Import (type-only) |
| `./errors.ts` | `RenderError, RENDER_ERROR_CODES, RenderErrorCode` | Re-export |
| `./config.ts` | `loadConfig, SciengConfig, NetworkPolicy` | Re-export |
| `./types.ts` | `INPUT_TYPES, OUTPUT_FORMATS, InputType, OutputFormat, RenderOptions, RenderRequest, RenderResult, RenderAsset, Capability` | Re-export |

**Exports:**
- Functions: `render`, `capabilities`
- Re-exports:

  ```text
  RenderError, RENDER_ERROR_CODES, RenderErrorCode, loadConfig, SciengConfig, NetworkPolicy,
  INPUT_TYPES, OUTPUT_FORMATS, InputType, OutputFormat, RenderOptions, RenderRequest, RenderResult,
  RenderAsset, Capability
  ```


---

<a id="mermaid-dependencies"></a>

## Mermaid Dependencies

### `src/mermaid/backend-png.ts` - Renders one Mermaid source to PNG: the SVG of the diagram, then the PNG of that SVG.

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `../graph/backend-png.ts` | `svgDocumentToPng` | Import |
| `../worker/protocol.ts` | `BackendOutput, WorkerJob` | Import (type-only) |
| `./common.ts` | `sourceText` | Import |
| `./render.ts` | `renderMermaidSvg` | Import |

**Exports:**
- Functions: `render`

---

### `src/mermaid/backend-svg.ts` - backend-svg module

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `../worker/protocol.ts` | `BackendOutput, WorkerJob` | Import (type-only) |
| `./common.ts` | `sourceText` | Import |
| `./render.ts` | `renderMermaidSvg` | Import |

**Exports:**
- Functions: `render`

---

### `src/mermaid/class.ts` - class module

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `./common.ts` | `inputError, outside, xmlSafe, ContentLine, Source` | Import |

**Exports:**
- Interfaces: `ClassArrow`, `ClassDef`, `ClassRelation`, `ClassModel`
- Types: `Marker`
- Functions: `parseClassDiagram`, `classToDot`

---

### `src/mermaid/common.ts` - Reads the option `lenient` and checks the other keys. A key outside `lenient` and `extra` rejects with E_INPUT.

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `../errors.ts` | `RenderError` | Import |

**Exports:**
- Interfaces: `ContentLine`, `Context`, `Source`
- Types: `DiagramKind`
- Functions: `readLenient`, `sourceText`, `xmlSafe`, `inputError`, `outside`, `prepare`

---

### `src/mermaid/index.ts` - The public surface of the Mermaid native layouts. It holds the header and option reader, the parsers,

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `./common.ts` | `prepare, Source` | Re-export |
| `./class.ts` | `parseClassDiagram, classToDot, ClassModel, ClassDef, ClassRelation, ClassArrow, Marker` | Re-export |
| `./state.ts` | `parseStateDiagram, stateToDot, StateModel, StateDef, StateTransition` | Re-export |
| `./sequence.ts` | `parseSequenceDiagram, SequenceModel, SeqEvent, Participant, MessageEvent, NoteEvent, ActivateEvent, DeactivateEvent, Branch, BlockEvent` | Re-export |
| `./sequence-layout.ts` | `layoutSequence` | Re-export |
| `./render.ts` | `renderMermaidSvg, MermaidSvg` | Re-export |

**Exports:**
- Re-exports:

  ```text
  prepare, Source, parseClassDiagram, classToDot, ClassModel, ClassDef, ClassRelation, ClassArrow,
  Marker, parseStateDiagram, stateToDot, StateModel, StateDef, StateTransition, parseSequenceDiagram,
  SequenceModel, SeqEvent, Participant, MessageEvent, NoteEvent, ActivateEvent, DeactivateEvent,
  Branch, BlockEvent, layoutSequence, renderMermaidSvg, MermaidSvg
  ```


---

### `src/mermaid/render.ts` - Renders one Mermaid source to SVG. A class or state diagram goes through DOT and the graph stage.

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `../graph/dot.ts` | `dotToSvg` | Import |
| `./class.ts` | `classToDot, parseClassDiagram` | Import |
| `./common.ts` | `prepare` | Import |
| `./sequence.ts` | `parseSequenceDiagram` | Import |
| `./sequence-layout.ts` | `layoutSequence` | Import |
| `./state.ts` | `parseStateDiagram, stateToDot` | Import |

**Exports:**
- Interfaces: `MermaidSvg`
- Functions: `renderMermaidSvg`

---

### `src/mermaid/sequence-layout.ts` - Lays out one sequence model into one SVG document string.

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `./common.ts` | `xmlSafe` | Import |
| `./sequence.ts` | `BlockEvent, Branch, MessageEvent, SeqEvent, SequenceModel` | Import (type-only) |

**Exports:**
- Functions: `layoutSequence`

---

### `src/mermaid/sequence.ts` - sequence module

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `./common.ts` | `inputError, outside, Source` | Import |

**Exports:**
- Interfaces: `Participant`, `MessageEvent`, `NoteEvent`, `ActivateEvent`, `DeactivateEvent`, `Branch`, `BlockEvent`, `SequenceModel`
- Types: `SeqEvent`
- Functions: `parseSequenceDiagram`

---

### `src/mermaid/state.ts` - state module

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `./common.ts` | `inputError, outside, xmlSafe, ContentLine, Source` | Import |

**Exports:**
- Interfaces: `StateDef`, `StateTransition`, `StateModel`
- Functions: `parseStateDiagram`, `stateToDot`

---

<a id="raster-dependencies"></a>

## Raster Dependencies

### `src/raster/index.ts` - The most megabytes of RGBA pixels that one PNG render accepts. Measured: a render holds about two

**External Dependencies:**
| Package | Import |
|---------|--------|
| `@resvg/resvg-wasm` | `initWasm, Resvg` |

**Node.js Built-in Dependencies:**
| Module | Import |
|--------|--------|
| `fs` | `readFileSync` |
| `module` | `createRequire` |

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `../errors.ts` | `RenderError` | Import |

**Exports:**
- Interfaces: `SvgToPngOptions`
- Functions: `svgToPng`, `isFontFile`
- Constants: `MAX_PNG_PIXEL_MB`

---

### `src/raster/warnings.ts` - Reads the Unicode character map of a TrueType or OpenType font (formats 4 and 12).

**Exports:**
- Types: `CoverageTest`
- Functions: `fontCovers`, `rasterWarnings`

---

<a id="worker-dependencies"></a>

## Worker Dependencies

### `src/worker/entry.ts` - The worker side of a render. The worker loads the backend module, runs one request and posts one message.

**Node.js Built-in Dependencies:**
| Module | Import |
|--------|--------|
| `worker_threads` | `parentPort, workerData` |

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `../errors.ts` | `RenderError, RENDER_ERROR_CODES, RenderErrorCode` | Import |
| `./protocol.ts` | `BackendOutput, WorkerJob, WorkerMessage` | Import (type-only) |

---

### `src/worker/protocol.ts` - Type definitions (3 interfaces, 1 type aliases)

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `../types.ts` | `InputType, OutputFormat, RenderOptions` | Import (type-only) |

**Exports:**
- Interfaces: `BackendSettings`, `WorkerJob`, `BackendOutput`
- Types: `WorkerMessage`

---

### `src/worker/run.ts` - The heap limit of the worker, in megabytes. Node enforces it. Bun 1.4.4 accepts the option

**Node.js Built-in Dependencies:**
| Module | Import |
|--------|--------|
| `worker_threads` | `Worker` |
| `path` | `extname` |
| `url` | `fileURLToPath` |

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `../errors.ts` | `RenderError` | Import |
| `./protocol.ts` | `BackendOutput, WorkerJob, WorkerMessage` | Import (type-only) |

**Exports:**
- Interfaces: `WorkerExit`, `WorkerLimits`
- Functions: `runInWorker`

---

<a id="trials-t1-graph-dependencies"></a>

## Trials/t1 graph Dependencies

### `trials/t1-graph/compare-layout.mjs` - Trial T1: compare the node layout of two Graphviz SVG files of the same DOT source.

**Node.js Built-in Dependencies:**
| Module | Import |
|--------|--------|
| `fs` | `readFileSync` |

---

### `trials/t1-graph/make-sources.mjs` - Writes the generated DOT sources of trial T1. The measurement script and the

**Node.js Built-in Dependencies:**
| Module | Import |
|--------|--------|
| `fs` | `writeFileSync` |
| `path` | `dirname, join` |
| `url` | `fileURLToPath` |

---

### `trials/t1-graph/measure.mjs` - Trial T1: measure @viz-js/viz on Bun or Node. Runs unchanged under both.

**Node.js Built-in Dependencies:**
| Module | Import |
|--------|--------|
| `crypto` | `createHash` |
| `fs` | `existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync` |
| `path` | `dirname, join` |
| `url` | `fileURLToPath` |

---

<a id="trials-t2-mesh-dependencies"></a>

## Trials/t2 mesh Dependencies

### `trials/t2-mesh/measure.mjs` - Trial T2: measure occt-import-js on Bun or Node. Runs unchanged under both.

**Node.js Built-in Dependencies:**
| Module | Import |
|--------|--------|
| `crypto` | `createHash` |
| `fs` | `readFileSync, readdirSync, statSync` |
| `path` | `dirname, join` |
| `url` | `fileURLToPath` |

---

<a id="trials-t3-tex-dependencies"></a>

## Trials/t3 tex Dependencies

### `trials/t3-tex/shim/index.cjs` - Stand-in for the node-kpathsea addon that web2js library.js requires.

---

<a id="trials-t4-browser-dependencies"></a>

## Trials/t4 browser Dependencies

### `trials/t4-browser/assets/pinned.js` - The local copy of the pinned asset. The client serves it for the pinned URL in config.json.

---

### `trials/t4-browser/measure.mjs` - A proxy that refuses every connection. It records each attempt (the first line of the request)

**Node.js Built-in Dependencies:**
| Module | Import |
|--------|--------|
| `child_process` | `spawn` |
| `net` | `createServer` |
| `fs` | `existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync` |
| `os` | `arch, platform, release, tmpdir` |
| `path` | `dirname, join` |
| `url` | `fileURLToPath` |
| `zlib` | `inflateSync` |

---

<a id="trials-t5-tex-build-dependencies"></a>

## Trials/t5 tex build Dependencies

### `trials/t5-tex-build/runtime/dvi2svg.mjs` - a font with no PFB keeps its TFM advances, and each of its glyphs goes in the missing list

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `./tfm.mjs` | `readTfm` | Import |
| `./type1.mjs` | `readType1` | Import |

**Exports:**
- Functions: `dviToSvg`

---

### `trials/t5-tex-build/runtime/host.mjs` - Host functions of the T5 trial: the Pascal file model on a virtual file system.

**Exports:**
- Classes: `ExitSignal`, `Host`

---

### `trials/t5-tex-build/runtime/run.mjs` - Run one compiled Pascal program on the virtual file system.

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `./host.mjs` | `Host, ExitSignal` | Import |

**Exports:**
- Functions: `runProgram`

---

### `trials/t5-tex-build/runtime/tfm.mjs` - TFM reader of the trial: the character widths and the design size.

**Exports:**
- Functions: `readTfm`

---

### `trials/t5-tex-build/runtime/type1.mjs` - Type 1 font reader of the trial: PFB (or PFA) to SVG path data for each glyph.

**Exports:**
- Functions: `readType1`

---

### `trials/t5-tex-build/runtime/vfs.mjs` - A virtual file system for the TeX runs of the trial. Reads come from an

**Node.js Built-in Dependencies:**
| Module | Import |
|--------|--------|
| `fs` | `default` |
| `path` | `default` |

**Exports:**
- Classes: `TreeFS`
- Constants: `flatName`

---

<a id="trials-t6-etex-build-dependencies"></a>

## Trials/t6 etex build Dependencies

### `trials/t6-etex-build/runtime/dvisvgm-specials.mjs` - The SVG unit of the specials of dvisvgm: the big point (72 bp = 72.27 pt).

**Exports:**
- Functions: `createSpecials`
- Constants: `unitPerPt`

---

<a id="dependency-matrix"></a>
## Dependency Matrix

### File Import/Export Matrix

| File | Imports From | Exports To |
|------|--------------|------------|
| `src/errors` | 0 files | 10 files |
| `src/mermaid/common` | 1 file | 8 files |
| `src/mermaid/render` | 6 files | 3 files |
| `src/core` | 6 files | 1 file |
| `src/worker/protocol` | 1 file | 6 files |
| `src/graph/backend-png` | 5 files | 1 file |
| `src/graph/dot` | 2 files | 4 files |
| `src/mermaid/index` | 6 files | 0 files |
| `src/index` | 5 files | 0 files |
| `src/mermaid/backend-png` | 4 files | 0 files |
| `src/mermaid/sequence-layout` | 2 files | 2 files |
| `src/mermaid/sequence` | 1 file | 3 files |
| `src/types` | 0 files | 4 files |
| `src/config` | 1 file | 2 files |
| `src/graph/backend-svg` | 3 files | 0 files |
| `src/mermaid/backend-svg` | 3 files | 0 files |
| `src/mermaid/class` | 1 file | 2 files |
| `src/mermaid/state` | 1 file | 2 files |
| `src/worker/run` | 2 files | 1 file |
| `src/pairs` | 1 file | 1 file |
| `src/raster/index` | 1 file | 1 file |
| `src/registry` | 0 files | 2 files |
| `src/worker/entry` | 2 files | 0 files |
| `trials/t5-tex-build/runtime/dvi2svg.mjs` | 2 files | 0 files |
| `src/graph/image` | 0 files | 1 file |
| `src/graph/index` | 1 file | 0 files |
| `src/raster/warnings` | 0 files | 1 file |
| `trials/t5-tex-build/runtime/host.mjs` | 0 files | 1 file |
| `trials/t5-tex-build/runtime/run.mjs` | 1 file | 0 files |
| `trials/t5-tex-build/runtime/tfm.mjs` | 0 files | 1 file |
| `trials/t5-tex-build/runtime/type1.mjs` | 0 files | 1 file |
| `trials/t1-graph/compare-layout.mjs` | 0 files | 0 files |
| `trials/t1-graph/make-sources.mjs` | 0 files | 0 files |
| `trials/t1-graph/measure.mjs` | 0 files | 0 files |
| `trials/t2-mesh/measure.mjs` | 0 files | 0 files |
| `trials/t3-tex/shim/index.cjs` | 0 files | 0 files |
| `trials/t4-browser/assets/pinned.js` | 0 files | 0 files |
| `trials/t4-browser/measure.mjs` | 0 files | 0 files |
| `trials/t5-tex-build/runtime/vfs.mjs` | 0 files | 0 files |
| `trials/t6-etex-build/runtime/dvisvgm-specials.mjs` | 0 files | 0 files |

---

<a id="circular-dependency-analysis"></a>
## Circular Dependency Analysis

**No circular dependencies detected.**
---

<a id="visual-dependency-graph"></a>
## Visual Dependency Graph

```mermaid
graph TD
    subgraph Root
        N0[config]
        N1[core]
        N2[errors]
        N3[pairs]
        N4[registry]
        N5[types]
    end

    subgraph Graph
        N6[backend-png]
        N7[backend-svg]
        N8[dot]
        N9[image]
        N10[index]
    end

    subgraph Entry
        N11[index]
    end

    subgraph Mermaid
        N12[backend-png]
        N13[backend-svg]
        N14[class]
        N15[common]
        N16[index]
        N17[render]
        N18[sequence-layout]
        N19[sequence]
        N20[state]
    end

    subgraph Raster
        N21[index]
        N22[warnings]
    end

    subgraph Worker
        N23[entry]
        N24[protocol]
        N25[run]
    end

    subgraph Trials/t1-graph
        N26[compare-layout.mjs]
        N27[make-sources.mjs]
        N28[measure.mjs]
    end

    subgraph Trials/t2-mesh
        N29[measure.mjs]
    end

    subgraph Trials/t3-tex
        N30[index.cjs]
    end

    subgraph Trials/t4-browser
        N31[pinned.js]
        N32[measure.mjs]
    end

    subgraph Trials/t5-tex-build
        N33[dvi2svg.mjs]
        N34[host.mjs]
        N35[run.mjs]
        N36[tfm.mjs]
        N37[type1.mjs]
        N38[vfs.mjs]
    end

    subgraph Trials/t6-etex-build
        N39[dvisvgm-specials.mjs]
    end

    N0 --> N2
    N1 --> N0
    N1 --> N2
    N1 --> N3
    N1 --> N4
    N1 --> N25
    N1 --> N5
    N6 --> N2
    N6 --> N24
    N6 --> N8
    N6 --> N21
    N6 --> N22
    N7 --> N2
    N7 --> N24
    N7 --> N8
    N8 --> N2
    N8 --> N9
    N10 --> N8
    N11 --> N1
    N11 --> N4
    N11 --> N0
    N11 --> N5
    N11 --> N2
    N12 --> N6
    N12 --> N24
    N12 --> N15
    N12 --> N17
    N13 --> N24
    N13 --> N15
    N13 --> N17
    N14 --> N15
    N15 --> N2
    N16 --> N15
    N16 --> N14
    N16 --> N20
    N16 --> N19
    N16 --> N18
    N16 --> N17
    N17 --> N8
    N17 --> N14
    N17 --> N15
    N17 --> N19
    N17 --> N18
    N17 --> N20
    N18 --> N15
    N18 --> N19
    N19 --> N15
    N20 --> N15
    N3 --> N5
    N21 --> N2
    N23 --> N2
    N23 --> N24
    N24 --> N5
    N25 --> N2
    N25 --> N24
    N33 --> N36
    N33 --> N37
    N35 --> N34
```

---

<a id="summary-statistics"></a>
## Summary Statistics

| Category | Count |
|----------|-------|
| Total Source Files | 121 |
| Subsystems | 12 |
| Total Lines of Code | 14025 |
| Total Exports | 222 |
| Total Re-exports | 45 |
| Total Classes | 5 |
| Total Interfaces | 42 |
| Total Functions | 93 |
| Total Type Guards | 1 |
| Total Enums | 0 |
| Type-only Imports | 18 |
| Runtime Cyclic Components | 0 |
| Type-only Cyclic Components | 0 |
| Files in Runtime Cycles | 0 |
| Files in Type-only Cycles | 0 |

---

*Version*: 0.2.0
