# T5 tex build: trial report

## Question

Does the engine compiler build `tex.web` to WASM that passes the trip test? Can that build make the format and render one `circuitikz` circuit under Bun 1.4.4 and Node 22, with each glyph as a `<path>`?

Exit numbers:

- The trip test result (the differences from the reference logs).
- The size of the compiler in lines.
- The WASM size.
- The format build time and the compressed format size.
- The first-render time and the warm-render time of the circuit.
- The glyph check.
- The licence of each build input and of each bundle.

Design sources: `docs/superpowers/specs/2026-11-01-scieng-engine-design.md`, section "tex", and the dependency row "tex". Plan: `docs/superpowers/plans/2026-11-01-scieng-engine-build.md`, row "T5 tex build" and the risk rows of T5.

## Verdict

**The trial holds for the build half. The trial fails for the format half. The format half needs a design change.**

- The tangler and the Pascal to WASM compiler of the trial build `tex.web` with no other tool. The build passes the trip test of `tripman.tex`. Each of the four logs differs from the reference in one line only: the banner, which the trial changes from `TeX` to `SET`. `trip.typ` has no difference.
- The build runs the same under Node and Bun. The trip outputs are byte-identical between the two runtimes. The WASM bytes are the same on each system and runtime (see "CI runs and jobs").
- The `texprod` build makes `plain.fmt` from `plain.tex` and `hyphen.tex`. The hyphenation trie has the same size as in the reference build of the TeX author (6075 entries, 181 ops).
- The render path works. Each glyph is one `<path>` from the AMS Type 1 fonts. The SVG holds no `<text>` element.
- The format of the design cannot build on `tex.web`. LaTeX stops at once with `LaTeX requires e-TeX`. `tikz` under the plain format stops at the e-TeX primitive `\ifcsname`. `circuitikz` has no plain TeX entry file. Thus the trial cannot render a `circuitikz` circuit. The trial renders a plain TeX proxy of the circuit labels in place of the `circuitikz` circuit (see "Render").

The numbers come from CI run `41507677109` (head `a15f5ca`), conclusion `success`. The local numbers come from one Windows x64 computer with Node 26.13.0 and Bun 1.4.4.

## Platform and versions

| Item | Value | Source |
|---|---|---|
| TeX program | `tex.web` 3.141592653, with the change files of the trial. Banner: `This is SET, Version 3.141592653` | first line of `trip.log` and `plain.log` in the artifact `t5-build` |
| TeXware | `pltotf.web`, `tftopl.web`, `dvitype.web` from CTAN `systems/knuth/dist/texware` | `config.json` |
| TeX Live file tree (CI, apt) | `texlive-base`, `texlive-fonts-recommended`, `texlive-latex-base`, `texlive-latex-extra`, `texlive-pictures`: each 2023.20240207-1 | `apt-versions.txt` |
| pgf (CI / local) | 3.1.10 / 3.1.12 | `pgf-version.txt`; `pgf.revision.tex` of `pgf.tar.xz` |
| `circuitikz` (local) | 1.8.7 | `circuitikz.sty` line 19 of `circuitikz.tar.xz` |
| AMS Type 1 fonts | amsfonts 3.04 (CTAN, local); the TeX Live 2023 copies (CI) | `README`; `font-dirs.txt` |
| Node | 22.23.4 on all systems | `node-version.txt` |
| Bun | 1.4.4 on all systems | `bun-version.txt` |
| Systems | `ubuntu-latest` (x64), `windows-latest` (x64), `macos-latest` (arm64) | `platform` in each `build.json` |

## CI runs and jobs

Run `41507677109` (head `a15f5caaf775c03fa5fdb2c66c637b0e61b92c5d`), conclusion `success`. This run is the first run on the branch.

| Job id | Job name | Result |
|---|---|---|
| 125491020994 | build, trip test and format (ubuntu-latest) | success |
| 125491753185 | trip test and render (ubuntu-latest, node) | success |
| 125491753353 | trip test and render (ubuntu-latest, bun) | success |
| 125491754048 | trip test and render (windows-latest, node) | success |
| 125491753237 | trip test and render (windows-latest, bun) | success |
| 125491753356 | trip test and render (macos-latest, node) | success |
| 125491753220 | trip test and render (macos-latest, bun) | success |

