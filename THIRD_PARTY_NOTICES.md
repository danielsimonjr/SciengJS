# Third-party notices

This file lists each engine that the engine borrows. It gives the licence of each engine.

The engine package ships this file. A borrowed engine keeps its own licence. The engine does not change the licence of any borrowed engine.

Version: each row gives the version that the engine pins.

## Borrowed engines

| Stage | Engine | Licence | Status |
|---|---|---|---|
| graph | `@viz-js/viz` 3.31.0 (Graphviz 16.1.0 compiled to WASM) | Wrapper: MIT. Graphviz: EPL-2.0 | a dependency |
| math | `@mathjax/src` 4.1.3 (MathJax, with the Newcm math font and the packages it installs; see "MathJax") | Apache-2.0 for MathJax and the math font; the other packages are listed under "MathJax" | a dependency |
| tex | The own WASM build of `tex.web` with `etex.ch` (trials T5 and T6) | The "tex" stage of the design gives the licence of each input | downloaded in the core bundle |
| tex | TeX packages (bundles) | LPPL, public domain, OFL or GFL. Each package keeps its own licence (see "TeX toolchain and packages") | downloaded in the bundles |
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

The tex stage downloads its bundles on first use. The engine package holds no TeX package file and no font file. The engine package holds the pinned sha256 of each bundle in `src/tex/bundles.json`. There are four bundle files: `scieng-tex-core.sctb`, `scieng-tex-diagrams.sctb`, `scieng-tex-science.sctb` and `scieng-tex-math.sctb`. They hold unmodified files of the TeX Live 2023 archives in the table. The archives come from `tlnet-final`. Each has a sha256 pin in `tools/tex/config.json`. The core bundle also holds the WASM build of `tex.web` with `etex.ch` and the format `scieng.fmt`.

The column Licence gives the `catalogue-license` field of `texlive.tlpdb` of TeX Live 2023, as written there. The values have these meanings. `lppl`, `lppl1.3` and `lppl1.3c` are the LaTeX Project Public License. `ofl` is the SIL Open Font License. `pd` is public domain. `knuth` is the licence of the Computer Modern TFM files and the Knuth library files. The package `pgf` lists the LPPL, the GPL 2 and the FDL. The engine uses the LPPL. The package `circuitikz` lists the LPPL and the GPL; the engine uses the LPPL. The Type 1 outlines of Computer Modern and of the AMS fonts come from `amsfonts` (OFL). Latin Modern (`lm`, GFL) is not in a bundle. No sample glyph needed Latin Modern. No package with the GPL as its only licence is in a bundle.

