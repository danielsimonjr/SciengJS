# T6 e-TeX build: trial report

## Question

Does the T5 toolchain build `tex.web` with `etex.ch` and the utility primitives to WASM that passes the trip test and the e-TRIP test? Can that build make the LaTeX format in extended mode? Can it render one `circuitikz` circuit under Bun 1.4.4 and Node 22, with each glyph as a `<path>`?

Exit numbers:

- The trip and e-TRIP results (the differences from the reference logs).
- The set of utility primitives, and the kernel test that needs each primitive.
- The pgf DVI driver file that the format selects.
- The WASM size.
- The format build time and the compressed format size.
- The first-render time and the warm-render time of the circuit.
- The glyph check.

Design sources: `docs/superpowers/specs/2026-11-01-scieng-engine-design.md`, section "tex". Plan: `docs/superpowers/plans/2026-11-01-scieng-engine-build.md`, row "T6 e-TeX build" and the risk row of the e-TRIP test.

## Verdict

**The trial holds.**

- The T5 tangler and compiler build `tex.web` with `etex.ch` and four engine change files. The build needs one fix in the tangler (see "Changes to T5").
- The trip build passes the e-TRIP gate in all three parts of `etripman.tex`. The parts are the trip test in compatibility mode, the trip test in extended mode, and `etrip.tex`. Each remaining difference is in one of the classes of the gate (see "Corrections to the brief" and "Trip and e-TRIP").
- The engine adds five utility primitives. The LaTeX kernel of TeX Live 2023 needs each of them (see "Utility primitives").
- The production build makes `scieng.fmt` from `latex.ltx`, `xcolor`, `tikz` and `circuitikz` in extended mode. The format selects the pgf driver `pgfsys-dvisvgm.def`.
- The circuit renders. Each of the 10 glyphs is one `<path>`. The SVG holds no `<text>` element. Node and Bun give the same format bytes and the same SVG bytes.

The numbers come from CI run `41527360451` (head `3ce19c5`), conclusion `success`. The local numbers come from one Windows x64 computer with Node 26.13.0 and Bun 1.4.4.

## Corrections to the brief

The brief has three rules that the trial cannot keep as written. The trial keeps the intent of each rule as follows.

1. **"The trip gate fails on any difference other than the banner."** An e-TeX build cannot meet this rule. `etripman.tex` lists the differences that a correct build gives:
   - Appendix A.3: in compatibility mode, the string statistics and the capacity lines differ from `trip.log` of `tex.web`.
   - Appendix A.4: in extended mode, the memory words grow by `\extramw` (38) and the control sequences grow by `\extracs` (66). The stack positions grow by `\extrabf` (23) and `\extrasv` (2). New "restoring" and group lines show.
   - Appendix B.9: in `etrip.tex`, the glue set values can differ in rounding, and the memory statistics of the reference build differ.

   TeX Live records the differences of its own build in `etrip/etrip.diffs`. The gate (`tools/etrip-gate.mjs`) allows these classes and three more:
   - The build stamps: the banner, the dates and times, the `./` prefix of file names and the version string of DVItype.
   - The echo of the terminal input in the `.fot` files.
   - The start message of `etrip.tex`. This class is a decision of the trial, not a rule of `etripman.tex` or `etrip.diffs`. The reference `etrip.log` of the tarball is from 2014-01-22, but its `etrip.tex` is from 2021-01-28. The gate accepts only the message that the pinned `etrip.tex` prints.

   The gate reads the four numbers from `etripman.tex` and the hunks from `etrip.diffs`. The gate adds the count of the new primitives (5) to the control sequence delta. The gate fails on any other line. A gate run with 4 or 6 new primitives fails with 4 problems.
2. **"Implement exactly the primitives that `latex.ltx` tests for at format-build time."** This set is too small. The format build needs three primitives. The `\everyjob` code of the L3 kernel needs two more primitives at the start of each document: `\creationdate` and `\shellescape`. The code that needs `\creationdate` is at `expl3-code.tex` lines 7880 to 7887. The code that needs `\shellescape` is at `expl3-code.tex` lines 7921 to 7931. The `\everyjob` code uses `\tex_creationdate:D` and `\tex_shellescape:D` directly, with no test that the primitive exists. Thus each document starts with a TeX error when the engine does not have them. The trial adds these five primitives and no others.
3. **"The same TeX Live year as T5."** T5 uses two sources (T5 deviation 6). CI uses the Ubuntu packages of TeX Live 2023. The local computer uses the current tlnet. T6 pins TeX Live 2023 for every file: the frozen `tlnet-final` archives and the source tarball `texlive-20230313-source.tar.xz`. The frozen archives do not change, so the sha256 pins stay valid.