Each measure job builds the five programs again from the pinned sources. `compare-builds.mjs` compares the WASM sha256 of each program with the build job. All five programs agree in all six jobs.

The output bytes are the same in each job:

| Output | sha256 (first 16 digits) | Jobs |
|---|---|---|
| `trip.log` | `672d1d2ed2a0e3a3` | 7 of 7 |
| `labels.dvi` | `863d6401e75adc1e` | 6 of 6 |
| `labels.svg` | `0f56e8ca90b5832c` | 6 of 6, and the local Windows run |

## Build

The build is `trials/t5-tex-build/tools/build.mjs`. The build reads the sources by sha256 from CTAN, tangles each program with its change files and compiles the Pascal to WASM. No other compiler, tangler or WASM tool runs. The build has no npm dependency.

### Size of the compiler

| File | Part | Lines |
|---|---|---|
| `tools/tangle.mjs` | WEB tangler (macros, module names, string pool, change files) | 530 |
| `tools/pascal.mjs` | Pascal lexer, parser and WASM code generator | 1402 |
| `tools/wasm.mjs` | WASM module writer | 177 |
| Total | | 2109 |

The runtime adds 675 lines: `host.mjs` 212, `run.mjs` 41, `vfs.mjs` 44, `tfm.mjs` 23, `type1.mjs` 236 and `dvi2svg.mjs` 119.

### WASM size

| Program | Bytes | gzip -9 | brotli 11 | sha256 (first 16 digits) |
|---|---|---|---|---|
| `textrip` (TeX, trip sizes) | 185,858 | 61,759 | 51,332 | `677bc5f7bd794a73` |
| `texprod` (TeX, production sizes) | 194,463 | 60,599 | 50,376 | `56ab653981ce848c` |
| `pltotf` | 29,899 | 9,742 | 7,857 | `300cdd712284c945` |
| `tftopl` | 22,777 | 7,496 | 6,179 | `0a3d29b11a353704` |
| `dvitype` | 24,717 | 9,318 | 7,722 | `eee181005afc1684` |

The sizes come from `build.json` of the build job. The local build gives the same sha256 values.

The tangle and the compile of `texprod` take 122 ms to 375 ms in the CI jobs (`tangleMs` and `compileMs` in each `build.json`).

`textrip` has the memory sizes of `tripman.tex` Appendix A. `texprod` has the memory sizes of a production build (`changes/tex-prod.ch`), for example 4,000,000 words of main memory. The memory of `texprod` is 1278 WASM pages (83.8 MB). `pltotf`, `tftopl` and `dvitype` are the TeXware programs that the trip test uses.

## Trip test

The trip test follows `tripman.tex`. The driver is `tools/trip.mjs`.

| Step | Program | Result |
|---|---|---|
| 1 | `pltotf` on `trip.pl` | `trip.tfm`, 3116 bytes |
| 1 | `tftopl` on `trip.tfm` | `tmp.pl` is identical to `trip.pl` |
| 3 | `textrip` (first pass) | `tripin.log` and `tripin.fot`: 1 line differs in each (the banner) |
| 4 | `textrip` (second pass) | `trip.log` (7307 lines): 1 line differs (the banner). `trip.fot`: 1 line differs (the banner) |
| 6 | `dvitype` on `trip.dvi` | `trip.typ`: 0 lines differ |

All seven CI jobs give the same differences:

| File | Reference lines | Lines removed / added |
|---|---|---|
| `tripin.log` | 466 | 1 / 1 |
| `tripin.fot` | 90 | 1 / 1 |
| `trip.log` | 7307 | 1 / 1 |
| `trip.fot` | 84 | 1 / 1 |
| `trip.typ` | 1215 | 0 / 0 |

