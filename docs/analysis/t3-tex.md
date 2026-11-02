# T3 tex: trial report

## Question

Can the TikZJax toolchain build a format with `tikz` and `circuitikz`? Can that format run outside a browser under Bun 1.4.4 and Node 22? Does it give SVG with glyphs as paths?

Exit numbers:

- The compressed size of the format.
- The first-render time and the warm-render time (median) of one `circuitikz` circuit.
- The first-render time and the warm-render time (median) of one `pgfplots` plot, with the `pgfplots` bundle loaded at run time.
- The SVG glyph check.
- The exact TeX engine of the toolchain.
- The licence of each toolchain part and of the font set.

Design sources: `docs/superpowers/specs/2026-11-01-scieng-engine-design.md`, sections "tex" and "Local", and the dependency row "tex". Plan: `docs/superpowers/plans/2026-11-01-scieng-engine-build.md`, section "T1 to T4".

## Verdict

**The trial holds with changes.**

- The format builds in CI from pinned sources. It holds `tikz` and `circuitikz`. Build time: 28.8 s.
- The format and its bundles run outside a browser. All six render jobs (three systems, two runtimes) render both samples. Each job ends with the result `success`.
- The SVG output does not hold the glyph requirement. The converter writes glyphs as `<text>` elements with a `font-family` attribute. It writes no `<path>` glyphs. A glyph-to-path step is a required change.
- The licence set blocks the design as written. The toolchain parts are GPL-3.0 (`package.json` of two parts), not LPPL-1.3c as the design table states. One part has a conflicting licence. See "Licences".

The numbers come from CI run `41395234104`, head commit `7339ced`. The format artifact and the six render artifacts of that run hold the raw files.

## Platform and versions

| Item | Value | Source |
|---|---|---|
| TeX engine | e-TeX 2.6 on TeX 3.141592653 | `engine-banner-lines.txt` in the format artifact; `texk/tex.web` line 193; `etexdir/etex.ch` line 197 |
| Banner printed by a render | `This is e-TeX, Version 3.141592653-2.6` | first line of each `*.log` in the render artifacts |
| LaTeX kernel | `LaTeX2e <2023-11-01> patch level 1` | `*.log` files |
| TeX Live (apt) | `texlive-base` 2023.20240207-1, `texlive-latex-base` 2023.20240207-1, `texlive-pictures` 2023.20240207-1, `texlive-fonts-recommended` 2023.20240207-1, `texlive-binaries` 2023.20230311.66589-9build3 | `apt-versions.txt` |
| kpathsea | 6.3.5 | `kpsewhich-version.txt` |
| binaryen (wasm-opt) | 108 (Ubuntu package `binaryen` 108-1) | `wasm-opt-version.txt` |
| web2js | commit `0114ef5905dc387b70e72c654bcedd3b52b29fad` | `web2js-commit.txt`; `config.json` |
| dvi2html | npm `@drgrice1/dvi2html` 0.0.7-beta4, exact pin | `package.json`, `package-lock.json` |
| Node | 22.23.4 on all systems | `node-version.txt` |
| Bun | 1.4.4 on all systems | `runtimeVersion` in each result JSON |
| Systems | `ubuntu-latest` (x64), `windows-latest` (x64), `macos-latest` (arm64) | `platform` and `arch` in each result JSON |

## CI runs and jobs

Run `41395234104` (head `7339ced`), conclusion `success`.

| Job id | Job name | Result |
|---|---|---|
| 125115015006 | build the format (ubuntu-latest) | success |
| 125115674189 | render (macos-latest, node) | success |
| 125115674262 | render (macos-latest, bun) | success |
| 125115674243 | render (ubuntu-latest, node) | success |
| 125115674282 | render (ubuntu-latest, bun) | success |
| 125115674190 | render (windows-latest, node) | success |
| 125115674311 | render (windows-latest, bun) | success |

Earlier runs on the branch failed. Each failure has a fix commit. The causes were five:

- a JSON escape error;
- a TeX control word in a JavaScript string;
- a relative shim path;
- a wrong artifact path;
- a missing job aux file.

## Format