| Package | Archive | Licence | Used in |
|---|---|---|---|
| amscls | `amscls.tar.xz` | lppl1.3c | extra bundles |
| amsfonts | `amsfonts.tar.xz` | ofl | format and core bundle, and the extra bundles |
| amsmath | `amsmath.tar.xz` | lppl1.3c | extra bundles |
| babel | `babel.tar.xz` | lppl1.3 | format and core bundle |
| bussproofs | `bussproofs.tar.xz` | lppl1.3 | extra bundles |
| chemfig | `chemfig.tar.xz` | lppl1.3c | extra bundles |
| chemgreek | `chemgreek.tar.xz` | lppl1.3 | extra bundles |
| circuitikz | `circuitikz.tar.xz` | lppl gpl | format and core bundle |
| cm | `cm.tar.xz` | knuth | format and core bundle |
| etoolbox | `etoolbox.tar.xz` | lppl1.3c | extra bundles |
| firstaid | `firstaid.tar.xz` | lppl1.3c | format and core bundle |
| graphics | `graphics.tar.xz` | lppl1.3c | format and core bundle |
| graphics-cfg | `graphics-cfg.tar.xz` | pd | format and core bundle |
| graphics-def | `graphics-def.tar.xz` | lppl1.3c | format and core bundle |
| hobby | `hobby.tar.xz` | lppl1.3c | extra bundles |
| hyphen-base | `hyphen-base.tar.xz` | (no field) | format and core bundle |
| knuth-lib | `knuth-lib.tar.xz` | knuth | format and core bundle |
| l3backend | `l3backend.tar.xz` | lppl1.3c | format and core bundle |
| l3kernel | `l3kernel.tar.xz` | lppl1.3c | format and core bundle |
| l3packages | `l3packages.tar.xz` | lppl1.3c | extra bundles |
| latex | `latex.tar.xz` | lppl1.3c | format and core bundle |
| latex-fonts | `latex-fonts.tar.xz` | lppl | format and core bundle |
| mhchem | `mhchem.tar.xz` | lppl1.3c | extra bundles |
| pgf | `pgf.tar.xz` | lppl1.3c gpl2 fdl | format and core bundle |
| simplekv | `simplekv.tar.xz` | lppl1.3c | extra bundles |
| smartdiagram | `smartdiagram.tar.xz` | lppl1.3 | extra bundles |
| standalone | `standalone.tar.xz` | lppl1.3 | format and core bundle |
| tikz-3dplot | `tikz-3dplot.tar.xz` | lppl1.3 | extra bundles |
| tikz-cd | `tikz-cd.tar.xz` | lppl1.3 | extra bundles |
| tools | `tools.tar.xz` | lppl1.3c | format and core bundle |
| unicode-data | `unicode-data.tar.xz` | lppl1.3c | format and core bundle |
| xcolor | `xcolor.tar.xz` | lppl1.3c | format and core bundle |
| xkeyval | `xkeyval.tar.xz` | lppl1.3 | format and core bundle |
| xstring | `xstring.tar.xz` | lppl1.3c | extra bundles |

### Files of Knuth (TeX Live 2023)

The licence of Knuth permits copies of an unchanged file. A changed file must have a new name. The build reads these files unchanged from the archives in the table above. This section quotes the licence lines of the files that carry them.

`fonts/source/public/cm/cmbase.mf` (package `cm`), lines 1 and 2:

```
% THIS IS THE OFFICIAL COMPUTER MODERN SOURCE FILE cmbase.mf BY D E KNUTH.
% IT MUST NOT BE MODIFIED IN ANY WAY UNLESS THE FILE NAME IS CHANGED!
```

`tex/generic/hyphen/hyphen.tex` (package `hyphen-base`), lines 1 to 4:

```
% The Plain TeX hyphenation tables [NOT TO BE CHANGED IN ANY WAY!]
% Unlimited copying and redistribution of this file are permitted as long
% as this file is not modified. Modifications are permitted, but only if
% the resulting file is not named hyphen.tex.
```

The format build reads `hyphen.tex` and puts its patterns into the format `scieng.fmt`. The file lists of the bundles in `tools/tex/config.json` name neither `hyphen.tex` nor `cmbase.mf`. They name no run file of the package `knuth-lib`. The Computer Modern TFM files of the package `cm` are binary metric data and have no licence line.

### Template method credit

The package detection of the `tex` stage follows the templater of the Upmath renderer (`parpalak/i.upmath.me`, MIT). The engine credits that project for the method. Copyright 2015-2025 Roman Parpalak. Licence: MIT. The method is `lib/Templater.php` of that project. The templater tests the source for known environments and known commands. The templater adds the package that each environment or command needs. `src/tex/detect.ts` follows that method with its own tables and its own code. `src/tex/detect.ts` copies no code of the templater.

### Trial T2 sample files (LGPL-2.0-or-later, LGPL-2.1 and Apache-2.0)

The folder `test/corpus/mesh/` holds three CAD test files from other projects. The engine package does not ship them. The licence texts are in `test/corpus/mesh/LICENSES/`. The source, commit and SHA-256 of each file are in `test/corpus/mesh/README.md`.

- `red_cube_blue_cylinder.step`, from CadQuery: Apache-2.0.
- `cube-10x10mm.igs`, from occt-import-js: LGPL-2.1.
- `cylinder1.brep`, from FreeCAD: LGPL-2.0-or-later.