| Run time (ms) | Linux Node | Linux Bun | Windows Node | Windows Bun | macOS Node | macOS Bun |
|---|---|---|---|---|---|---|
| step 3 | 12 | 11 | 13 | 12 | 15 | 10 |
| step 4 | 13 | 19 | 12 | 18 | 15 | 16 |

Second method: the system `diff` gives the same counts as the line differ of the trial on the local run.

The tangler gives the string pool of the reference: "1326 strings of total length 23633".

The trial builds `textrip` a second time with a range check on each array index and each subrange (`T5_CHECK=1`). That build gives the same trip result. No index goes out of its range.

### The glue ratio

The type `real` of `tex.web` holds the glue ratio. Section 186 of `tex.web` reads the integer view of a glue ratio to find an unusual value. With 64-bit storage, 59 lines of `trip.log` and 3 lines of `trip.typ` differ (`glue set ?.?`). With 32-bit storage, all of these lines agree. The build stores `real` as a 32-bit float and computes with 64-bit floats.

## Format

| Format | Build | Size | gzip -9 | brotli 11 | Time |
|---|---|---|---|---|---|
| `trip.fmt` | `textrip` | 52,024 bytes | 24,496 | 16,557 | part of step 3 (10 ms to 15 ms) |
| `plain.fmt` | `texprod` | 340,160 bytes | 98,351 | 74,022 | 49 ms (CI, Linux, Node 22); 63 ms (local, Windows, Node 26) |

`plain.fmt` needs `manfnt.tfm` and the 16 CM fonts of `plain.tex`. `manfnt.tfm` is in the TeX Live archive `knuth-lib.tar.xz`, not in the CTAN folder `fonts/cm/tfm`.

## Probes of the format of the design

| Probe | Input | First error | Source of the requirement |
|---|---|---|---|
| LaTeX kernel | INITEX on `latex.ltx` | `! LaTeX requires e-TeX.` at line 115, then an emergency stop | `ltdirchk.dtx` lines 303-305: `\ifx\eTeXversion\undefined \errmessage{LaTeX requires e-TeX}` (since v1.2b, 2016/10/15) |
| `tikz` | `\input tikz` under `plain.fmt` (pgf 3.1.12) | `! Undefined control sequence.` in `\pgfutil@IfUndefined #1->\ifcsname`, at `pgfutil-common.tex` line 906 | `pgfutil-common.tex` line 110 uses `\ifcsname` (e-TeX) |
| `circuitikz` | file list of `circuitikz` 1.8.7 | not run | The package has `tex/generic`, `tex/latex` and `tex/context` folders. It has no plain TeX entry file. Its generic files need `tikz`. |

The CI job runs the probes on the TeX Live 2023 tree. The CI job gives the same errors at other line numbers: `l.113 {LaTeX requires e-TeX}` and `l.889 \pgfutil@IfUndefined{directlua}` (pgf 3.1.10). See `probe-latex-error.txt` and `probe-tikz-error.txt` in the artifact `t5-build`.

The LaTeX kernel also needs more than e-TeX:

- `ltexpl.dtx` lines 220-258: the kernel needs `\pdffilesize` (or an equal primitive) and `expl3`. Without `\pdffilesize` (or an equal primitive) and `expl3`, the kernel stops.
- `l3bootstrap.dtx` lines 195-213: `expl3` needs e-TeX and the pdfTeX utility primitives, `\expanded` included. The file names the engines with e-TeX and the pdfTeX utility primitives: pdfTeX 1.40.20, XeTeX, LuaTeX 1.10, e-upTeX 3.8.2 and Prote (2021).

Thus no format with LaTeX, `tikz` or `circuitikz` can build on `tex.web` alone.

## Render

The circuit cannot render (see "Probes"). The trial renders `samples/labels.tex` in place of the circuit. The sample holds the labels and the divider equation of the T3 circuit in plain TeX math. The sample has 38 characters in five fonts and one fraction rule. The render runs `texprod` with `plain.fmt`, then the DVI to SVG converter of the trial. `tools/render.mjs` runs one first render and 20 warm renders.