## Platform and versions

| Item | Value |
|---|---|
| TeX Live | 2023 (historic: `tlnet-final` archives and the 2023-03-13 source tarball) |
| `etex.ch` | from the source tarball, 6371 lines, sha256 `cc5e96c0fec01acb` |
| `tex.web` and the TeXware | the Knuth files of T5 (same pins) |
| LaTeX kernel | `latex.ltx` and `expl3-code.tex` of the `latex` and `l3kernel` archives |
| pgf | 3.1.10 (2023-01-15) |
| Node | 22.23.4 in CI; 26.13.0 on the local computer |
| Bun | 1.4.4 |

## CI runs and jobs

Run `41527360451` (head `3ce19c5`), conclusion `success`. The earlier run `41526202613` (head `4e89665`, the sample without the `dvisvgm` option) also passed, with the same format and SVG bytes.

Each measure job fetches and builds again, compares the WASM sha256 with the build job, runs e-TRIP, builds the format and renders. It then compares the format and the SVG byte for byte with the build job.

| Job | ID | Same WASM | e-TRIP | Format build | Same format | Same SVG |
|---|---|---|---|---|---|---|
| build (ubuntu, Node 22) | 125558435256 | reference | pass | 9.2 s | reference | reference |
| ubuntu, Node 22 | 125559630335 | yes | pass | 8.1 s | yes | yes |
| ubuntu, Bun 1.4.4 | 125559630536 | yes | pass | 7.0 s | yes | yes |
| windows, Node 22 | 125559630587 | yes | pass | 4.7 s | yes | yes |
| windows, Bun 1.4.4 | 125559630408 | yes | pass | 7.3 s | yes | yes |
| macos, Node 22 | 125559630366 | yes | pass | 12.4 s | yes | yes |
| macos, Bun 1.4.4 | 125559630583 | yes | pass | 12.6 s | yes | yes |

## Build

The build is `tools/build.mjs`. The build script applies the change files in this order:

| Program | Change files |
|---|---|
| `etextrip` | `etex.ch`, `changes/etex-system.ch`, T5 `changes/tex-trip.ch`, `changes/etex-trip.ch`, `changes/utility.ch` |
| `setprod` | `etex.ch`, `changes/etex-system.ch`, T5 `changes/tex-prod.ch`, `changes/utility.ch` |
| `pltotf`, `tftopl`, `dvitype` | as in T5 |

`etex.ch` stays unchanged, as its copyright note requires. Each engine change file holds one concern:

- `etex-system.ch`: the banner `This is SET, Version 3.141592653-2.6`, the 8-bit character set and the exit through the host. It also adds the expansion depth counter that `etex.ch` expects from a system change file.
- `etex-trip.ch`: the larger string pool that the extended mode needs for the trip test (`max_strings` 3200, `pool_size` 40000).
- `utility.ch`: the five utility primitives.

`\eTeXversion` and `\eTeXrevision` stay as `etex.ch` defines them. The engine has no `\pdftexversion`.

### WASM size

| Program | Bytes | gzip -9 | brotli 11 | sha256 (first 16) |
|---|---|---|---|---|
| `etextrip` | 224,723 | 73,807 | 60,601 | `e3ebf874f9fc6ce6` |
| `setprod` | 234,513 | 72,567 | 59,492 | `2db96e5a89a68f11` |
| `pltotf` | 29,899 | 9,742 | 7,857 | `300cdd712284c945` |
| `tftopl` | 22,777 | 7,496 | 6,179 | `0a3d29b11a353704` |
| `dvitype` | 24,717 | 9,318 | 7,722 | `eee181005afc1684` |

The T5 `texprod` build is 194,463 bytes. `etex.ch` and `utility.ch` add 40,050 bytes to the production build.

## Trip and e-TRIP

`tools/etrip.mjs` runs the steps of `etripman.tex`, Appendices A and B, on `etextrip`. `tools/etrip-gate.mjs` judges each output.