| Item | Value | Source |
|---|---|---|
| Preamble | `\documentclass[margin=0pt]{standalone}`, `\def\pgfsysdriver{pgfsys-ximera.def}`, `\usepackage[svgnames]{xcolor}`, `\usepackage{tikz}`, `\usepackage{circuitikz}` | `config.json` |
| Uncompressed `core.dump` | 163,840,000 bytes (2,500 pages of 65,536 bytes) | `sizes-raw.jsonl` |
| `core.dump` compressed, gzip level 9, `zlib` | 6,536,526 bytes | `sizes-raw.jsonl` |
| `core.dump` compressed, brotli quality 11 | 3,647,008 bytes | `sizes-raw.jsonl` |
| `core.dump.gz` file in the artifact (`gzip -9`) | 6,399,152 bytes | artifact `format/core.dump.gz` |
| `tex.wasm` (asyncify, `wasm-opt -O4`) | 520,950 bytes raw, 129,144 gzip, 96,789 brotli | `sizes-raw.jsonl` |

The `gzip` command and the `zlib` module disagree by 137,374 bytes on the same file. The report uses the file that the artifact holds (6,399,152 bytes) as the format size. The brotli size comes from `zlib`.

### Build time

| Stage | Time (ms) | Source |
|---|---|---|
| jison (parser) | 369 | `build-timing.txt` |
| tie (merge of `tex.web` and the change files) | 25 | `build-timing.txt` |
| tangle | 42 | `build-timing.txt` |
| compile (`compile.js`, Binaryen) | 4,015 | `build-timing.txt` |
| wasm-opt (asyncify) | 6,454 | `build-timing.txt` |
| format (two passes and the memory dump) | 28,800 | `build-timing.txt` |

## Render results

Each sample renders in a single process. The first render includes the first call of the run. The warm median is the median of the later renders in the same process. The circuit uses 20 warm renders. The `pgfplots` plot uses 5.

### Load

| System | Runtime | Gunzip of `core.dump.gz` (ms) | WASM compile (ms) |
|---|---|---|---|
| macos-latest | Bun 1.4.4 | 316 | 29.3 |
| macos-latest | Node 22.23.4 | 373 | 3.2 |
| ubuntu-latest | Bun 1.4.4 | 226 | 10.0 |
| ubuntu-latest | Node 22.23.4 | 338 | 2.7 |
| windows-latest | Bun 1.4.4 | 149 | 12.3 |
| windows-latest | Node 22.23.4 | 225 | 33.4 |

### Circuit (voltage divider, `circuitikz`)

| System | Runtime | First TeX render (ms) | First DVI to SVG (ms) | Warm TeX median (ms) |
|---|---|---|---|---|
| macos-latest | Bun | 757 | 27 | 511 |
| macos-latest | Node | 1,066 | 35 | 411 |
| ubuntu-latest | Bun | 768 | 26 | 642 |
| ubuntu-latest | Node | 724 | 19 | 471 |
| windows-latest | Bun | 742 | 25 | 599 |
| windows-latest | Node | 602 | 18 | 399 |

### Plot (`pgfplots`, bundle loaded at run time)

| System | Runtime | First TeX render (ms) | First DVI to SVG (ms) | Warm TeX median (ms) |
|---|---|---|---|---|
| macos-latest | Bun | 1,234 | 4 | 1,298 |
| macos-latest | Node | 1,586 | 13 | 1,431 |
| ubuntu-latest | Bun | 1,871 | 6 | 1,843 |
| ubuntu-latest | Node | 1,289 | 7 | 1,327 |
| windows-latest | Bun | 1,821 | 7 | 1,807 |
| windows-latest | Node | 1,343 | 8 | 1,184 |

The `pgfplots` bundle has 43 files. The raw size is 2,041,928 bytes. The sum of the per-file gzip sizes is 434,098 bytes. The sum of the per-file brotli sizes is 356,356 bytes. Source: `pgfplots-bundle.json` and `pgfplots-bundle-sizes.jsonl`.

### Negative test

Without the `pgfplots` bundle, the `pgfplots` sample stops with `! Undefined control sequence.` and writes no DVI. This holds in all six jobs.

## SVG glyph check