| System | Runtime | WASM compile | First TeX | First SVG | Warm TeX (median of 20) | Warm SVG (median of 20) |
|---|---|---|---|---|---|---|
| Linux x64 | Node 22 | 0.7 | 15.9 | 9.9 | 9.1 | 5.8 |
| Linux x64 | Bun 1.4.4 | 2.9 | 23.5 | 20.0 | 5.5 | 7.6 |
| Windows x64 | Node 22 | 0.8 | 18.1 | 10.2 | 8.8 | 6.8 |
| Windows x64 | Bun 1.4.4 | 3.9 | 23.3 | 21.4 | 4.9 | 9.3 |
| macOS arm64 | Node 22 | 1.2 | 21.9 | 23.4 | 12.2 | 7.4 |
| macOS arm64 | Bun 1.4.4 | 1.7 | 15.6 | 13.2 | 4.1 | 4.4 |

All times are in ms. "TeX" is the run of `texprod` with `plain.fmt`, from the instantiation to the exit. "SVG" is the DVI to SVG step. Thus a first render takes 26 ms to 45 ms. The sum of the two warm medians is 8.5 ms to 19.6 ms. Each job gives the same SVG in all 21 renders.

The warm time of the SVG step includes the read of each Type 1 font, because the converter keeps no font cache between runs.

## Glyph check

| Check | Result in each of the six jobs |
|---|---|
| `<path>` elements | 38 |
| Glyphs drawn | 38 (the sample has 38 characters) |
| Rules (`<rect>`) | 1 (the fraction bar) |
| `<text>` elements | 0 |
| `font-family` attributes | 0 |
| Missing glyphs | 0 |
| Fonts | `cmr10`, `cmr7`, `cmr5`, `cmmi10`, `cmmi7` |

The Type 1 test passes in the build job: 8 tests, 0 failures (`type1-test.txt`).

Each glyph is one `<path>` element with a `transform` and the outline in font units. The outline comes from the charstrings of the AMS Type 1 font. Each rule is one `<rect>`. The SVG holds no `<text>` element and no `font-family` attribute.

The test `test/type1.test.mjs` reads seven AMS fonts (`cmr10`, `cmmi10`, `cmsy10`, `cmex10`, `cmr7`, `cmmi7`, `cmbx10`). For each character of the TFM file, the advance of the charstring agrees with the TFM width to 1/1000 em. Each outline is a set of closed subpaths inside the font bounding box.

Negative test: without `cmr5.pfb`, the converter lists `cmr5:49` and `cmr5:50` as missing, and `render.mjs` ends with exit status 1.

Second method: a local headless Chrome makes a PNG of the SVG. The PNG shows the expected Computer Modern text and the fraction.

## Licences

| Part | Licence as read | Source (file and line) | Note |
|---|---|---|---|
| `tex.web` | "Unlimited copying and redistribution of this file are permitted as long as this file is not modified." A modified file must not have the name `tex.web` | `tex.web` lines 1-5 | The build does not change `tex.web`. The change files hold each change. |
| `tangle.web` | "not copyrighted and can be used freely" | `tangle.web` line 1 | The trial reads it as the reference of the tangler rules. The trial does not build it. |
| `pltotf.web`, `tftopl.web`, `dvitype.web` | "not copyrighted and can be used freely" | line 1 of each file | Trip test tools. |
| `plain.tex` | Unlimited copying while unchanged. A changed file must not have the name `plain.tex` | `plain.tex` lines 4-9 | Unchanged. |
| `hyphen.tex` | Unlimited copying while unchanged | `hyphen.tex` lines 1-3 | Unchanged. |
| `trip.tex`, `trip.pl`, reference logs | The TeX author's files, from `systems/knuth/dist/tex` | CTAN | Test data only. Not in a bundle. |
| CM TFM files | CTAN licence field of the package `cm`: "Knuth License" | `ctan.org/pkg/cm` | Metrics only. |
| AMS Type 1 CM fonts (`cm*.pfb`) | SIL Open Font License 1.1, with a Reserved Font Name (for example `CMR10`), copyright 1997, 2009 AMS | cleartext header of each `.pfb` | The OFL meets the font rule of the design. The build uses the fonts unchanged, so the reserved name has no effect. |
| pgf 3.1.12 (`tikz`) | LPPL and/or GPL | `tikz.code.tex` line 5 | Dual licence. The LPPL applies. |
| `circuitikz` 1.8.7 | LPPL and/or GPL | `circuitikz.sty` lines 8-11 | Dual licence. The LPPL applies. |
| LaTeX kernel, `l3kernel` | LPPL | file headers | Read for the probes only. |
| Trial code (`trials/t5-tex-build/`) | MIT (the licence of the repository) | `LICENSE` | Written for the trial. No code of web2js, TikZJax or dvi2html. |
| WASM builds | Derive from `tex.web` or the TeXware file and the change files of the trial | the rows above | The banner of the TeX build is `SET`, not `TeX`. |
| Bundles | None built | | The format of the design cannot build (see "Probes"). `plain.fmt` derives from `plain.tex`, `hyphen.tex` and the CM TFM files. |

