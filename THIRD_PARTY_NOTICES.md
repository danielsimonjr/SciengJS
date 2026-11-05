# Third-party notices

This file lists each engine that the engine borrows. It gives the licence of each engine.

The engine package ships this file. A borrowed engine keeps its own licence. The engine does not change the licence of any borrowed engine.

Version: each row gives the version that the engine pins.

## Borrowed engines

| Stage | Engine | Licence | Status |
|---|---|---|---|
| graph | `@viz-js/viz` 3.31.0 (Graphviz 16.1.0 compiled to WASM) | Wrapper: MIT. Graphviz: EPL-2.0 | a dependency |
| math | `@mathjax/src` 4.1.3 (MathJax, with the Newcm math font and the packages it installs; see "MathJax") | Apache-2.0 for MathJax and the math font; the other packages are listed under "MathJax" | a dependency |
| tex | The own WASM build of `tex.web` with `etex.ch` (trials T5 and T6) | The "tex" stage of the design gives the licence of each input | not yet a dependency |
| tex | TeX packages (bundles) | LPPL or public domain only. Each package keeps its own licence | not yet a dependency |
| mesh | `occt-import-js` 0.0.23 (OpenCascade compiled to WASM) | LGPL-2.1 | a dependency |
| mesh | `manifold-3d` 3.2.1 (Manifold compiled to WASM) | Apache-2.0 | a dependency |
| mesh | `manifold-3d` | Apache-2.0 | not yet a dependency |
| mesh (viewer page) | `three` 0.187.0 (six pinned module files, copied into the assets folder at build) | MIT | a devDependency. The browser stage serves the copies to pages |
| browser | `mermaid` 11.17.2 (the pinned build `dist/mermaid.min.js`, copied into the assets folder at build) | MIT | a devDependency. The browser stage serves the copy to pages |
| raster | `@resvg/resvg-wasm` 2.6.2 | MPL-2.0 | a dependency |
| raster | Liberation Serif Regular 2.1.5 (font, in `assets/fonts/`) | SIL Open Font License 1.1 | bundled |
| html | `parse5` | MIT | not yet a dependency |
| plot (html output) | `plotly.js-dist-min` 4.2.0 (the pinned Plotly build, loaded by the html page from a CDN with a subresource integrity hash) | MIT | a devDependency. The package does not ship the build. The html page loads it from the CDN |
| browser | Chromium or Google Chrome | Installed by the user. The engine does not ship it | not a package dependency |

## Notices

### Graphviz (EPL-2.0)

The Eclipse Public License 2.0 applies to Graphviz. The MIT licence applies to the wrapper `@viz-js/viz`. The package does not ship a Graphviz licence file. The licence text of Graphviz is in `assets/licenses/EPL-2.0.txt`. The MIT licence text of the wrapper is in `assets/licenses/MIT-viz-js.txt`, copied from the tag `release-viz-3.31.0` of the source repository https://github.com/mdaines/viz-js. The npm package does not ship this file.

### MathJax (Apache-2.0, with other licences for transitive packages)

`@mathjax/src` 4.1.3 and `@mathjax/mathjax-newcm-font` 4.1.3 are under the Apache License 2.0. The math stage bundles the font ranges into the package. The package installs the packages in the table below. The engine loads `@mathjax/src` only, so the other packages are not in the render path. The table gives each installed package, its version and its licence, from its `package.json`.

| Package | Version | Licence |
|---|---|---|
| `@mathjax/src` | 4.1.3 | Apache-2.0 |
| `@mathjax/mathjax-newcm-font` | 4.1.3 | Apache-2.0 |
| `mhchemparser` | 4.2.1 | Apache-2.0 |
| `mj-context-menu` | 1.0.0 | Apache-2.0 |
| `speech-rule-engine` | 5.0.0-rc.4 | Apache-2.0 |
| `@xmldom/xmldom` | 0.9.12 | MIT |
| `wicked-good-xpath` | 1.3.0 | MIT |
| `commander` | 14.0.3 (installed under `speech-rule-engine`) | MIT |
| `balanced-match` | 4.0.4 | MIT |
| `brace-expansion` | 5.0.12 | MIT |
| `@isaacs/nonrecursive-glob-match` | 1.0.3 | BlueOak-1.0.0 |
| `glob` | 14.0.3 | BlueOak-1.0.0 |
| `minimatch` | 11.0.4 | BlueOak-1.0.0 |
| `minipass` | 7.1.3 | BlueOak-1.0.0 |
| `package-json-from-dist` | 1.0.1 | BlueOak-1.0.0 |
| `path-scurry` | 3.0.0 | BlueOak-1.0.0 |
| `lru-cache` | 11.5.3 | BlueOak-1.0.0 |
| `rimraf` | 6.1.4 | BlueOak-1.0.0 |

The Apache License 2.0 applies to the MathJax packages. The BlueOak Model License 1.0.0 applies to the glob packages. The MIT licence applies to the other packages. Each package keeps its own licence text in its installed folder. The `dist/` folder holds the compiled code of this package only. It holds no code of the packages in the table: npm installs them as dependencies.

### Plotly (MIT)