Source: the SVG and the converter HTML of each render artifact.

| Sample | `<text>` elements | `font-family` attributes | `<path>` elements | Font names |
|---|---|---|---|---|
| circuit | 8 | 8 | 6 | `cmr10`, `cmr7`, `cmmi10`, `cmmi7`, `cmsy10` |
| pgfplots | 16 | 16 | 5 | `cmr10`, `cmr7`, `cmmi10`, `cmsy10` |

All six jobs give the same counts.

The `url(` string in the `pgfplots` SVG is a clip path reference, `url(#pgfcp1)`. This string is not a font reference.

The converter (`src/text.ts`, lines 149-150) writes `<text font-family="...">`. The converter (`src/html.ts`, line 137) writes a span with `font-family` outside an SVG picture. Glyph outlines are not in the bundle: the bundle holds TFM metrics only. So the output can not hold glyph paths as shipped.

## Font set

The font set is Computer Modern, from the TFM files of TeX Live (`cmr10.tfm`, and others). The bundle holds metrics only. The outline fonts of the browser build (Bakoma OpenType, from `bakoma.zip`) were not fetched in this trial. The licence of the Bakoma files is therefore not read. Their licence is a required check before a glyph-to-path step uses them.

## Licences

Each row names the file that the licence came from. The licence text for a TeX package is in its own file header or in the TeX Live copyright file.

| Part | Licence as read | Source (file and line) | Note |
|---|---|---|---|
| TeX engine source, `tex.web` | Copyright (C) 1982 by D. E. Knuth; all rights are reserved | `texk/tex.web` line 1 (web2js at the pin) | Only line 1 is read. The permission text of the file is not read in this trial. |
| e-TeX change file `etex.ch` | e-TeX copyright, P. Breitenlohner, with the NTS notice | `etexdir/etex.ch` lines 6 and 33 | The full permission text is not read. |
| web2js (compiler and runtime glue) | `GPL-3.0` | `package.json` `"license"` | `LICENSE.md` text names "Math-expression", a different project, and gives GPL v3 and Apache v2. The licence file does not match the package. |
| TikZJax fork (`drgrice1/tikzjax`) | `GPL-3.0+` | `package.json` line 9 | No `LICENSE` file at the root. The GitHub licence field is empty. The original `kisonecat/tikzjax` says LPPL-1.3c (`licenseInfo`). The trial uses no file of the fork. |
| dvi2html (`drgrice1/dvi2html`) | MIT in the repository, GPL-3.0 in the npm package | `LICENSE` at the pin (`The MIT License (MIT)`, Mitch Anderson, 2015); `package.json` `"license": "GPL-3.0"` | The two statements conflict. The trial treats the package as GPL-3.0. |
| TeX Live base and LaTeX | LPPL 1.3c and other licences per file | `texlive-latex-base.copyright` in the licence artifact | The copyright file names the licences of each part. |
| pgf and tikz | LPPL 1.3c, or GPL (choice) | `pgf.sty` and `tikz.code.tex` headers in the bundle (`% 1. under the LaTeX Project Public License and/or 2. under the GNU Public License`) | Dual licence. |
| circuitikz | LPPL 1.3c, or GPL (choice) | `circuitikz.sty` header in the bundle | Dual licence. The header names `gpl-3.0_license.txt` and `lppl-1-3c_license.txt`. |
| pgfplots | GPL, version 3 or later | `pgfplots.sty` and `pgfplots.code.tex` headers in the `pgfplots` bundle | Single licence named in the header. |
| Computer Modern fonts (TFM metrics in TeX Live) | Knuth public domain, with a name restriction | `texlive-fonts-recommended.copyright`, section 3.3, item (2) | The names `cmr10` and similar may not be used for fonts with other metrics. |
| Bakoma outline fonts (browser build only) | not read | not fetched | Required before use. |
| DVI converter (see dvi2html row) | see the dvi2html row | | |
| binaryen | Not read. The copyright file names the upstream and its copyright holders only | `binaryen.copyright` in the licence artifact | Build time only. |

## Commands

The build job runs these commands (see `.github/workflows/trial-t3.yml`):