| Output | Reference | Removed | Added | Gate problems |
|---|---|---|---|---|
| `ctripin.log` | `tripin.log` (tex.web) | 2 | 2 | 0 |
| `ctripin.fot` | `tripin.fot` | 2 | 2 | 0 |
| `ctrip.log` | `trip.log` | 3 | 3 | 0 |
| `ctrip.fot` | `trip.fot` | 1 | 1 | 0 |
| `ctrip.typ` | `trip.typ` | 0 | 0 | 0 |
| `ctripos.tex` | `tripos.tex` | 0 | 0 | 0 |
| `xtripin.log` | `ctripin.log` | 9 | 4 | 0 |
| `xtrip.log` | `ctrip.log` | 23 | 19 | 0 |
| `xtrip.fot` | `ctrip.fot` | 2 | 6 | 0 |
| `xtrip.typ` | `ctrip.typ` | 0 | 0 | 0 |
| `xtripos.tex` | `tripos.tex` | 0 | 0 | 0 |
| `eetripin.log` | `etripin.log` | 9 | 9 | 0 |
| `eetrip.log` | `etrip.log` | 34 | 32 | 0 |
| `eetrip.fot` | `etrip.fot` | 6 | 5 | 0 |
| `eetrip.typ` | `etrip.typ` | 2 | 2 | 0 |
| `eetrip.out` | `etrip.out` | 0 | 0 | 0 |

The differences, by class:

- Part 1 (compatibility mode): the banner, the string statistics (`1444 strings of total length 25253` against `1326 strings of total length 23633`) and two capacity lines. `trip.typ` has no difference.
- Part 2 (extended mode): the memory words grow by 38 (471 to 509, 96 to 134). The multiletter control sequences grow by 71 (372 to 443): 66 from `etex.ch` and 5 from `utility.ch`. The stack positions grow by 23 and 2. The "restoring", "display" and group lines of etripman A.4 show.
- Part 3 (`etrip.tex`): the banner and the dates, the file names without `./`, and the message of `etrip.tex`. The reference log is from 2014 and the input file is from 2021-01-28. The glue set rounding differs (`1635.4` to `1635.40002`). The memory statistics and the count offsets of the reference build differ (control sequences +1, hyphenation exceptions -1). The `\openout` lines and one "begin denominator" line are in `etrip.diffs`.

## Utility primitives

Each primitive follows its published behaviour. The source is the pdfTeX user manual (`pdftex-t.tex` of the TeX Live 2023 `pdftex.doc` archive). The trial reads the manual for the behaviour only. No code comes from `pdftex.web` or from any GPL source.

| Primitive | Kernel test that needs it | Published behaviour (pdfTeX manual) | Engine behaviour |
|---|---|---|---|
| `\expanded` | `expl3-code.tex` line 187: `\csname expanded\endcsname` must not be `\relax`, else the L3 kernel stops | line 4099: "expands tokens in the same way as `\message`"; `\protected` macros do not expand | a third code of `expand_after`; scans a general text with expansion and puts the list back |
| `\filesize` | `latex.ltx` lines 1131 to 1136: `\pdffilesize` or `\filesize` must be defined, else `expl3.ltx` does not load | line 3962: "expands to the size of the file"; empty when the file is not there | a `convert` code; counts the bytes of the file |
| `\pdfstrcmp` | `expl3-code.tex` line 823 maps only this name to `\tex_strcmp:D`; line 4856 defines `\__str_if_eq:nn` with `\pdfstrcmp`; the first use at line 7571 fails without `\pdfstrcmp` | line 3820: expands to 0 when the two strings are equal, -1 when the first ranks before the second, 1 otherwise | a `convert` code; compares the two expanded texts |
| `\creationdate` | `expl3-code.tex` lines 7880 to 7887, in `\everyjob` | `\pdfcreationdate`: the date in the PDF form `D:YYYYMMDDHHmmSS` | a `convert` code; prints `D:` and the job date and time, then `00Z` |
| `\shellescape` | `expl3-code.tex` lines 7921 to 7931, in `\everyjob` | `\pdfshellescape`: 0 when shell commands are off | `char_given` 0; the engine never runs shell commands |

The names come from the L3 kernel name list (`expl3-code.tex` lines 893 to 902). `\pdfstrcmp` keeps the `pdf` prefix because the L3 kernel maps only that name.

## pgf DVI driver

The format passes the option `dvisvgm` to `graphics`, `graphicx`, `color` and `xcolor` (`format/scieng.ini`). The format log shows:

- `Package xcolor Info: Driver file: dvisvgm.def`
- `Package graphics Info: Driver file: dvisvgm.def`
- `Driver file for pgf: pgfsys-dvisvgm.def`

The pinned pgf code selects this file in two steps. `pgfsys.code.tex` lines 1749 to 1757 call `\pgfutil@guessdriver`. `pgfutil-latex.def` lines 196 to 198 set the driver to `pgfsys-\Gin@driver`, the name of the graphics driver.