The MIT licence applies to `plotly.js-dist-min` 4.2.0. The package is a devDependency. The engine does not bundle the build into the package and does not copy it into the assets folder. The html output of the `plot` stage is a page. The page loads the pinned build from the CDN URL in the engine, with a subresource integrity hash. The page makes that request when a reader opens it. The licence text is in the installed package at `node_modules/plotly.js-dist-min/LICENSE`.

### Mermaid (MIT)

The MIT licence applies to `mermaid` 11.17.2. The build writes the file mermaid.min.js into the assets folder. That file is generated at build time and is not committed. The licence text is in `assets/licenses/MIT-mermaid.txt`.

The file mermaid.min.js also holds the code of the runtime dependencies of `mermaid`. Each of these packages keeps its own licence:

- MIT: `cytoscape`, `cytoscape-cose-bilkent`, `cytoscape-fcose`, `dagre-d3-es`, `dayjs`, `katex`, `khroma`, `marked`, `roughjs`, `stylis`, `ts-dedent`, `uuid`, `es-toolkit`, `fastdom`, `@braintree/sanitize-url`, `@iconify/utils`, `@upsetjs/venn.js`, `@mermaid-js/parser` and `lodash-es`.
- ISC: `d3` and most of the `d3-*` modules.
- BSD-3-Clause: `d3-sankey`, `d3-ease`, `rw` and the older copies of `d3-array`, `d3-shape` and `d3-path` that `d3-sankey` uses.
- MPL-2.0 OR Apache-2.0: `dompurify`. The engine uses it under the Apache-2.0 licence.
- Apache-2.0: `@chevrotain/types`.
- Unlicense: `robust-predicates`.

The file `assets/licenses/mermaid-bundle.txt` holds the licence text of each of the 79 packages, with its name and version. The script `scripts/mermaid-licenses.mjs` writes that file from the installed `mermaid` package. Run the script again after a change of the pinned Mermaid version.

### Three.js (MIT)

The MIT licence applies to `three` 0.187.0. The package is a devDependency. The build copies six files of the package into the assets folder: three.module.js, three.core.js, three.OrbitControls.js, three.GLTFLoader.js, three.BufferGeometryUtils.js and three.SkeletonUtils.js. Those copies are generated at build time and are not committed. The html output of the mesh stage is a page. The page loads the six pinned files from the CDN URLs in the engine, with a subresource integrity hash for each file. The browser stage fulfils the same URLs from the copies in the assets folder, so a png render makes no network request. The licence text is in `assets/licenses/MIT-three.txt`.

### OpenCascade (LGPL-2.1)

`occt-import-js` 0.0.23 is licensed under the GNU Lesser General Public License 2.1. The WASM file stays a separate, unmodified file. The mesh stage reads STEP, IGES and BREP files through this package. The licence text is in the installed package at `node_modules/occt-import-js/LICENSE.md`.

### Manifold (Apache-2.0)

`manifold-3d` 3.2.1 is licensed under the Apache License 2.0. The package ships no NOTICE file. The WASM file stays a separate, unmodified file. The mesh stage runs the solid operations of CAD documents through this package. The licence text is in the installed package at `node_modules/manifold-3d/LICENSE`.

### resvg (MPL-2.0)

The Mozilla Public License 2.0 applies to `@resvg/resvg-wasm`. The WASM file stays a separate, unmodified file. The source code is in the repository https://github.com/yisibl/resvg-js, which builds the npm package. The licence text is in `assets/licenses/MPL-2.0.txt`.

### Liberation Serif (SIL Open Font License 1.1)

The font `assets/fonts/LiberationSerif-Regular.ttf` is Liberation Serif Regular, version 2.1.5. The font is licensed under the SIL Open Font License, Version 1.1. The engine does not modify the font. The copyright line of the font is: Digitized data copyright (c) 2010 Google Corporation with Reserved Font Arimo, Tinos and Cousine. Copyright (c) 2012 Red Hat, Inc. The licence text is in `assets/fonts/LiberationSerif-Regular.LICENSE.txt`.

### TeX toolchain and packages

This release does not ship the tex stage. The "tex" stage of the design gives the licence of each TeX input. A bundle holds only packages under the LPPL or in the public domain. Each package keeps its own licence.

### Template method credit

The package detection of the `tex` stage follows the templater of the Upmath renderer (`parpalak/i.upmath.me`, MIT). The engine credits that project for the method. Copyright 2015-2025 Roman Parpalak. Licence: MIT. The method is `lib/Templater.php` of that project. The templater tests the source for known environments and commands, and adds the package that each one needs. `src/tex/detect.ts` follows that method with its own tables and its own code. `src/tex/detect.ts` copies no code of the templater.

### Trial T2 sample files (LGPL-2.0-or-later, LGPL-2.1 and Apache-2.0)

The folder `test/corpus/mesh/` holds three CAD test files from other projects. The engine package does not ship them. The licence texts are in `test/corpus/mesh/LICENSES/`. The source, commit and SHA-256 of each file are in `test/corpus/mesh/README.md`.

- `red_cube_blue_cylinder.step`, from CadQuery: Apache-2.0.
- `cube-10x10mm.igs`, from occt-import-js: LGPL-2.1.
- `cylinder1.brep`, from FreeCAD: LGPL-2.0-or-later.