The build uses no GPL tool. The CI job installs the TeX Live file tree with apt, but no TeX Live program runs.

## Downloads

Each download goes into its own new, empty folder. No downloaded script runs.

| File | URL | sha256 |
|---|---|---|
| `tex.web` | `https://mirrors.ctan.org/systems/knuth/dist/tex/tex.web` | `c62ab513ef167e93f71a23bd34f311e243210afd7c7a0f9b779614b71e398324` |
| `tripman.tex` | `https://mirrors.ctan.org/systems/knuth/dist/tex/tripman.tex` | `a3e47254ad87fc3fdba210d61764c93b021740f56465971f5a41103405add48b` |
| `tangle.web` | `https://mirrors.ctan.org/systems/knuth/dist/web/tangle.web` | `60bb22ffeec81e10682ca903c2ccc5ba5c94eb9fe42387a01afc3173e681bf57` |
| `pltotf.web` | `https://mirrors.ctan.org/systems/knuth/dist/texware/pltotf.web` | `52a02570db6abb14a25c396db6dc86e83254a5714a18f3c524cc24c2028fe522` |
| `tftopl.web` | `https://mirrors.ctan.org/systems/knuth/dist/texware/tftopl.web` | `1670918787b215e91dfd9c5ac234e5e0f4017b025ec23928f0cd22ede180eb41` |
| `dvitype.web` | `https://mirrors.ctan.org/systems/knuth/dist/texware/dvitype.web` | `3a2bef07d6613fdb3693b7c3a8bf39f1a220b5cdd19f74275c578be1c287d218` |
| `plain.tex` | `https://mirrors.ctan.org/systems/knuth/dist/lib/plain.tex` | `7c1223b880fa513542a616b86c4fa02d5ee703839427951982d7e311fd9049b2` |
| `hyphen.tex` | `https://mirrors.ctan.org/systems/knuth/dist/lib/hyphen.tex` | `2c18acdc04c1a066aeb1759905e7ca449f0616c314b5ed6aebe55b9d4a89b8d4` |
| `knuth-lib.tar.xz` (`manfnt.tfm`) | `https://mirrors.ctan.org/systems/texlive/tlnet/archive/knuth-lib.tar.xz` | `47f476f35cb04419e7d12667ac6e1a656f5bb2a9496821030490fc132ad85f5b` |
| `pgf.tar.xz` | `https://mirrors.ctan.org/systems/texlive/tlnet/archive/pgf.tar.xz` | `901912098c641860184ec2e1ad53f4bfedfc6a7fbd802d14947bef3d7afa65ee` |
| `latex.tar.xz` | `https://mirrors.ctan.org/systems/texlive/tlnet/archive/latex.tar.xz` | `1ae770eab0866a96186fe4156b7f5d61c17c784be40efd8d971508f5afc08d15` |
| `l3kernel.tar.xz` | `https://mirrors.ctan.org/systems/texlive/tlnet/archive/l3kernel.tar.xz` | `1b08f269dee6863b2ae03292f53509e7c7ef373d4d88b85fdeceffd373337fec` |
| `circuitikz.tar.xz` | `https://mirrors.ctan.org/systems/texlive/tlnet/archive/circuitikz.tar.xz` | `23da8f3d04ce4857a7bb4e3127f8b00f104346d3047808b6864a251bdf99e4ef` |
| `xcolor.tar.xz` | `https://mirrors.ctan.org/systems/texlive/tlnet/archive/xcolor.tar.xz` | `081d28d119901fca408b82a4c12862ed829e45f14a8678034ef02f8ecfd5da54` |
| `standalone.tar.xz` | `https://mirrors.ctan.org/systems/texlive/tlnet/archive/standalone.tar.xz` | `6daa00b081106b1c240a11732155287d9933e612f3e9a045ee40824f68b0ba98` |
| `cmr5.pfb` | `https://mirrors.ctan.org/fonts/amsfonts/pfb/cmr5.pfb` | `84d38aac226b5274baca7a292e2039f5284a35d8a2ae31074a475fad87da310b` |
| `cmr10.pfb` | `https://mirrors.ctan.org/fonts/amsfonts/pfb/cmr10.pfb` | `fdcede8794018df5f2b58f0905fb20a2b418ed8f67b73ee12445855dfbe5b1be` |
| `cmr7.pfb` | same folder | `b37e8671820b0753c6e233eaa3230c6ab9cff04e6c4baee312d60ae261e5aba1` |
| `cmmi10.pfb` | same folder | `e3661061e8aa474d6de5ffa916edceb0e3d8b998862018c147f0357fce00bcd7` |
| `cmmi7.pfb` | same folder | `5b293a581ddb937b02559c3ce1a60184cc434295533204a2cd3864a6ad8a1f53` |
| `cmsy10.pfb` | same folder | `62ee8cef552017551cd3e026a483e700730103eceaad959c87b7730017f59cff` |
| `cmex10.pfb` | same folder | `791b31aa1db8608d0144b3a40fc0fe53383a60f6b00d0e8fd9f06ac4a11df8cb` |
| `cmbx10.pfb` | same folder | `ca41102968b817bf6e8b22fd6de205ca23bf5088218511cce0c8129e1577cb70` |

