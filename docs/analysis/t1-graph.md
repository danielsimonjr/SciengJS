# T1 graph: trial report

## Question

Does `@viz-js/viz` render DOT under Bun and under Node 22, on Windows, Linux and macOS?

Exit numbers:

- First-render time.
- Warm-render time.
- Package size, and the WASM part.
- One SVG compared with the Graphviz CLI output of the same source.

Design check: an `image` attribute cannot fetch a file, and the SVG output references it.

## Verdict

**The trial answers the question. The graph stage design holds for rendering.**

- `@viz-js/viz` 3.31.0 rendered all three sources under Bun 1.4.4 and Node 22.23.4 on Windows, Linux and macOS (six CI jobs, all green).
- The SVG bytes are identical across all six jobs for each source (SHA-256 in table 3).
- The `image` attribute cannot fetch a file. The default render gives a warning and no `<image>` element. A render with the image size declared keeps the `href` as text. The design must keep the planned removal of `image` attributes.

Three findings change the plan:

1. **The viz layout does not match the Graphviz CLI layout.** The CLI here is Graphviz 2.43.0. The viz build is Graphviz 16.1.0. Node positions differ. The I1 gate must use SVG files that viz produced, not CLI files.
2. **A 200-node graph takes 12 s to 51 s per warm render.** Graphviz CLI takes about the same time on the same graph. The WASM build adds no visible cost. Timeouts in the design must allow this time.
3. **Local timings vary by a factor of about three between runs.** One local run gave 153 s for the 200-node graph. Another run on the same machine gave 51 s. The cause is not measured.

## Platform and versions

| Item | Value | Source |
|---|---|---|
| `@viz-js/viz` | 3.31.0, exact pin | `trials/t1-graph/package.json` |
| Graphviz inside viz | 16.1.0 | `graphvizVersion` in each JSON line |
| Graphviz CLI (Linux CI) | 2.43.0 (apt package on `ubuntu-latest`) | `results/graphviz-cli-version.txt` |
| Bun | 1.4.4 | `bun --version` step, workflow input |
| Node | 22.23.4 in CI; v26.13.0 local | `nodeVersion` in each JSON line |
| Windows CI | `windows-latest`, x64 | `platform` and `arch` |
| Linux CI | `ubuntu-latest`, x64 | `platform` and `arch` |
| macOS CI | `macos-latest`, arm64 | `platform` and `arch` |
| Local machine | Windows 11, x64 | `platform` and `arch` |

The image names (`windows-latest` and the others) do not record the exact OS build. The JSON lines do not record it either.

## Number table

Source key: `small` is a 3-node graph. `large100` is a generated 100-node graph (199 edges). `large200` is a generated 200-node graph (399 edges). The generator is `trials/t1-graph/make-sources.mjs`.

All times are in milliseconds. "Warm median" is the median of the warm renders. The `small` source has 20 warm renders. The generated graphs have 3 warm renders each, to keep the CI jobs inside the timeout.

### Table 1: CI, one row per runtime and OS

Run id: `41363808474`, head `660792f`. Each job is a row. "Job id" is the GitHub job id.

| OS | Runtime | Job id | First render | Small, warm | large100, warm | large200, warm |
|---|---|---|---|---|---|---|
| Windows | Bun 1.4.4 | 125019612677 | 68.439 | 0.619 | 615.562 | 30709.039 |
| Windows | Node 22.23.4 | 125019612750 | 132.727 | 1.215 | 1121.286 | 17540.828 |
| Linux | Bun 1.4.4 | 125019612519 | 77.342 | 0.762 | 698.470 | 14770.277 |
| Linux | Node 22.23.4 | 125019612878 | 76.421 | 0.405 | 572.605 | 12941.728 |
| macOS (arm64) | Bun 1.4.4 | 125019612713 | 114.539 | 1.193 | 2257.489 | 41767.329 |
| macOS (arm64) | Node 22.23.4 | 125019612622 | 50.654 | 0.516 | 920.574 | 34440.141 |

Source: each job's `results/*.jsonl` file in the artifact `t1-<os>-<runtime>`, read from the downloaded artifacts.

### Table 2: local runs (Windows x64)

| Run | Runtime | First render | Small, warm | large100, warm | large200, warm | Source file |
|---|---|---|---|---|---|---|
| L1 | Bun 1.4.4 | 1453.589 | 5.868 (20 runs) | not measured | 153300.366 (20 runs) | `agent-t1/local-bun.jsonl` |
| L2 | Bun 1.4.4 | 251.307 | 1.377 | 1957.282 | 50761.353 | `agent-t1/local-bun-v2.jsonl` |
| L3 | Node v26.13.0 | 117.030 | 1.296 | 2189.770 | 44029.160 | `agent-t1/local-node-v26.jsonl` |

L1 used 20 warm renders for the 200-node graph. L2 and L3 used 3. L1 is the first run of the trial. The L1 time is not reproducible: L2 on the same machine gave 51 s. Node 22 was not run locally. Node v26 is the local Node runtime.

### Table 3: other fixed facts