```sh
npm ci --ignore-scripts
git clone https://github.com/drgrice1/web2js.git build/web2js && git -C build/web2js checkout 0114ef5905dc387b70e72c654bcedd3b52b29fad
node ../../node_modules/.bin/jison parser.jison          # in build/web2js
tie -m tex.web texk/tex.web $(cat changes/change-order)
tangle -underline tex.web
NODE_OPTIONS=--max-old-space-size=8192 node compile.js tex.p out.wasm
wasm-opt --asyncify --pass-arg=asyncify-ignore-indirect --pass-arg=asyncify-imports@library.reset,library.getfilesize -O4 out.wasm -o tex.wasm
SCIENG_TEX_LOOKUP=kpsewhich node tools/build-format.cjs # in build/web2js
node tools/make-bundle.mjs build/format-raw/initex-files.json build/out/bundles/base
node tools/collect.mjs build/format-raw samples/pgfplots.tex build/collect-work build/used-pgfplots.json
node tools/make-bundle.mjs build/used-pgfplots.json build/out/bundles/pgfplots build/out/bundles/base/manifest.json
```

The measure job runs `node tools/measure.mjs` (or `bun tools/measure.mjs`) with `SCIENG_TEX_LOOKUP=bundles`, the bundle root, the format directory and an empty work directory.

## Deviations from the design and the plan

1. **Toolchain.** The trial uses the `drgrice1` fork of TikZJax and its `web2js` and `dvi2html`. The original `kisonecat/tikzjax` has no build chain for `tex.wasm`. Its last push is 2024-07-06.
2. **Licence of the design table.** The design says LPPL-1.3c for TikZJax. The pinned fork says GPL-3.0+. `web2js` says GPL-3.0. `dvi2html` says MIT in its repository and GPL-3.0 in its package. A GPL dependency in an MIT engine needs a decision (see "Changes").
3. **Runtime.** The trial runs the `web2js` node runner (`library.js`). The trial does not run the browser library of the fork (`src/library.js`, which loads files over `fetch`). A small shim replaces the `node-kpathsea` addon. The shim (`trials/t3-tex/shim/index.cjs`) resolves names from bundle manifests. The trial therefore has no native code on any system.
4. **TeX Live version.** apt installs TeX Live 2023 (Ubuntu 24.04 archive). The versions are recorded, not pinned to a TeX Live year. The web2js README says the build is known to work with TeX Live 2023.
5. **Job aux file.** LaTeX reads `<jobname>.aux` at `\end{document}`. The harness writes an empty aux file for each run and registers it with the shim. A name normaliser strips `TeXinputs:` and quotes from TeX names.
6. **Bundles.** The `base` bundle includes `latex.fmt` (21 MB), which the run does not read. The bundle total is 28,388,383 bytes. The `pgfplots` bundle is collected by one render in the build job, not from the `.resolved.json` mechanism of the fork.
7. **Glyphs.** The bundle holds no outline fonts. The output therefore has `<text>` elements, not glyph paths.
8. **Artifacts.** The format is built in CI and uploaded as an artifact (`t3-tex-format`, 13.4 MB). Nothing of the format is committed.

## Changes required before the design can hold

1. Add a glyph-to-path step after the DVI conversion. It needs outline fonts for the Computer Modern names in the output. Check the licence of the outline fonts before use.
2. Resolve the licence of the converter. Either use a converter under a licence that the engine accepts, or replace the converter. Record the choice in the design table, which currently says LPPL-1.3c.
3. Drop `latex.fmt` from the runtime bundle, or leave it out of the `base` manifest.
4. Pin the TeX Live packages to one TeX Live year, or record the apt versions in the design.

## Files

- `trials/t3-tex/config.json`, `trials/t3-tex/package.json`, `trials/t3-tex/package-lock.json`.
- `trials/t3-tex/shim/index.cjs`, `trials/t3-tex/tools/` (`build-format.cjs`, `tex-engine.mjs`, `make-bundle.mjs`, `collect.mjs`, `measure.mjs`, `sizes.mjs`).
- `trials/t3-tex/samples/circuit.tex`, `trials/t3-tex/samples/pgfplots.tex`.
- `.github/workflows/trial-t3.yml`.