The CM TFM files come from `https://mirrors.ctan.org/fonts/cm/tfm/`. The probe files `ltdirchk.dtx`, `ltexpl.dtx`, `ltvers.dtx`, `l3bootstrap.dtx` and `pgfutil-common.tex` come from the CTAN folders `macros/latex/base`, `macros/latex/required/l3kernel` and `graphics/pgf/base`. `config.json` pins the 13 sources of the build by sha256. The trip reference files are in that list.

## Commands

The build job runs these commands in `trials/t5-tex-build` (see `.github/workflows/trial-t5.yml`):

```sh
node tools/build.mjs build/src build/out/build
node tools/trip.mjs build/out/build build/src/tex build/out/trip
T5_FONT_DIR=build/out/fonts T5_TFM_DIR=build/out/fonts node --test test/type1.test.mjs
node tools/tex-run.mjs build/out/build build/out/fmt "plain \dump" build/src/lib build/out/fonts
node tools/sizes.mjs build/out/fmt/plain.fmt build/out/build/texprod.wasm
node tools/tex-run.mjs build/out/build build/out/probe-tikz "&plain probe-tikz" build/out/fonts "$TL/tex/plain/pgf" "$TL/tex/generic/pgf"
node tools/tex-run.mjs build/out/build build/out/probe-latex "latex.ltx" build/out/fonts "$TL/tex/latex/base" "$TL/tex/latex/l3kernel" "$TL/tex/generic/hyphen"
```

Each measure job runs these commands with `node` or `bun`:

```sh
tools/build.mjs build/src build/rebuild
tools/compare-builds.mjs build/out/build/build.json build/rebuild/build.json
tools/trip.mjs build/rebuild build/src/tex build/results/trip
tools/render.mjs build/rebuild build/out/fmt/plain.fmt samples/labels.tex build/out/fonts build/results/render 20
```

