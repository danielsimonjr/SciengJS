<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# @danielsimonjr/sciengjs - Dependency Graph

**Version**: 0.0.0

This document provides a comprehensive dependency graph of all files, components, imports, functions, and variables in the codebase.

---

## Table of Contents

1. [Overview](#overview)
2. [Package Dependencies](#package-dependencies)
3. [Browser Dependencies](#browser-dependencies)
4. [Root Dependencies](#root-dependencies)
5. [Graph Dependencies](#graph-dependencies)
6. [Html Dependencies](#html-dependencies)
7. [Entry Dependencies](#entry-dependencies)
8. [Math Dependencies](#math-dependencies)
9. [Mermaid Dependencies](#mermaid-dependencies)
10. [Mesh Dependencies](#mesh-dependencies)
11. [Plot Dependencies](#plot-dependencies)
12. [Raster Dependencies](#raster-dependencies)
13. [Sysml Dependencies](#sysml-dependencies)
14. [Tex Dependencies](#tex-dependencies)
15. [Worker Dependencies](#worker-dependencies)
16. [Dependency Matrix](#dependency-matrix)
17. [Circular Dependency Analysis](#circular-dependency-analysis)
18. [Visual Dependency Graph](#visual-dependency-graph)
19. [Summary Statistics](#summary-statistics)

---

<a id="overview"></a>
## Overview

The codebase is organized into the following modules:

- **browser**: 1 file
- **root**: 6 files
- **graph**: 1 file
- **html**: 1 file
- **entry**: 1 file
- **math**: 1 file
- **mermaid**: 1 file
- **mesh**: 1 file
- **plot**: 1 file
- **raster**: 1 file
- **sysml**: 1 file
- **tex**: 1 file
- **worker**: 3 files

---

<a id="browser-dependencies"></a>

## Browser Dependencies

### `src/browser/index.ts` - Package entry point

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

### `src/graph/index.ts` - Package entry point

---

<a id="html-dependencies"></a>

## Html Dependencies

### `src/html/index.ts` - Package entry point

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

<a id="math-dependencies"></a>

## Math Dependencies

### `src/math/index.ts` - Package entry point

---

<a id="mermaid-dependencies"></a>

## Mermaid Dependencies

### `src/mermaid/index.ts` - Package entry point

---

<a id="mesh-dependencies"></a>

## Mesh Dependencies

### `src/mesh/index.ts` - Package entry point

---

<a id="plot-dependencies"></a>

## Plot Dependencies

### `src/plot/index.ts` - Package entry point

---

<a id="raster-dependencies"></a>

## Raster Dependencies

### `src/raster/index.ts` - Package entry point

---

<a id="sysml-dependencies"></a>

## Sysml Dependencies

### `src/sysml/index.ts` - Package entry point

---

<a id="tex-dependencies"></a>

## Tex Dependencies

### `src/tex/index.ts` - Package entry point

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

### `src/worker/protocol.ts` - Type definitions (2 interfaces, 1 type aliases)

**Internal Dependencies:**
| File | Imports | Type |
|------|---------|------|
| `../types.ts` | `InputType, OutputFormat, RenderOptions` | Import (type-only) |

**Exports:**
- Interfaces: `WorkerJob`, `BackendOutput`
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

<a id="dependency-matrix"></a>
## Dependency Matrix

### File Import/Export Matrix

| File | Imports From | Exports To |
|------|--------------|------------|
| `src/core` | 6 files | 1 file |
| `src/errors` | 0 files | 5 files |
| `src/index` | 5 files | 0 files |
| `src/types` | 0 files | 4 files |
| `src/config` | 1 file | 2 files |
| `src/worker/protocol` | 1 file | 2 files |
| `src/worker/run` | 2 files | 1 file |
| `src/pairs` | 1 file | 1 file |
| `src/registry` | 0 files | 2 files |
| `src/worker/entry` | 2 files | 0 files |
| `src/browser/index` | 0 files | 0 files |
| `src/graph/index` | 0 files | 0 files |
| `src/html/index` | 0 files | 0 files |
| `src/math/index` | 0 files | 0 files |
| `src/mermaid/index` | 0 files | 0 files |
| `src/mesh/index` | 0 files | 0 files |
| `src/plot/index` | 0 files | 0 files |
| `src/raster/index` | 0 files | 0 files |
| `src/sysml/index` | 0 files | 0 files |
| `src/tex/index` | 0 files | 0 files |

---

<a id="circular-dependency-analysis"></a>
## Circular Dependency Analysis

**No circular dependencies detected.**
---

<a id="visual-dependency-graph"></a>
## Visual Dependency Graph

```mermaid
graph TD
    subgraph Browser
        N0[index]
    end

    subgraph Root
        N1[config]
        N2[core]
        N3[errors]
        N4[pairs]
        N5[registry]
        N6[types]
    end

    subgraph Graph
        N7[index]
    end

    subgraph Html
        N8[index]
    end

    subgraph Entry
        N9[index]
    end

    subgraph Math
        N10[index]
    end

    subgraph Mermaid
        N11[index]
    end

    subgraph Mesh
        N12[index]
    end

    subgraph Plot
        N13[index]
    end

    subgraph Raster
        N14[index]
    end

    subgraph Sysml
        N15[index]
    end

    subgraph Tex
        N16[index]
    end

    subgraph Worker
        N17[entry]
        N18[protocol]
        N19[run]
    end

    N1 --> N3
    N2 --> N1
    N2 --> N3
    N2 --> N4
    N2 --> N5
    N2 --> N19
    N2 --> N6
    N9 --> N2
    N9 --> N5
    N9 --> N1
    N9 --> N6
    N9 --> N3
    N4 --> N6
    N17 --> N3
    N17 --> N18
    N18 --> N6
    N19 --> N3
    N19 --> N18
```

---

<a id="summary-statistics"></a>
## Summary Statistics

| Category | Count |
|----------|-------|
| Total Source Files | 42 |
| Subsystems | 13 |
| Total Lines of Code | 2305 |
| Total Exports | 75 |
| Total Re-exports | 16 |
| Total Classes | 1 |
| Total Interfaces | 17 |
| Total Functions | 23 |
| Total Type Guards | 0 |
| Total Enums | 0 |
| Type-only Imports | 9 |
| Runtime Cyclic Components | 0 |
| Type-only Cyclic Components | 0 |
| Files in Runtime Cycles | 0 |
| Files in Type-only Cycles | 0 |

---

*Version*: 0.0.0