| Fact | Value | Source |
|---|---|---|
| Package size on disk, `@viz-js/viz` | 4,994,623 bytes | `packageBytes`, same in all runs |
| WASM bytes in `dist/viz.js` | 1,091,685 bytes, magic `\0asm` | `wasm`, same in all runs |
| `dist/viz.js` file size | 1,188,719 bytes | `ls` of the installed package |
| SVG SHA-256, `small` | `239e2702ce1eca7562c16e74955c01ec98fa4b02b2527c9e3fa581d6316c4d75` | `svgSha256`, identical in all 6 CI jobs and in L1 to L3 |
| SVG SHA-256, `large100` | `98e9009bac476626e7cdd34e0b1ccafaf11dbf58c8ff19735be64b3fdf5e226a` | `svgSha256`, identical in all 6 CI jobs and in L2, L3 |
| SVG SHA-256, `large200` | `6fa5e0cbac3693578f076cba8ce139ed1de8b0e37d0276370afbd724afbf3720` | `svgSha256`, identical in all 6 CI jobs and in L2, L3 |

L1 gave the same `small` SHA-256 as the CI jobs. Its `large200` hash (`a944d7...`) differs from the CI hash. The cause is the graph name. L1 ran the first script version, which named the graph `Large`. The committed `large200.dot` names it `Large200`. Renaming `Large200` to `Large` in the CI SVG gives the L1 hash exactly (checked). L1 is excluded from the byte comparison.

The WASM is embedded as a string literal inside `dist/viz.js`. There is no separate `.wasm` file. The WASM part is the 1,091,685 bytes above. The package size is 4,994,623 bytes.

## Graphviz CLI comparison

The Linux CI job renders the same committed sources with `dot -Tsvg`. The comparison script is `trials/t1-graph/compare-layout.mjs`. It takes the node centres, normalizes them to the node bounding box, and compares them with a tolerance of 0.5 pt.

### Layout result

| Source | Viz nodes | CLI nodes | Within 0.5 pt | Largest difference | Identical layout |
|---|---|---|---|---|---|
| small | 3 | 3 | 1 of 3 | 8.46 pt (node `c`) | no |
| large100 | 100 | 100 | 0 of 100 | 395.1 pt | no |
| large200 | 200 | 200 | 0 of 200 | 1147 pt | no |

The Bun job and the Node job give the same result. The viz SVG is the same in both jobs, and the CLI runs once in each job. Source: `results/layout-*.json` in the artifacts for `t1-ubuntu-latest-bun` and `t1-ubuntu-latest-node`.

The node sets are equal. Every node exists in both outputs. The positions differ. The likely cause is the version gap, Graphviz 16.1.0 against 2.43.0. The trial did not test this cause. A test would need a Graphviz 16.1.0 CLI build.

### CLI timing on the Linux runner

Each CLI time is one run, including process start.

| Source | `dot -Tsvg` (Bun job) | `dot -Tsvg` (Node job) | Viz warm median (Bun job) | Viz warm median (Node job) |
|---|---|---|---|---|
| small | 310 ms | 271 ms | 0.762 ms | 0.405 ms |
| probe | 11 ms | 9 ms | not timed | not timed |
| large100 | 569 ms | 420 ms | 698.470 ms | 572.605 ms |
| large200 | 14861 ms | 12201 ms | 14770.277 ms | 12941.728 ms |

The CLI is about as fast as viz on the 200-node graph. The layout work dominates the time. The WASM build adds no visible cost on this graph. The small-graph CLI time includes process start. Thus the CLI time is larger than the viz warm time.

## Image attribute probe

Source: `trials/t1-graph/probe.dot`, a box node with `image="probe-image.png"`. The file `probe-image.png` exists in the trial folder, which is a 1 by 1 PNG.

| Render | Status | `<image>` element | `href` in SVG | Warnings |
|---|---|---|---|---|
| viz, default options | success | none | none | 2 |
| viz, with `images` size declared | success | present | `probe-image.png` | none |
| Graphviz CLI 2.43.0, default | success | present | `probe-image.png` | none |

The default viz warnings are:

- "No such file or directory while opening probe-image.png"
- "No or improper image=\"probe-image.png\" for node \"p\""

The viz WASM has no access to the file system. Graphviz tried to open the file and failed. The data URI check found no `data:image` in any probe output.

The result confirms the design. The SVG references the file as text when the caller declares its size. The backend must remove the `image` attribute and the `<image>` element before it returns the SVG.

## Commands that reproduce the numbers

From `trials/t1-graph/` after `npm ci`:

```sh
node make-sources.mjs                              # writes large100.dot and large200.dot
bun measure.mjs --svg-dir out                      # JSON line on stdout
node measure.mjs --svg-dir out                     # same script under Node
```

Linux CLI comparison, from the same folder:

```sh
dot -V
dot -Tsvg small.dot -o out/cli.small.svg
dot -Tsvg large200.dot -o out/cli.large200.svg
node compare-layout.mjs out/bun.small.viz.svg out/cli.small.svg
```

The CI workflow is `.github/workflows/trial-t1.yml`. The workflow runs only on a push to `trial/t1-graph`. Run `41363808474` used head `660792f`.

## Limits of the trial

- The CLI and viz differ in version (2.43.0 and 16.1.0). The layout comparison does not isolate the cause.
- The CLI time is one run. The viz time is a median of 3 runs for the large graphs.
- Node 22 numbers come from CI only. The local runs used Node v26.13.0.
- The local timings vary by about a factor of three between runs. The trial did not find the cause.
- The OS images are not pinned to a build number.