## Deviations from the design and the plan

1. **Banner.** The brief of the trial forbids the name TeX for a changed build. `changes/tex-system.ch` sets the banner to `SET`. The design permits the name TeX after a trip test pass. The banner is the only difference in the trip logs.
2. **Glue ratio.** The build stores `real` in 32 bits (see "The glue ratio"). The design says nothing about the width of `real`.
3. **Non-local gotos.** `tex.web` jumps to `end_of_TEX` and `final_end` from inside procedures. `changes/tex-system.ch` replaces these jumps with a call of the host function `host_exit`. The host stops the WASM run with an exception. `changes/dvitype.ch` does the same for `dvitype`.
4. **File names.** `tikz.tex` reads `\input{pgf.tex}` with braces, which is TeX Live syntax. The virtual file system of the trial removes the braces from a file name.
5. **Circuit.** The trial replaces the circuit sample with a plain TeX proxy, because the format of the design cannot build.
6. **TeX Live year.** The CI job uses the TeX Live 2023 file tree of Ubuntu 24.04 (apt). The local probes use the current `tlnet` archives. The CI job and the local probes give the same first errors.
7. **Fonts.** The render needs `cmr5.pfb` for the second-level subscripts. The font set of the design must hold each size that the format can select.
8. **Date.** The host gives no date to TeX. TeX keeps the default of `tex.web` section 241 (4 July 1776, 12:00). Thus each run gives the same bytes.

## Changes required before the design can hold

1. **The engine needs e-TeX and the pdfTeX utility primitives.** LaTeX, `expl3`, `tikz` and `circuitikz` need e-TeX and the pdfTeX utility primitives. Two ways are open:
   - Apply `etex.ch` (the e-TeX change file) to `tex.web`. The licence of `etex.ch` permits copying of the unchanged file. The build must then pass the e-TeX test `etrip` as well as `trip`. Add the utility primitives that `l3bootstrap.dtx` lists (`\expanded`, `\pdfstrcmp`, `\pdffilesize` and others) in a separate change file of the engine. pdfTeX is GPL, so the engine must write these primitives from their documented behaviour, not copy them.
   - Use the Prote change files, which add the same set to e-TeX. The trial found no licence statement for Prote: the page `ctan.org/pkg/prote` gave HTTP 404, and a web search found no licence page.
   The design says "the engine borrows only the program source, `tex.web`". Change this sentence in a separate design commit.
2. **The name rule.** The design permits the name TeX after a trip test pass. The brief of the trial forbids the name TeX. Record one rule and the name of the engine build in the design.
3. **The font set.** Add each CM size that `plain.fmt` and the LaTeX format load (for example `cmr5`, `cmmi5`, `cmsy5`) to the font bundle.
4. **Font cache.** Keep the parsed Type 1 fonts between renders. The warm SVG time then drops by the font read time.
5. **I12 gate.** Keep the trip test on each WASM build, as the design says. Add the `etrip` test when e-TeX is in the build.

## Files

- `trials/t5-tex-build/config.json`, `trials/t5-tex-build/.gitattributes`.
- `trials/t5-tex-build/tools/`: `tangle.mjs`, `tangle-cli.mjs`, `pascal.mjs`, `wasm.mjs`, `compile-cli.mjs`, `build.mjs`, `trip.mjs`, `linediff.mjs`, `run-texware.mjs`, `tex-run.mjs`, `render.mjs`, `sizes.mjs`, `compare-builds.mjs`.
- `trials/t5-tex-build/runtime/`: `host.mjs`, `run.mjs`, `vfs.mjs`, `tfm.mjs`, `type1.mjs`, `dvi2svg.mjs`.
- `trials/t5-tex-build/changes/`: `tex-system.ch`, `tex-trip.ch`, `tex-prod.ch`, `dvitype.ch`.
- `trials/t5-tex-build/samples/labels.tex`, `trials/t5-tex-build/samples/probe-tikz.tex`.
- `trials/t5-tex-build/test/type1.test.mjs`.
- `.github/workflows/trial-t5.yml`.
