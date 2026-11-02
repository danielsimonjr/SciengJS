# Third-party notices

This file lists each engine that the engine borrows. It gives the licence of each engine.

The engine package ships this file. A borrowed engine keeps its own licence. The engine does not change the licence of any borrowed engine.

Version: each row gives the version that the engine pins.

## Borrowed engines

| Stage | Engine | Licence | Status |
|---|---|---|---|
| graph | `@viz-js/viz` 3.31.0 (Graphviz 16.1.0 compiled to WASM) | Wrapper: MIT. Graphviz: EPL-2.0 | a dependency |
| math | `@mathjax/src` | Apache-2.0 | not yet a dependency |
| tex | TikZJax toolchain (TeX compiled to WASM) | LPPL-1.3c. The licence of each other toolchain part is an open item of the T3 trial | not yet a dependency |
| tex | TeX packages (bundles) | Mostly LPPL. Each package keeps its own licence | not yet a dependency |
| mesh | `occt-import-js` (OpenCascade compiled to WASM) | LGPL-2.1 | not yet a dependency |
| mesh | `manifold-3d` | Apache-2.0 | not yet a dependency |
| mesh (viewer page) | `three` | MIT | not yet a dependency |
| raster | `@resvg/resvg-wasm` 2.6.2 | MPL-2.0 | a dependency |
| raster | Liberation Serif Regular 2.1.5 (font, in `assets/fonts/`) | SIL Open Font License 1.1 | bundled |
| html | `parse5` | MIT | not yet a dependency |
| browser | Chromium or Google Chrome | Installed by the user. The engine does not ship it | not a package dependency |

## Notices

### Graphviz (EPL-2.0)

Graphviz is licensed under the Eclipse Public License 2.0. The wrapper `@viz-js/viz` is licensed under MIT. The package does not ship a Graphviz licence file. The licence text of Graphviz is in `assets/licenses/EPL-2.0.txt`. The source repository of the wrapper is https://github.com/mdaines/viz-js.

### OpenCascade (LGPL-2.1)

`occt-import-js` is licensed under the GNU Lesser General Public License 2.1. The WASM file stays a separate, unmodified file.

### resvg (MPL-2.0)

`@resvg/resvg-wasm` is licensed under the Mozilla Public License 2.0. The WASM file stays a separate, unmodified file. The licence text is in `assets/licenses/MPL-2.0.txt`.

### Liberation Serif (SIL Open Font License 1.1)

The font `assets/fonts/LiberationSerif-Regular.ttf` is Liberation Serif Regular, version 2.1.5. The font is licensed under the SIL Open Font License, Version 1.1. The engine does not modify the font. The copyright line of the font is: Digitized data copyright (c) 2010 Google Corporation with Reserved Font Arimo, Tinos and Cousine. Copyright (c) 2012 Red Hat, Inc. The licence text is in `assets/fonts/LiberationSerif-Regular.LICENSE.txt`.

### TeX toolchain and packages

The TikZJax toolchain is licensed under the LaTeX Project Public License 1.3c. TeX packages keep their own licences, mostly the LPPL. The font set licence is an open item of the T3 trial.

### Template method credit

The package detection of the `tex` stage follows the templater of the Upmath renderer (`parpalak/i.upmath.me`, MIT). The engine credits that project for the method.

### Trial T2 sample files (LGPL-2.0-or-later, LGPL-2.1 and Apache-2.0)

The trial folder `trials/t2-mesh/samples/` holds three CAD test files from other projects. The engine package does not ship them. The licence texts are in `trials/t2-mesh/samples/LICENSES/`. The source, commit and SHA-256 of each file are in `trials/t2-mesh/samples/README.md`.

- `red_cube_blue_cylinder.step`, from CadQuery: Apache-2.0.
- `cube-10x10mm.igs`, from occt-import-js: LGPL-2.1.
- `cylinder1.brep`, from FreeCAD: LGPL-2.0-or-later.