`pgfsys-dvisvgm.def` writes `dvisvgm:raw` and `dvisvgm:bbox` specials. The `color` specials come from `dvisvgm.def`. The trial DVI to SVG converter reads the specials through `runtime/dvisvgm-specials.mjs`. The circuit DVI holds 110 specials. The converter ignores two: `papersize=...` and `ps::%%HiResBoundingBox`. The sample loads `standalone` with the option `dvisvgm`, so the L3 kernel loads `l3backend-dvisvgm.def`. Without the option, the L3 kernel loads `l3backend-dvips.def`, which adds one more ignored special (`header=l3backend-dvips.pro`). The SVG is the same with and without the option.

## Format

| Item | Value |
|---|---|
| Command | `setprod "*scieng.ini"` (the `*` starts extended mode) |
| Files read | 152 |
| Format bytes | 24,361,080 |
| gzip -9 | 6,460,595 (Node zlib) |
| brotli 11 | 3,746,285 |
| sha256 (first 16) | `cec00440913c954c`, the same under Node and Bun |
| Build time, CI | 4.7 s to 12.6 s over the seven jobs; median 8.1 s (see "CI runs and jobs") |
| Build time, local | 11.6 s (Node), 36.1 s (Bun); other local runs gave 13.9 s to 73 s under load |

The format holds 558,062 words of font information for 36 fonts. Most of these words are not font data. The L3 kernel keeps its integer arrays in the `\fontdimen` parameters of small dummy fonts (`expl3-code.tex` line 14928, `\__intarray_entry:w` is `\tex_fontdimen:D`).

## Render

The render is T5 `tools/render.mjs` with `TEX_PROGRAM=setprod` and `DVI_SPECIALS=runtime/dvisvgm-specials.mjs`. One first render and 20 warm renders.

| Runtime | First TeX | First SVG | Warm TeX (median) | Warm SVG (median) |
|---|---|---|---|---|
| build job, ubuntu, Node 22 | 276.7 ms | 13.0 ms | 244.8 ms | 5.5 ms |
| ubuntu, Node 22 | 274.1 ms | 13.7 ms | 245.6 ms | 5.7 ms |
| ubuntu, Bun 1.4.4 | 206.5 ms | 11.5 ms | 168.7 ms | 3.4 ms |
| windows, Node 22 | 155.9 ms | 9.2 ms | 143.5 ms | 3.9 ms |
| windows, Bun 1.4.4 | 257.0 ms | 16.9 ms | 185.9 ms | 4.3 ms |
| macos, Node 22 | 289.6 ms | 15.8 ms | 330.9 ms | 7.5 ms |
| macos, Bun 1.4.4 | 328.2 ms | 19.6 ms | 271.3 ms | 3.9 ms |
| Node 26.13.0, local | 334.5 ms | 15.4 ms | 293.1 ms | 9.2 ms |

## Glyph check

| Item | Value |
|---|---|
| Glyph paths | 10 |
| `<path>` elements | 16 |
| `<text>` elements | 0 |
| `font-family` | 0 |
| Missing outlines | none |
| Fonts | `cmmi10`, `cmmi7`, `cmr7` (AMS Type 1) |
| Same SVG in each run | yes |
| SVG sha256 (first 16) | `f3896ab85341d476`, the same under Node and Bun |

A headless browser shows the divider: the source, two resistors and the labels.

## Licences

| Input | Licence (verbatim, with the place) |
|---|---|
| `etex.ch` | lines 6 to 10: "e-TeX is copyright (C) 1999-2012 by P. Breitenlohner (1994,98 by the NTS team); all rights are reserved. Copying of this file is authorized only if (1) you are P. Breitenlohner, or if (2) you make absolutely no changes to your copy. (Programs such as TIE allow the application of several change files to tex.web; the master files tex.web and etex.ch should stay intact.)" |
| `etripman.tex` | lines 100 to 102: e-TeX "is in the public domain, and its algorithms (beyond those of TeX) are published". Lines 116 to 119: "We have copyrighted the program ... we explicitly authorize copying of correct e-TeX implementations, and not of incorrect ones!" |
| `etrip.diffs`, `etriptest.test` | line 5: "You may freely use, modify and/or distribute this file." |
| `etrip.tex`, `etrip.pl`, the reference logs | no licence line; distributed with `etripman.tex` in the TeX Live source |
| `pdftex-t.tex` (manual) | GNU FDL 1.2; read for the behaviour only, not distributed |
| The 20 package archives | the `catalogue-license` field of each `tlpobj` file: LPPL for babel, firstaid, graphics, graphics-def, l3backend, l3kernel, latex, latex-fonts, standalone, tools, unicode-data, xcolor, xkeyval; LPPL or GPL for circuitikz; LPPL 1.3c, GPL 2 or FDL for pgf; public domain for graphics-cfg; Knuth for cm and knuth-lib; OFL for amsfonts; no field for hyphen-base |

The two licence texts of e-TeX do not agree. `etex.ch` reserves all rights and allows unchanged copies. `etripman.tex` calls the program public domain. The trial keeps the stricter rule: the trial applies `etex.ch` unchanged as a change file and puts every change into its own change files. The trial does not distribute `etex.ch`; the build downloads `etex.ch`. The CI artifact `t6-build` (kept 14 days) holds the Pascal and WASM files that the build makes from `etex.ch`, but not `etex.ch`. The engine does not call itself e-TeX: the banner names SET.

## Downloads

Each download has a sha256 pin in `config.json`. The build checks each pin and stops on a difference. The build never runs a downloaded file. The build extracts the archives with the system `tar`.

- `https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/2023/texlive-20230313-source.tar.xz`, sha256 `3878aa0e1ed0301c053b0e2ee4e9ad999c441345f4882e79bdd1c8f4ce9e79b9`. The build extracts `texk/web2c/etexdir` and `texk/web2c/triptrap/tripos.tex` only.
- 20 archives of `https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/2023/tlnet-final/archive/`: amsfonts, babel, circuitikz, cm, firstaid, graphics-cfg, graphics-def, graphics, hyphen-base, knuth-lib, l3backend, l3kernel, latex-fonts, latex, pgf, standalone, tools, unicode-data, xcolor, xkeyval. The format build and the render read files from each archive.
- The Knuth files of T5 (`trials/t5-tex-build/config.json`).

## Commands

From `trials/t6-etex-build`:

```
node tools/build.mjs build/src build/out/build
node tools/etrip.mjs build/out/build build/out/etrip
TEX_PROGRAM=setprod node ../t5-tex-build/tools/tex-run.mjs build/out/build build/out/fmt "*scieng.ini" format build/src/texmf/tex build/src/texmf/fonts/tfm
TEX_PROGRAM=setprod DVI_SPECIALS=runtime/dvisvgm-specials.mjs node ../t5-tex-build/tools/render.mjs build/out/build build/out/fmt/scieng.fmt samples/circuit.tex build/src/texmf/fonts build/out/render 20 format build/src/texmf/tex
```

Replace `node` with `bun` for the Bun runs.

## Changes to T5

T6 uses the T5 tools by import. These T5 changes do not change a T5 result: the T5 WASM sha256 values, `trip.log` (`672d1d2ed2a0e3a3`) and `labels.svg` (`0f56e8ca90b5832c`) stay the same.

- `tools/tangle.mjs`: a line that ends in `@` starts a module. `tangle.web` adds a space to each input line, so `@` at the end of a line is `@ `. `etex.ch` has such lines. Test: `test/tangle.test.mjs`.
- `tools/build-lib.mjs` and `tools/trip-steps.mjs`: the pinned download, the program build and the trip steps, shared by T5 and T6.
- `runtime/vfs.mjs`: a file name loses its quotes. LaTeX opens `"expl3.ltx"` with quotes.
- `runtime/dvi2svg.mjs`: a hook for `\special` and a unit per point.
- `tools/tex-run.mjs` and `tools/render.mjs`: the environment variables `TEX_PROGRAM` and `DVI_SPECIALS`.

## Deviations from the design and the plan

1. The trip gate rule follows `etripman.tex`, not "the banner only" (see "Corrections to the brief").
2. The primitive set has five primitives, not only the format-build three (see "Corrections to the brief").
3. `\shellescape` is `char_given` 0. `\show\shellescape` prints `\char"0`. The L3 kernel reads only the value of `\shellescape`.
4. `tripos.tex` comes from the TeX Live source tarball. The Knuth files of T5 do not hold `tripos.tex`.
5. `\creationdate` gives the time to the minute. The seconds are `00` and the zone is `Z`.

## Files

- `trials/t6-etex-build/config.json`, `tools/build.mjs`, `tools/etrip.mjs`, `tools/etrip-gate.mjs`, `tools/primitives.mjs`.
- `trials/t6-etex-build/changes/etex-system.ch`, `changes/etex-trip.ch`, `changes/utility.ch`.
- `trials/t6-etex-build/format/scieng.ini`, `format/language.dat`, `samples/circuit.tex`.
- `trials/t6-etex-build/runtime/dvisvgm-specials.mjs`.
- `trials/t6-etex-build/test/etrip-gate.test.mjs`, `test/primitives.test.mjs`, `test/dvisvgm-specials.test.mjs`.
- `trials/t5-tex-build/tools/build-lib.mjs`, `tools/trip-steps.mjs`, `test/tangle.test.mjs`.
- `.github/workflows/trial-t6.yml`.
